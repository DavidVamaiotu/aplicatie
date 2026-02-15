import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampaignRule {
    attribute: string;        // e.g. 'orderCount', 'accountCreatedAt', 'lastOrderDate'
    operator: "==" | "!=" | ">" | "<" | ">=" | "<=";
    value: unknown;           // number, boolean, or string like '15_days_ago'
    type: "number" | "boolean" | "date_math" | "string";
}

interface Campaign {
    id: string;
    name: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    isActive: boolean;
    validUntil: admin.firestore.Timestamp;
    canStack: boolean;
    maxUsesPerUser: number;
    globalMaxUses: number;
    currentGlobalUses: number;
    rules: CampaignRule[];
    roomTags?: number[];      // array of room IDs this campaign applies to
}

// ─── Rule Evaluation Helpers ────────────────────────────────────────────────

/**
 * Parse a date_math target value like '15_days_ago' or '30_days_ago'
 * into a concrete Date.
 */
function parseDateMathValue(value: string): Date {
    const match = value.match(/^(\d+)_days_ago$/);
    if (!match) {
        throw new Error(`Invalid date_math target value: ${value}`);
    }
    const daysAgo = parseInt(match[1], 10);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
}

/**
 * Coerce a Firestore field value to the expected type for comparison.
 */
function coerceUserValue(
    value: unknown,
    type: CampaignRule["type"]
): number | boolean | Date | string {
    switch (type) {
        case "number":
            return typeof value === "number" ? value : Number(value) || 0;
        case "boolean":
            return Boolean(value);
        case "date_math": {
            // The user field should be a Timestamp or ISO string
            if (value instanceof admin.firestore.Timestamp) {
                return value.toDate();
            }
            if (typeof value === "string") {
                return new Date(value);
            }
            if (value instanceof Date) {
                return value;
            }
            return new Date(0); // fallback: epoch means "very old"
        }
        case "string":
            return String(value ?? "");
        default:
            return String(value ?? "");
    }
}

/**
 * Compare two values with the given operator.
 * For date_math: the targetValue is parsed from strings like '15_days_ago'.
 */
function evaluateRule(
    userValue: unknown,
    rule: CampaignRule
): boolean {
    const { operator, value: targetValue, type } = rule;

    if (type === "date_math") {
        const userDate = coerceUserValue(userValue, "date_math") as Date;
        const targetDate = parseDateMathValue(String(targetValue));

        switch (operator) {
            case "<": return userDate.getTime() < targetDate.getTime();
            case "<=": return userDate.getTime() <= targetDate.getTime();
            case ">": return userDate.getTime() > targetDate.getTime();
            case ">=": return userDate.getTime() >= targetDate.getTime();
            case "==": return userDate.getTime() === targetDate.getTime();
            case "!=": return userDate.getTime() !== targetDate.getTime();
            default: return false;
        }
    }

    if (type === "number") {
        const a = coerceUserValue(userValue, "number") as number;
        const b = Number(targetValue);
        switch (operator) {
            case "==": return a === b;
            case "!=": return a !== b;
            case ">": return a > b;
            case "<": return a < b;
            case ">=": return a >= b;
            case "<=": return a <= b;
            default: return false;
        }
    }

    if (type === "boolean") {
        const a = coerceUserValue(userValue, "boolean") as boolean;
        const b = Boolean(targetValue);
        switch (operator) {
            case "==": return a === b;
            case "!=": return a !== b;
            default: return false;
        }
    }

    // string comparison
    const a = String(userValue ?? "");
    const b = String(targetValue ?? "");
    switch (operator) {
        case "==": return a === b;
        case "!=": return a !== b;
        default: return false;
    }
}

/**
 * Evaluate ALL rules for a campaign against a user profile.
 * All rules must pass (AND logic).
 */
function evaluateAllRules(
    userProfile: Record<string, unknown>,
    rules: CampaignRule[]
): boolean {
    return rules.every((rule) => {
        const userValue = userProfile[rule.attribute];
        return evaluateRule(userValue, rule);
    });
}

// ─── Cloud Functions ────────────────────────────────────────────────────────

/**
 * evaluateUserDiscounts
 *
 * Callable function that returns all eligible discount campaigns for the
 * authenticated user. Trusts NO client payload — reads everything server-side.
 *
 * Input: none (userId derived from request.auth.uid)
 * Output: array of eligible campaign objects
 */
export const evaluateUserDiscounts = onCall(
    { region: "europe-west1" },
    async (request) => {
        // 1. Auth check
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be signed in.");
        }
        const userId = request.auth.uid;

        // 2. Fetch user profile from Firestore — DO NOT trust client data
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            throw new HttpsError("not-found", "User profile not found.");
        }
        const userProfile = userDoc.data() as Record<string, unknown>;

        // 3. Fetch all active, unexpired campaigns
        const now = admin.firestore.Timestamp.now();
        const campaignsSnap = await db
            .collection("campaigns")
            .where("isActive", "==", true)
            .where("validUntil", ">", now)
            .get();

        if (campaignsSnap.empty) {
            return { discounts: [] };
        }

        // 4. Fetch all discount usages for this user (to check per-user limits)
        const usagesSnap = await db
            .collection("discount_usages")
            .where("userId", "==", userId)
            .get();

        // Build a map: campaignId -> number of uses by this user
        const userUsageMap: Record<string, number> = {};
        usagesSnap.forEach((doc) => {
            const data = doc.data();
            const cid = data.campaignId as string;
            userUsageMap[cid] = (userUsageMap[cid] || 0) + 1;
        });

        // 5. Evaluate each campaign's rules
        const eligible: object[] = [];

        for (const doc of campaignsSnap.docs) {
            const campaign = { id: doc.id, ...doc.data() } as Campaign;

            // Check global usage limit
            if (campaign.globalMaxUses > 0 &&
                campaign.currentGlobalUses >= campaign.globalMaxUses) {
                continue;
            }

            // Check per-user usage limit
            const userUses = userUsageMap[campaign.id] || 0;
            if (campaign.maxUsesPerUser > 0 && userUses >= campaign.maxUsesPerUser) {
                continue;
            }

            // Evaluate rules
            if (!campaign.rules || campaign.rules.length === 0) {
                // No rules = available to everyone
                eligible.push({
                    id: campaign.id,
                    name: campaign.name,
                    discountType: campaign.discountType,
                    discountValue: campaign.discountValue,
                    canStack: campaign.canStack,
                    validUntil: campaign.validUntil.toDate().toISOString(),
                    roomTags: campaign.roomTags || [],
                    usesRemaining: campaign.maxUsesPerUser > 0
                        ? campaign.maxUsesPerUser - userUses
                        : null,
                });
                continue;
            }

            if (evaluateAllRules(userProfile, campaign.rules)) {
                eligible.push({
                    id: campaign.id,
                    name: campaign.name,
                    discountType: campaign.discountType,
                    discountValue: campaign.discountValue,
                    canStack: campaign.canStack,
                    validUntil: campaign.validUntil.toDate().toISOString(),
                    roomTags: campaign.roomTags || [],
                    usesRemaining: campaign.maxUsesPerUser > 0
                        ? campaign.maxUsesPerUser - userUses
                        : null,
                });
            }
        }

        return { discounts: eligible };
    }
);

/**
 * applyDiscount
 *
 * Callable function to atomically apply a discount to an order.
 * Uses Firestore transaction to prevent race conditions.
 *
 * Input: { campaignId: string, orderId: string }
 */
export const applyDiscount = onCall(
    { region: "europe-west1" },
    async (request) => {
        // 1. Auth check
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be signed in.");
        }
        const userId = request.auth.uid;
        const { campaignId, orderId } = request.data as {
            campaignId?: string;
            orderId?: string;
        };

        if (!campaignId || !orderId) {
            throw new HttpsError(
                "invalid-argument",
                "campaignId and orderId are required."
            );
        }

        // 2. Idempotent document ID
        const usageDocId = `${campaignId}_${userId}_${orderId}`;

        // 3. Run transaction
        const result = await db.runTransaction(async (transaction) => {
            // 3a. Read campaign
            const campaignRef = db.collection("campaigns").doc(campaignId);
            const campaignSnap = await transaction.get(campaignRef);

            if (!campaignSnap.exists) {
                throw new HttpsError("not-found", "Campaign not found.");
            }
            const campaign = campaignSnap.data() as Campaign;

            // Validate campaign is active
            if (!campaign.isActive) {
                throw new HttpsError(
                    "failed-precondition",
                    "This campaign is no longer active."
                );
            }

            // Validate not expired
            if (campaign.validUntil.toDate() < new Date()) {
                throw new HttpsError(
                    "failed-precondition",
                    "This campaign has expired."
                );
            }

            // Validate global usage limit
            if (
                campaign.globalMaxUses > 0 &&
                campaign.currentGlobalUses >= campaign.globalMaxUses
            ) {
                throw new HttpsError(
                    "resource-exhausted",
                    "This campaign has reached its global usage limit."
                );
            }

            // 3b. Check per-user usage
            const usagesSnap = await transaction.get(
                db
                    .collection("discount_usages")
                    .where("campaignId", "==", campaignId)
                    .where("userId", "==", userId)
            );

            if (
                campaign.maxUsesPerUser > 0 &&
                usagesSnap.size >= campaign.maxUsesPerUser
            ) {
                throw new HttpsError(
                    "resource-exhausted",
                    "You have reached the maximum uses for this discount."
                );
            }

            // 3c. Check idempotency — if this exact usage doc already exists, skip
            const usageRef = db.collection("discount_usages").doc(usageDocId);
            const existingUsage = await transaction.get(usageRef);
            if (existingUsage.exists) {
                // Already applied — return the existing discount info (idempotent)
                return {
                    alreadyApplied: true,
                    discountType: campaign.discountType,
                    discountValue: campaign.discountValue,
                };
            }

            // 3d. Increment global uses
            transaction.update(campaignRef, {
                currentGlobalUses: admin.firestore.FieldValue.increment(1),
            });

            // 3e. Create usage document (idempotent key)
            transaction.set(usageRef, {
                campaignId,
                userId,
                orderId,
                redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                alreadyApplied: false,
                discountType: campaign.discountType,
                discountValue: campaign.discountValue,
            };
        });

        return result;
    }
);

/**
 * toggleCampaignStatus
 *
 * Admin-only callable function to enable/disable a campaign.
 * Acts as an instant kill switch.
 *
 * Input: { campaignId: string, isActive: boolean }
 */
export const toggleCampaignStatus = onCall(
    { region: "europe-west1" },
    async (request) => {
        // 1. Auth + admin check
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be signed in.");
        }
        if (request.auth.token.admin !== true) {
            throw new HttpsError(
                "permission-denied",
                "Only admins can toggle campaign status."
            );
        }

        const { campaignId, isActive } = request.data as {
            campaignId?: string;
            isActive?: boolean;
        };

        if (!campaignId || typeof isActive !== "boolean") {
            throw new HttpsError(
                "invalid-argument",
                "campaignId (string) and isActive (boolean) are required."
            );
        }

        // 2. Update the campaign
        const campaignRef = db.collection("campaigns").doc(campaignId);
        const campaignSnap = await campaignRef.get();

        if (!campaignSnap.exists) {
            throw new HttpsError("not-found", "Campaign not found.");
        }

        await campaignRef.update({ isActive });

        return {
            success: true,
            campaignId,
            isActive,
        };
    }
);

// ─── Push Notification Helpers ──────────────────────────────────────────────

/**
 * Send a push notification to a list of FCM tokens.
 * Automatically cleans up invalid/expired tokens from Firestore.
 */
async function sendToTokens(
    userId: string,
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<number> {
    if (!tokens || tokens.length === 0) return 0;

    const message = {
        tokens,
        notification: { title, body },
        data: data || {},
        android: {
            priority: "high" as const,
            notification: {
                channelId: "marina_park_default",
                priority: "high" as const,
                defaultSound: true,
                defaultVibrateTimings: true,
            },
        },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    const tokensToRemove: string[] = [];
    response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
        if (resp.error) {
            const code = resp.error.code;
            if (
                code === "messaging/invalid-registration-token" ||
                code === "messaging/registration-token-not-registered"
            ) {
                tokensToRemove.push(tokens[idx]);
            }
        }
    });

    // Remove invalid tokens from Firestore
    if (tokensToRemove.length > 0 && userId) {
        const userRef = db.collection("users").doc(userId);
        await userRef.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
        });
    }

    return response.successCount;
}

/**
 * Send a push notification to ALL users that have FCM tokens.
 */
async function broadcastToAll(
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<number> {
    const usersSnap = await db
        .collection("users")
        .where("fcmTokens", "!=", [])
        .get();

    let totalSent = 0;
    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const tokens = userData.fcmTokens as string[];
        if (tokens && tokens.length > 0) {
            totalSent += await sendToTokens(
                userDoc.id,
                tokens,
                title,
                body,
                data
            );
        }
    }
    return totalSent;
}

// ─── Push Notification Cloud Functions ──────────────────────────────────────

/**
 * onNewCampaign
 *
 * Firestore trigger: fires when a new document is created in `campaigns`.
 * Sends a push notification to all users with FCM tokens about the new discount.
 * Notifications are delivered by FCM even when the app is completely killed.
 */
export const onNewCampaign = onDocumentCreated(
    {
        document: "campaigns/{campaignId}",
        region: "europe-west1",
    },
    async (event) => {
        const snap = event.data;
        if (!snap) return;

        const campaign = snap.data();

        // Only notify for active campaigns
        if (!campaign.isActive) return;

        const title = "🎉 Reducere nouă disponibilă!";
        const body = campaign.name
            ? `${campaign.name} — verifică acum în aplicație!`
            : "Ai o reducere nouă disponibilă. Verifică acum!";

        const sent = await broadcastToAll(title, body, {
            type: "new_discount",
            campaignId: event.params.campaignId,
        });

        console.log(
            `[onNewCampaign] Sent notification for campaign ${event.params.campaignId} to ${sent} devices`
        );
    }
);

/**
 * sendDiscountReminders
 *
 * Scheduled function that runs every 30 days.
 * For each user with FCM tokens, evaluates active campaigns and sends
 * a reminder if the user has eligible discounts.
 */
export const sendDiscountReminders = onSchedule(
    {
        schedule: "0 10 1 * *",  // 10:00 AM on the 1st of every month
        region: "europe-west1",
        timeZone: "Europe/Bucharest",
    },
    async () => {
        const now = admin.firestore.Timestamp.now();

        // 1. Get all active, unexpired campaigns
        const campaignsSnap = await db
            .collection("campaigns")
            .where("isActive", "==", true)
            .where("validUntil", ">", now)
            .get();

        if (campaignsSnap.empty) {
            console.log("[sendDiscountReminders] No active campaigns, skipping.");
            return;
        }

        const campaigns = campaignsSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Campaign
        );

        // 2. Get all users with FCM tokens
        const usersSnap = await db
            .collection("users")
            .where("fcmTokens", "!=", [])
            .get();

        let totalSent = 0;

        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const tokens = userData.fcmTokens as string[];
            if (!tokens || tokens.length === 0) continue;

            const userProfile = userData as Record<string, unknown>;

            // Get usage counts for this user
            const usagesSnap = await db
                .collection("discount_usages")
                .where("userId", "==", userDoc.id)
                .get();

            const userUsageMap: Record<string, number> = {};
            usagesSnap.forEach((doc) => {
                const data = doc.data();
                const cid = data.campaignId as string;
                userUsageMap[cid] = (userUsageMap[cid] || 0) + 1;
            });

            // Check if this user is eligible for any campaign
            let hasEligible = false;
            for (const campaign of campaigns) {
                // Check global limit
                if (
                    campaign.globalMaxUses > 0 &&
                    campaign.currentGlobalUses >= campaign.globalMaxUses
                ) {
                    continue;
                }

                // Check per-user limit
                const userUses = userUsageMap[campaign.id] || 0;
                if (
                    campaign.maxUsesPerUser > 0 &&
                    userUses >= campaign.maxUsesPerUser
                ) {
                    continue;
                }

                // Evaluate rules
                if (
                    !campaign.rules ||
                    campaign.rules.length === 0 ||
                    evaluateAllRules(userProfile, campaign.rules)
                ) {
                    hasEligible = true;
                    break;
                }
            }

            if (hasEligible) {
                totalSent += await sendToTokens(
                    userDoc.id,
                    tokens,
                    "💰 Nu uita de reducerile tale!",
                    "Ai reduceri disponibile care te așteaptă. Deschide aplicația!",
                    { type: "discount_reminder" }
                );
            }
        }

        console.log(
            `[sendDiscountReminders] Sent reminders to ${totalSent} devices`
        );
    }
);

/**
 * sendManualNotification
 *
 * Admin-only callable function to send any custom push notification.
 *
 * Input:
 *   - title: string (required)
 *   - body: string (required)
 *   - targetUid?: string — send to a specific user
 *   - topic?: string — send to a FCM topic
 *   If neither targetUid nor topic is provided, broadcasts to ALL users.
 */
export const sendManualNotification = onCall(
    { region: "europe-west1" },
    async (request) => {
        // 1. Auth + admin check
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be signed in.");
        }
        if (request.auth.token.admin !== true) {
            throw new HttpsError(
                "permission-denied",
                "Only admins can send manual notifications."
            );
        }

        const { title, body, targetUid, topic } = request.data as {
            title?: string;
            body?: string;
            targetUid?: string;
            topic?: string;
        };

        if (!title || !body) {
            throw new HttpsError(
                "invalid-argument",
                "title and body are required."
            );
        }

        // 2a. Send to a specific user
        if (targetUid) {
            const userDoc = await db.collection("users").doc(targetUid).get();
            if (!userDoc.exists) {
                throw new HttpsError("not-found", "User not found.");
            }
            const userData = userDoc.data();
            const tokens = (userData?.fcmTokens || []) as string[];
            if (tokens.length === 0) {
                return {
                    success: true,
                    sent: 0,
                    message: "User has no registered devices.",
                };
            }

            const sent = await sendToTokens(
                targetUid,
                tokens,
                title,
                body,
                { type: "manual" }
            );
            return { success: true, sent };
        }

        // 2b. Send to a FCM topic
        if (topic) {
            await admin.messaging().send({
                topic,
                notification: { title, body },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "marina_park_default",
                        priority: "high",
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
            });
            return { success: true, sent: 1, message: `Sent to topic: ${topic}` };
        }

        // 2c. Broadcast to ALL users
        const sent = await broadcastToAll(title, body, { type: "manual" });
        return { success: true, sent };
    }
);
