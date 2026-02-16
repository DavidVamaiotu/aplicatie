import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { createHash } from "crypto";

admin.initializeApp();
const db = admin.firestore();

const WORDPRESS_BOOKING_URL = "https://www.marinapark.ro/wp-json/wpbc-custom/v1/create-booking";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampaignRule {
    attribute: string;
    operator: "==" | "!=" | ">" | "<" | ">=" | "<=";
    value: unknown;
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
    roomTags?: number[];
}

interface CreateBookingPayload {
    bookingType: "room" | "camping";
    roomId?: number;
    unitId?: string;
    unit_id?: string;
    resource_id: number;
    dates: string[];
    name: string;
    last_name: string;
    email: string;
    phone: string;
    check_in?: string;
    check_out?: string;
    adults?: number;
    children?: number;
    license_plate?: string;
}

interface BookingSummaryResult {
    bookingId: string;
    unitName: string | null;
    itemTitle: string;
    totalPrice: number;
    nights: number;
    guests: {
        adults: number;
        children: number;
    };
    alreadyExisted: boolean;
}

// ─── Rule Evaluation Helpers ────────────────────────────────────────────────

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
            if (value instanceof admin.firestore.Timestamp) {
                return value.toDate();
            }
            if (typeof value === "string") {
                return new Date(value);
            }
            if (value instanceof Date) {
                return value;
            }
            return new Date(0);
        }
        case "string":
            return String(value ?? "");
        default:
            return String(value ?? "");
    }
}

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

    const a = String(userValue ?? "");
    const b = String(targetValue ?? "");
    switch (operator) {
        case "==": return a === b;
        case "!=": return a !== b;
        default: return false;
    }
}

function evaluateAllRules(
    userProfile: Record<string, unknown>,
    rules: CampaignRule[]
): boolean {
    return rules.every((rule) => {
        const userValue = userProfile[rule.attribute];
        return evaluateRule(userValue, rule);
    });
}

// ─── Booking Helpers ────────────────────────────────────────────────────────

function requireNonEmptyString(value: unknown, field: string, maxLen = 200): string {
    const str = String(value ?? "").trim();
    if (!str) {
        throw new HttpsError("invalid-argument", `${field} is required.`);
    }
    if (str.length > maxLen) {
        throw new HttpsError("invalid-argument", `${field} is too long.`);
    }
    return str;
}

function requirePositiveInt(value: unknown, field: string): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
        throw new HttpsError("invalid-argument", `${field} must be a positive integer.`);
    }
    return num;
}

function normalizeDateOnly(dateTime: string): string {
    return dateTime.trim().split(" ")[0];
}

function parseDateOnly(dateOnly: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        throw new HttpsError("invalid-argument", `Invalid date format: ${dateOnly}`);
    }
    const d = new Date(`${dateOnly}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
        throw new HttpsError("invalid-argument", `Invalid date value: ${dateOnly}`);
    }
    return d;
}

function validateDates(datesRaw: unknown): string[] {
    if (!Array.isArray(datesRaw) || datesRaw.length === 0) {
        throw new HttpsError("invalid-argument", "dates must be a non-empty array.");
    }
    if (datesRaw.length > 62) {
        throw new HttpsError("invalid-argument", "dates range is too large.");
    }

    const dates = datesRaw.map((v) => requireNonEmptyString(v, "date", 32));
    dates.forEach((d) => {
        const dateOnly = normalizeDateOnly(d);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
            throw new HttpsError("invalid-argument", `Invalid date format: ${d}`);
        }
    });

    return dates;
}

function hasBookingOverlap(
    existingBookings: unknown,
    startDate: Date,
    endDate: Date
): boolean {
    if (!Array.isArray(existingBookings)) return false;

    return existingBookings.some((booking) => {
        if (!booking || typeof booking !== "object") return false;
        const b = booking as { start?: unknown; end?: unknown };
        if (typeof b.start !== "string" || typeof b.end !== "string") return false;

        const existingStart = parseDateOnly(normalizeDateOnly(b.start));
        const existingEnd = parseDateOnly(normalizeDateOnly(b.end));

        return startDate <= existingEnd && endDate >= existingStart;
    });
}

function getPricePerNight(priceField: unknown): number {
    if (typeof priceField === "number") return Math.max(0, Math.floor(priceField));
    const text = String(priceField ?? "");
    const match = text.match(/\d+/g);
    if (!match) return 0;
    return Math.max(0, parseInt(match.join(""), 10));
}

function getNights(startDate: Date, endDate: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay);
    return Math.max(0, diff);
}

async function callWordPressCreateBooking(
    payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
    let response: Response;

    try {
        response = await fetch(WORDPRESS_BOOKING_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new HttpsError("unavailable", "Could not reach booking provider.");
    }

    let data: Record<string, unknown> = {};
    try {
        data = await response.json() as Record<string, unknown>;
    } catch {
        throw new HttpsError("internal", "Booking provider returned invalid JSON.");
    }

    if (!response.ok) {
        const providerMessage =
            typeof data.message === "string" && data.message.trim().length > 0
                ? data.message
                : "Booking provider rejected request.";
        throw new HttpsError("failed-precondition", providerMessage);
    }

    return data;
}

function getRateLimitKey(
    uid: string | undefined,
    rawRequest: { ip?: string; headers?: Record<string, string | string[] | undefined> } | undefined,
    email: string
): string {
    if (uid) {
        return `uid_${uid}`;
    }

    const headers = rawRequest?.headers || {};
    const forwarded = headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = String(rawRequest?.ip || forwardedValue || "unknown-ip");
    const userAgentHeader = headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : String(userAgentHeader || "unknown-ua");

    const hash = createHash("sha256")
        .update(`${ip}|${userAgent}|${email.toLowerCase()}`)
        .digest("hex");

    return `guest_${hash}`;
}

async function enforceBookingRateLimit(rateLimitKey: string): Promise<void> {
    const ref = db.collection("booking_rate_limits").doc(rateLimitKey);

    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const nowMs = Date.now();

        let windowStartMs = nowMs;
        let count = 0;

        if (snap.exists) {
            const data = snap.data() || {};
            const startTs = data.windowStart as admin.firestore.Timestamp | undefined;
            const storedCount = Number(data.count || 0);

            if (startTs) {
                windowStartMs = startTs.toMillis();
            }

            if (nowMs - windowStartMs < RATE_LIMIT_WINDOW_MS) {
                count = storedCount;
            } else {
                windowStartMs = nowMs;
                count = 0;
            }
        }

        if (count >= RATE_LIMIT_MAX_ATTEMPTS) {
            throw new HttpsError(
                "resource-exhausted",
                "Too many booking attempts. Please try again later."
            );
        }

        transaction.set(
            ref,
            {
                windowStart: admin.firestore.Timestamp.fromMillis(windowStartMs),
                count: count + 1,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    });
}

// ─── User Private Profile Helpers ───────────────────────────────────────────

async function getOrInitPrivateProfile(userId: string): Promise<Record<string, unknown>> {
    const privateRef = db.collection("users_private").doc(userId);
    const snap = await privateRef.get();

    if (snap.exists) {
        return snap.data() as Record<string, unknown>;
    }

    const nowTs = admin.firestore.Timestamp.now();
    const initial = {
        accountCreatedAt: nowTs,
        orderCount: 0,
        lastOrderDate: null,
        createdAt: nowTs,
        updatedAt: nowTs,
    };

    await privateRef.set(initial, { merge: true });
    return initial;
}

// ─── Cloud Functions ────────────────────────────────────────────────────────

export const createBookingAndReserve = onCall(
    { region: "europe-west1" },
    async (request) => {
        const payload = request.data as Partial<CreateBookingPayload>;

        const bookingType = payload.bookingType;
        if (bookingType !== "room" && bookingType !== "camping") {
            throw new HttpsError("invalid-argument", "bookingType must be 'room' or 'camping'.");
        }

        const name = requireNonEmptyString(payload.name, "name", 100);
        const lastName = requireNonEmptyString(payload.last_name, "last_name", 100);
        const email = requireNonEmptyString(payload.email, "email", 200);
        const phone = requireNonEmptyString(payload.phone, "phone", 40);

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new HttpsError("invalid-argument", "email is invalid.");
        }

        const dates = validateDates(payload.dates);
        const startDateStr = normalizeDateOnly(dates[0]);
        const endDateStr = normalizeDateOnly(dates[dates.length - 1]);
        const startDate = parseDateOnly(startDateStr);
        const endDate = parseDateOnly(endDateStr);

        if (endDate < startDate) {
            throw new HttpsError("invalid-argument", "end date must be on or after start date.");
        }

        const roomId = requirePositiveInt(
            bookingType === "camping" ? (payload.roomId ?? payload.resource_id) : payload.roomId,
            "roomId"
        );
        const resourceId = requirePositiveInt(payload.resource_id, "resource_id");

        const unitId = bookingType === "room"
            ? requireNonEmptyString(payload.unit_id ?? payload.unitId, "unitId", 64)
            : "";

        const adults = bookingType === "camping"
            ? Math.max(1, requirePositiveInt(payload.adults ?? 1, "adults"))
            : 0;
        const children = bookingType === "camping"
            ? Math.max(0, Math.floor(Number(payload.children ?? 0) || 0))
            : 0;

        const ownerUid = request.auth?.uid;
        const rawRequest = request.rawRequest as
            | { ip?: string; headers?: Record<string, string | string[] | undefined> }
            | undefined;

        const rateLimitKey = getRateLimitKey(ownerUid, rawRequest, email);
        await enforceBookingRateLimit(rateLimitKey);

        const roomRef = db.collection("rooms").doc(String(roomId));
        const roomSnap = await roomRef.get();
        if (!roomSnap.exists) {
            throw new HttpsError("not-found", "Room not found.");
        }

        const roomData = roomSnap.data() || {};
        const roomTitle = String(roomData.title || `Room ${roomId}`);
        const pricePerNight = getPricePerNight(roomData.price);

        let unitRef: admin.firestore.DocumentReference | null = null;
        let initialUnitName: string | null = null;

        if (bookingType === "room") {
            unitRef = roomRef.collection("units").doc(unitId);
            const unitSnap = await unitRef.get();
            if (!unitSnap.exists) {
                throw new HttpsError("not-found", "Unit not found.");
            }

            const unitData = unitSnap.data() || {};
            initialUnitName = typeof unitData.name === "string" ? unitData.name : unitId;

            if (hasBookingOverlap(unitData.bookings, startDate, endDate)) {
                throw new HttpsError("failed-precondition", "Selected dates are no longer available.");
            }
        }

        const wordpressPayload: Record<string, unknown> = {
            dates,
            name,
            last_name: lastName,
            email,
            phone,
            resource_id: resourceId,
            check_in: payload.check_in || "15:00",
            check_out: payload.check_out || "12:00",
        };

        if (bookingType === "room") {
            wordpressPayload.unit_id = unitId;
        } else {
            wordpressPayload.adults = adults;
            wordpressPayload.children = children;
            wordpressPayload.license_plate = typeof payload.license_plate === "string" ? payload.license_plate : "";
        }

        const providerResult = await callWordPressCreateBooking(wordpressPayload);
        const bookingId = String(providerResult.booking_id ?? providerResult.bookingId ?? "").trim();

        if (!bookingId) {
            throw new HttpsError("internal", "Booking provider did not return a booking ID.");
        }

        const nights = getNights(startDate, endDate);
        const totalPrice = bookingType === "camping"
            ? (adults + children) * nights * pricePerNight
            : nights * pricePerNight;

        const createdAtIso = new Date().toISOString();

        const transactionResult = await db.runTransaction(async (transaction): Promise<BookingSummaryResult> => {
            let finalUnitName = initialUnitName;

            if (unitRef) {
                const unitSnapTx = await transaction.get(unitRef);
                if (!unitSnapTx.exists) {
                    throw new HttpsError("not-found", "Unit not found.");
                }

                const unitDataTx = unitSnapTx.data() || {};
                finalUnitName = typeof unitDataTx.name === "string" ? unitDataTx.name : unitId;

                if (hasBookingOverlap(unitDataTx.bookings, startDate, endDate)) {
                    throw new HttpsError("failed-precondition", "Selected dates are no longer available.");
                }

                transaction.update(unitRef, {
                    bookings: admin.firestore.FieldValue.arrayUnion({
                        id: bookingId,
                        start: startDateStr,
                        end: endDateStr,
                    }),
                });
            }

            const orderRef = db.collection("orders").doc(bookingId);
            const existingOrderSnap = await transaction.get(orderRef);

            if (existingOrderSnap.exists) {
                const existing = existingOrderSnap.data() || {};
                return {
                    bookingId,
                    unitName: typeof existing.unitName === "string" ? existing.unitName : finalUnitName,
                    itemTitle: typeof existing.itemTitle === "string" ? existing.itemTitle : roomTitle,
                    totalPrice: Number(existing.totalPrice || totalPrice),
                    nights: Number(existing.nights || nights),
                    guests: {
                        adults: Number((existing.guests as { adults?: unknown } | undefined)?.adults || adults),
                        children: Number((existing.guests as { children?: unknown } | undefined)?.children || children),
                    },
                    alreadyExisted: true,
                };
            }

            transaction.set(orderRef, {
                bookingId,
                ownerUid: ownerUid || null,
                bookingType,
                roomId,
                unitId: bookingType === "room" ? unitId : null,
                resourceId,
                itemTitle: roomTitle,
                unitName: finalUnitName,
                dates,
                startDate: startDateStr,
                endDate: endDateStr,
                guests: {
                    adults,
                    children,
                },
                customer: {
                    name,
                    lastName,
                    email,
                    phone,
                },
                status: "confirmed",
                pricePerNight,
                nights,
                totalPrice,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            if (ownerUid) {
                const userBookingRef = db
                    .collection("users")
                    .doc(ownerUid)
                    .collection("bookings")
                    .doc(bookingId);

                transaction.set(userBookingRef, {
                    bookingId,
                    itemTitle: roomTitle,
                    unitName: finalUnitName,
                    dates: `${startDateStr} - ${endDateStr}`,
                    nights,
                    guests: {
                        adults,
                        children,
                    },
                    totalPrice,
                    status: "confirmed",
                    createdAt: createdAtIso,
                });

                const userPrivateRef = db.collection("users_private").doc(ownerUid);
                const privateSnap = await transaction.get(userPrivateRef);

                const privateUpdate: Record<string, unknown> = {
                    orderCount: admin.firestore.FieldValue.increment(1),
                    lastOrderDate: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };

                if (!privateSnap.exists) {
                    privateUpdate.accountCreatedAt = admin.firestore.FieldValue.serverTimestamp();
                    privateUpdate.createdAt = admin.firestore.FieldValue.serverTimestamp();
                }

                transaction.set(userPrivateRef, privateUpdate, { merge: true });
            }

            return {
                bookingId,
                unitName: finalUnitName,
                itemTitle: roomTitle,
                totalPrice,
                nights,
                guests: {
                    adults,
                    children,
                },
                alreadyExisted: false,
            };
        });

        return {
            booking_id: transactionResult.bookingId,
            bookingId: transactionResult.bookingId,
            unitName: transactionResult.unitName,
            itemTitle: transactionResult.itemTitle,
            totalPrice: transactionResult.totalPrice,
            nights: transactionResult.nights,
            guests: transactionResult.guests,
            alreadyExisted: transactionResult.alreadyExisted,
        };
    }
);

/**
 * evaluateUserDiscounts
 */
export const evaluateUserDiscounts = onCall(
    { region: "europe-west1" },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be signed in.");
        }
        const userId = request.auth.uid;

        const userProfile = await getOrInitPrivateProfile(userId);

        const now = admin.firestore.Timestamp.now();
        const campaignsSnap = await db
            .collection("campaigns")
            .where("isActive", "==", true)
            .where("validUntil", ">", now)
            .get();

        if (campaignsSnap.empty) {
            return { discounts: [] };
        }

        const usagesSnap = await db
            .collection("discount_usages")
            .where("userId", "==", userId)
            .get();

        const userUsageMap: Record<string, number> = {};
        usagesSnap.forEach((doc) => {
            const data = doc.data();
            const cid = data.campaignId as string;
            userUsageMap[cid] = (userUsageMap[cid] || 0) + 1;
        });

        const eligible: object[] = [];

        for (const doc of campaignsSnap.docs) {
            const campaign = { id: doc.id, ...doc.data() } as Campaign;

            if (
                campaign.globalMaxUses > 0 &&
                campaign.currentGlobalUses >= campaign.globalMaxUses
            ) {
                continue;
            }

            const userUses = userUsageMap[campaign.id] || 0;
            if (campaign.maxUsesPerUser > 0 && userUses >= campaign.maxUsesPerUser) {
                continue;
            }

            if (!campaign.rules || campaign.rules.length === 0 || evaluateAllRules(userProfile, campaign.rules)) {
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
 */
export const applyDiscount = onCall(
    { region: "europe-west1" },
    async (request) => {
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

        const userProfile = await getOrInitPrivateProfile(userId);

        const usageDocId = `${campaignId}_${userId}_${orderId}`;

        const result = await db.runTransaction(async (transaction) => {
            const campaignRef = db.collection("campaigns").doc(campaignId);
            const campaignSnap = await transaction.get(campaignRef);

            if (!campaignSnap.exists) {
                throw new HttpsError("not-found", "Campaign not found.");
            }
            const campaign = campaignSnap.data() as Campaign;

            if (!campaign.isActive) {
                throw new HttpsError(
                    "failed-precondition",
                    "This campaign is no longer active."
                );
            }

            if (campaign.validUntil.toDate() < new Date()) {
                throw new HttpsError(
                    "failed-precondition",
                    "This campaign has expired."
                );
            }

            const orderRef = db.collection("orders").doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) {
                throw new HttpsError("not-found", "Order not found.");
            }

            const order = orderSnap.data() as Record<string, unknown>;
            if (order.ownerUid !== userId) {
                throw new HttpsError("permission-denied", "Order does not belong to this user.");
            }

            const status = String(order.status || "").toLowerCase();
            if (status === "canceled" || status === "cancelled" || status === "invalid") {
                throw new HttpsError("failed-precondition", "Discount cannot be applied to this order.");
            }

            if (Array.isArray(campaign.roomTags) && campaign.roomTags.length > 0) {
                const orderRoomId = Number(order.roomId);
                if (!campaign.roomTags.includes(orderRoomId)) {
                    throw new HttpsError("failed-precondition", "Discount is not applicable for this room.");
                }
            }

            if (campaign.rules && campaign.rules.length > 0 && !evaluateAllRules(userProfile, campaign.rules)) {
                throw new HttpsError("permission-denied", "User is not eligible for this discount.");
            }

            if (
                campaign.globalMaxUses > 0 &&
                campaign.currentGlobalUses >= campaign.globalMaxUses
            ) {
                throw new HttpsError(
                    "resource-exhausted",
                    "This campaign has reached its global usage limit."
                );
            }

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

            const usageRef = db.collection("discount_usages").doc(usageDocId);
            const existingUsage = await transaction.get(usageRef);
            if (existingUsage.exists) {
                return {
                    alreadyApplied: true,
                    discountType: campaign.discountType,
                    discountValue: campaign.discountValue,
                };
            }

            transaction.update(campaignRef, {
                currentGlobalUses: admin.firestore.FieldValue.increment(1),
            });

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
 */
export const toggleCampaignStatus = onCall(
    { region: "europe-west1" },
    async (request) => {
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

    if (tokensToRemove.length > 0 && userId) {
        const userRef = db.collection("users").doc(userId);
        await userRef.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
        });
    }

    return response.successCount;
}

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

export const onNewCampaign = onDocumentCreated(
    {
        document: "campaigns/{campaignId}",
        region: "europe-west1",
    },
    async (event) => {
        const snap = event.data;
        if (!snap) return;

        const campaign = snap.data();

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

export const sendDiscountReminders = onSchedule(
    {
        schedule: "0 10 1 * *",
        region: "europe-west1",
        timeZone: "Europe/Bucharest",
    },
    async () => {
        const now = admin.firestore.Timestamp.now();

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

        const usersSnap = await db
            .collection("users")
            .where("fcmTokens", "!=", [])
            .get();

        let totalSent = 0;

        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const tokens = userData.fcmTokens as string[];
            if (!tokens || tokens.length === 0) continue;

            const userProfile = await getOrInitPrivateProfile(userDoc.id);

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

            let hasEligible = false;
            for (const campaign of campaigns) {
                if (
                    campaign.globalMaxUses > 0 &&
                    campaign.currentGlobalUses >= campaign.globalMaxUses
                ) {
                    continue;
                }

                const userUses = userUsageMap[campaign.id] || 0;
                if (
                    campaign.maxUsesPerUser > 0 &&
                    userUses >= campaign.maxUsesPerUser
                ) {
                    continue;
                }

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

export const sendManualNotification = onCall(
    { region: "europe-west1" },
    async (request) => {
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

        const sent = await broadcastToAll(title, body, { type: "manual" });
        return { success: true, sent };
    }
);
