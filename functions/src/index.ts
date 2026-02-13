import { onCall, HttpsError } from "firebase-functions/v2/https";
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
