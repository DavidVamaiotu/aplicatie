import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash, createHmac, randomUUID } from "crypto";

admin.initializeApp();
const db = admin.firestore();

const WORDPRESS_BOOKING_URL = "https://www.marinapark.ro/wp-json/wpbc-custom/v1/create-booking";
const WORDPRESS_REQUEST_TIMEOUT_MS = 12000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_ROOM_MAX_ATTEMPTS = 5;
const HOLD_TTL_MS = 5 * 60 * 1000;
const TERMINAL_HOLD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const SYNC_RETRY_LIMIT = 10;
const BOOKING_PROVIDER_HMAC_SECRET = defineSecret("BOOKING_PROVIDER_HMAC_SECRET");
const BOOKING_RECAPTCHA_SECRET = defineSecret("BOOKING_RECAPTCHA_SECRET");

interface RateLimitSpec {
    key: string;
    maxAttempts: number;
    windowMs: number;
}

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
    captchaToken?: string;
    captcha_token?: string;
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
    syncStatus: "synced" | "pending_local_sync";
    correlationId: string;
}

function readSecretValue(secretParam: { value: () => string }, envKey: string): string {
    const secretValue = String(secretParam.value() || "").trim();
    if (secretValue) return secretValue;
    return String(process.env[envKey] || "").trim();
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

function parseIntegerWithMin(
    value: unknown,
    field: string,
    defaultValue: number,
    minValue: number
): number {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    const num = Number(value);
    if (!Number.isInteger(num) || num < minValue) {
        throw new HttpsError("invalid-argument", `${field} must be an integer >= ${minValue}.`);
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

function extractProviderBookingId(data: Record<string, unknown>): string {
    const candidates: unknown[] = [
        data.booking_id,
        data.bookingId,
        data.bookingid,
        data.id,
        data.result,
        (data.data as Record<string, unknown> | undefined)?.booking_id,
        (data.data as Record<string, unknown> | undefined)?.bookingId,
        (data.data as Record<string, unknown> | undefined)?.id,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return String(Math.trunc(candidate));
        }
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return "";
}

function normalizeErrorMessage(error: unknown): string {
    if (error instanceof HttpsError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return "Unknown error";
}

async function callWordPressCreateBooking(
    payload: Record<string, unknown>,
    correlationId: string
): Promise<Record<string, unknown>> {
    let response: Response;
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Marina-Correlation-Id": correlationId,
    };
    const providerSecret = readSecretValue(BOOKING_PROVIDER_HMAC_SECRET, "BOOKING_PROVIDER_HMAC_SECRET");
    if (providerSecret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signatureHash = createHmac("sha256", providerSecret)
            .update(`${timestamp}.${body}`)
            .digest("hex");
        headers["X-Marina-Signature"] = `sha256=${signatureHash}`;
        headers["X-Marina-Timestamp"] = timestamp;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WORDPRESS_REQUEST_TIMEOUT_MS);

    try {
        response = await fetch(WORDPRESS_BOOKING_URL, {
            method: "POST",
            headers,
            body,
            signal: controller.signal,
        });
    } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new HttpsError("deadline-exceeded", "Booking provider request timed out.");
        }
        throw new HttpsError("unavailable", "Could not reach booking provider.");
    } finally {
        clearTimeout(timeout);
    }

    let data: Record<string, unknown> = {};
    try {
        const raw = await response.json() as unknown;
        if (raw && typeof raw === "object") {
            data = raw as Record<string, unknown>;
        } else {
            data = { result: raw };
        }
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

    if (data.success === false) {
        const providerMessage =
            typeof data.message === "string" && data.message.trim().length > 0
                ? data.message
                : "Booking provider rejected request.";
        throw new HttpsError("failed-precondition", providerMessage);
    }

    return data;
}

function hashValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function getClientIp(
    rawRequest: { ip?: string; headers?: Record<string, string | string[] | undefined> } | undefined
): string {
    const headers = rawRequest?.headers || {};
    const forwarded = headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstForwardedIp = String(forwardedValue || "").split(",")[0].trim();
    return String(rawRequest?.ip || firstForwardedIp || "unknown-ip");
}

function getUserAgent(
    rawRequest: { headers?: Record<string, string | string[] | undefined> } | undefined
): string {
    const userAgentHeader = rawRequest?.headers?.["user-agent"];
    return Array.isArray(userAgentHeader)
        ? String(userAgentHeader[0] || "unknown-ua")
        : String(userAgentHeader || "unknown-ua");
}

function getBookingRateLimitSpecs(
    uid: string | undefined,
    rawRequest: { ip?: string; headers?: Record<string, string | string[] | undefined> } | undefined,
    email: string,
    roomId: number,
    startDate: string
): RateLimitSpec[] {
    if (uid) {
        return [
            { key: `uid_${uid}`, maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
            { key: `uid_room_${uid}_${roomId}_${startDate}`, maxAttempts: RATE_LIMIT_ROOM_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
        ];
    }

    const ip = getClientIp(rawRequest);
    const userAgent = getUserAgent(rawRequest);
    const emailNormalized = email.toLowerCase();

    return [
        { key: `guest_ip_${hashValue(ip)}`, maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
        { key: `guest_email_${hashValue(emailNormalized)}`, maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
        { key: `guest_fingerprint_${hashValue(`${ip}|${userAgent}|${emailNormalized}`)}`, maxAttempts: RATE_LIMIT_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
        { key: `guest_room_${roomId}_${startDate}_${hashValue(ip)}`, maxAttempts: RATE_LIMIT_ROOM_MAX_ATTEMPTS, windowMs: RATE_LIMIT_WINDOW_MS },
    ];
}

async function enforceBookingRateLimit(specs: RateLimitSpec[]): Promise<void> {
    const uniqueSpecs = Array.from(
        new Map(specs.map((spec) => [spec.key, spec])).values()
    );
    const refs = uniqueSpecs.map((spec) => db.collection("booking_rate_limits").doc(spec.key));

    await db.runTransaction(async (transaction) => {
        const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const nowMs = Date.now();

        snaps.forEach((snap, idx) => {
            const spec = uniqueSpecs[idx];
            let windowStartMs = nowMs;
            let count = 0;

            if (snap.exists) {
                const data = snap.data() || {};
                const startTs = data.windowStart as admin.firestore.Timestamp | undefined;
                const storedCount = Number(data.count || 0);

                if (startTs) {
                    windowStartMs = startTs.toMillis();
                }

                if (nowMs - windowStartMs < spec.windowMs) {
                    count = storedCount;
                }
            }

            if (count >= spec.maxAttempts) {
                throw new HttpsError(
                    "resource-exhausted",
                    "Too many booking attempts. Please try again later."
                );
            }
        });

        snaps.forEach((snap, idx) => {
            const spec = uniqueSpecs[idx];
            const ref = refs[idx];
            let windowStartMs = nowMs;
            let count = 0;

            if (snap.exists) {
                const data = snap.data() || {};
                const startTs = data.windowStart as admin.firestore.Timestamp | undefined;
                const storedCount = Number(data.count || 0);

                if (startTs) {
                    windowStartMs = startTs.toMillis();
                }

                if (nowMs - windowStartMs < spec.windowMs) {
                    count = storedCount;
                } else {
                    windowStartMs = nowMs;
                    count = 0;
                }
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
    });
}

async function verifyGuestCaptcha(
    captchaToken: string | undefined,
    rawRequest: { ip?: string; headers?: Record<string, string | string[] | undefined> } | undefined
): Promise<void> {
    const secret = readSecretValue(BOOKING_RECAPTCHA_SECRET, "BOOKING_RECAPTCHA_SECRET");
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    if (!secret && isEmulator) return;
    if (!secret) {
        throw new HttpsError("failed-precondition", "Captcha is not configured on server.");
    }

    const token = String(captchaToken || "").trim();
    if (!token) {
        throw new HttpsError("invalid-argument", "captchaToken is required for guest bookings.");
    }

    const ip = getClientIp(rawRequest);
    const body = new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
    });

    let response: Response;
    try {
        response = await fetch(CAPTCHA_VERIFY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });
    } catch {
        throw new HttpsError("unavailable", "Captcha verification failed.");
    }

    let data: Record<string, unknown> = {};
    try {
        data = await response.json() as Record<string, unknown>;
    } catch {
        throw new HttpsError("internal", "Invalid captcha verification response.");
    }

    if (!response.ok || data.success !== true) {
        throw new HttpsError("permission-denied", "Captcha verification failed.");
    }
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

function getActiveUnitHolds(
    rawHolds: unknown,
    nowMs: number
): Record<string, { start: string; end: string; expiresAt: admin.firestore.Timestamp }> {
    const active: Record<string, { start: string; end: string; expiresAt: admin.firestore.Timestamp }> = {};
    if (!rawHolds || typeof rawHolds !== "object") return active;

    Object.entries(rawHolds as Record<string, unknown>).forEach(([holdId, holdValue]) => {
        if (!holdValue || typeof holdValue !== "object") return;
        const hold = holdValue as { start?: unknown; end?: unknown; expiresAt?: unknown };
        if (typeof hold.start !== "string" || typeof hold.end !== "string") return;
        if (!(hold.expiresAt instanceof admin.firestore.Timestamp)) return;
        if (hold.expiresAt.toMillis() <= nowMs) return;
        active[holdId] = {
            start: hold.start,
            end: hold.end,
            expiresAt: hold.expiresAt,
        };
    });

    return active;
}

function hasHoldOverlap(
    holds: Record<string, { start: string; end: string; expiresAt: admin.firestore.Timestamp }>,
    startDate: Date,
    endDate: Date,
    excludeHoldId?: string
): boolean {
    return Object.entries(holds).some(([holdId, hold]) => {
        if (excludeHoldId && holdId === excludeHoldId) return false;
        const holdStart = parseDateOnly(normalizeDateOnly(hold.start));
        const holdEnd = parseDateOnly(normalizeDateOnly(hold.end));
        return startDate <= holdEnd && endDate >= holdStart;
    });
}

async function releaseBookingHold(
    holdRef: admin.firestore.DocumentReference,
    holdId: string,
    roomRef: admin.firestore.DocumentReference | null,
    unitId: string | null,
    reason: string,
    status: "failed" | "expired" = "failed",
    failureDetails?: string
): Promise<void> {
    await db.runTransaction(async (transaction) => {
        if (roomRef && unitId) {
            const unitRef = roomRef.collection("units").doc(unitId);
            const unitSnap = await transaction.get(unitRef);
            if (unitSnap.exists) {
                const unitData = unitSnap.data() || {};
                const activeHolds = getActiveUnitHolds(unitData.holds, Date.now());
                if (activeHolds[holdId]) {
                    delete activeHolds[holdId];
                }
                transaction.update(unitRef, { holds: activeHolds });
            }
        }

        const patch: Record<string, unknown> = {
            status,
            failureReason: reason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (status === "failed") {
            patch.failedAt = admin.firestore.FieldValue.serverTimestamp();
            if (failureDetails) {
                patch.failureDetails = failureDetails;
            }
        }
        if (status === "expired") {
            patch.expiredAt = admin.firestore.FieldValue.serverTimestamp();
        }
        transaction.set(holdRef, patch, { merge: true });
    });
}

function hasBookingWithId(bookings: unknown, bookingId: string): boolean {
    if (!Array.isArray(bookings)) return false;
    return bookings.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        return String((entry as { id?: unknown }).id || "") === bookingId;
    });
}

async function writePendingSyncOrder(params: {
    bookingId: string;
    correlationId: string;
    ownerUid?: string;
    bookingType: "room" | "camping";
    roomId: number;
    unitId?: string;
    resourceId: number;
    roomTitle: string;
    unitName: string | null;
    dates: string[];
    startDateStr: string;
    endDateStr: string;
    adults: number;
    children: number;
    name: string;
    lastName: string;
    email: string;
    phone: string;
    pricePerNight: number;
    nights: number;
    totalPrice: number;
    lastSyncError: string;
}): Promise<void> {
    const orderRef = db.collection("orders").doc(params.bookingId);
    await orderRef.set({
        bookingId: params.bookingId,
        ownerUid: params.ownerUid || null,
        bookingType: params.bookingType,
        roomId: params.roomId,
        unitId: params.bookingType === "room" ? (params.unitId || null) : null,
        resourceId: params.resourceId,
        itemTitle: params.roomTitle,
        unitName: params.unitName,
        dates: params.dates,
        startDate: params.startDateStr,
        endDate: params.endDateStr,
        guests: {
            adults: params.adults,
            children: params.children,
        },
        customer: {
            name: params.name,
            lastName: params.lastName,
            email: params.email,
            phone: params.phone,
        },
        status: "pending",
        syncStatus: "pending_local_sync",
        syncRetryCount: 0,
        lastSyncError: params.lastSyncError,
        correlationId: params.correlationId,
        providerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        pricePerNight: params.pricePerNight,
        nights: params.nights,
        totalPrice: params.totalPrice,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function reconcilePendingOrder(orderRef: admin.firestore.DocumentReference): Promise<void> {
    await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) return;

        const order = orderSnap.data() || {};
        const currentSyncStatus = String(order.syncStatus || "");
        if (currentSyncStatus && currentSyncStatus !== "pending_local_sync") {
            return;
        }
        const bookingId = String(order.bookingId || orderRef.id);
        const bookingType = String(order.bookingType || "");
        const roomId = Number(order.roomId);
        const unitId = typeof order.unitId === "string" ? order.unitId : null;
        const startDateStr = String(order.startDate || "");
        const endDateStr = String(order.endDate || "");
        const ownerUid = typeof order.ownerUid === "string" && order.ownerUid ? order.ownerUid : null;

        if (!bookingId || !Number.isFinite(roomId) || !startDateStr || !endDateStr) {
            transaction.set(orderRef, {
                syncStatus: "failed_manual_review",
                status: "external_confirmed_invalid_payload",
                lastSyncError: "Invalid order payload for reconciliation",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return;
        }

        if (bookingType === "room" && unitId) {
            const unitRef = db.collection("rooms").doc(String(roomId)).collection("units").doc(unitId);
            const unitSnap = await transaction.get(unitRef);
            if (!unitSnap.exists) {
                transaction.set(orderRef, {
                    syncStatus: "failed_manual_review",
                    status: "external_confirmed_missing_unit",
                    lastSyncError: "Unit not found during reconciliation",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return;
            }

            const unitData = unitSnap.data() || {};
            const bookings = unitData.bookings;
            const alreadySynced = hasBookingWithId(bookings, bookingId);
            if (!alreadySynced) {
                const startDate = parseDateOnly(startDateStr);
                const endDate = parseDateOnly(endDateStr);
                if (hasBookingOverlap(bookings, startDate, endDate)) {
                    transaction.set(orderRef, {
                        syncStatus: "failed_manual_review",
                        status: "external_confirmed_conflict",
                        lastSyncError: "Unit booking overlap detected during reconciliation",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    return;
                }
                transaction.update(unitRef, {
                    bookings: admin.firestore.FieldValue.arrayUnion({
                        id: bookingId,
                        start: startDateStr,
                        end: endDateStr,
                    }),
                });
            }
        }

        if (ownerUid) {
            const guests = (order.guests || {}) as { adults?: unknown; children?: unknown };
            const userBookingRef = db.collection("users").doc(ownerUid).collection("bookings").doc(bookingId);
            const userBookingSnap = await transaction.get(userBookingRef);
            transaction.set(userBookingRef, {
                bookingId,
                itemTitle: String(order.itemTitle || `Room ${roomId}`),
                unitName: typeof order.unitName === "string" ? order.unitName : null,
                dates: `${startDateStr} - ${endDateStr}`,
                nights: Number(order.nights || 0),
                guests: {
                    adults: Number(guests.adults || 0),
                    children: Number(guests.children || 0),
                },
                totalPrice: Number(order.totalPrice || 0),
                status: "pending",
                createdAt: new Date().toISOString(),
            }, { merge: true });

            if (!userBookingSnap.exists) {
                const userPrivateRef = db.collection("users_private").doc(ownerUid);
                transaction.set(userPrivateRef, {
                    orderCount: admin.firestore.FieldValue.increment(1),
                    lastOrderDate: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        }

        transaction.set(orderRef, {
            status: "pending",
            syncStatus: "synced",
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSyncError: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}

// ─── Cloud Functions ────────────────────────────────────────────────────────

export const createBookingAndReserve = onCall(
    {
        region: "europe-west1",
        enforceAppCheck: true,
        secrets: [BOOKING_PROVIDER_HMAC_SECRET, BOOKING_RECAPTCHA_SECRET],
    },
    async (request) => {
        const payload = request.data as Partial<CreateBookingPayload>;
        const correlationId = randomUUID();

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

        const adultsDefault = bookingType === "room" ? 2 : 1;
        const adults = parseIntegerWithMin(payload.adults, "adults", adultsDefault, 1);
        const children = parseIntegerWithMin(payload.children, "children", 0, 0);

        const ownerUid = request.auth?.uid;
        const rawRequest = request.rawRequest as
            | { ip?: string; headers?: Record<string, string | string[] | undefined> }
            | undefined;

        if (!ownerUid) {
            const captchaToken = String(payload.captcha_token ?? payload.captchaToken ?? "");
            await verifyGuestCaptcha(captchaToken, rawRequest);
        }

        const rateLimitSpecs = getBookingRateLimitSpecs(ownerUid, rawRequest, email, roomId, startDateStr);
        await enforceBookingRateLimit(rateLimitSpecs);

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
        const holdRef = db.collection("booking_holds").doc();
        const holdId = holdRef.id;
        const holdExpiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + HOLD_TTL_MS);

        if (bookingType === "room") {
            unitRef = roomRef.collection("units").doc(unitId);
            const unitSnap = await unitRef.get();
            if (!unitSnap.exists) {
                throw new HttpsError("not-found", "Unit not found.");
            }

            const unitData = unitSnap.data() || {};
            initialUnitName = typeof unitData.name === "string" ? unitData.name : unitId;
        }

        await db.runTransaction(async (transaction) => {
            if (unitRef) {
                const unitSnap = await transaction.get(unitRef);
                if (!unitSnap.exists) {
                    throw new HttpsError("not-found", "Unit not found.");
                }

                const unitData = unitSnap.data() || {};
                const nowMs = Date.now();
                const activeHolds = getActiveUnitHolds(unitData.holds, nowMs);

                if (hasBookingOverlap(unitData.bookings, startDate, endDate)) {
                    throw new HttpsError("failed-precondition", "Selected dates are no longer available.");
                }
                if (hasHoldOverlap(activeHolds, startDate, endDate)) {
                    throw new HttpsError("failed-precondition", "Selected dates are temporarily reserved.");
                }

                const updatedHolds = {
                    ...activeHolds,
                    [holdId]: {
                        start: startDateStr,
                        end: endDateStr,
                        expiresAt: holdExpiresAt,
                    },
                };

                transaction.update(unitRef, { holds: updatedHolds });
            }

            transaction.set(holdRef, {
                holdId,
                status: "pending",
                bookingType,
                ownerUid: ownerUid || null,
                roomId,
                unitId: bookingType === "room" ? unitId : null,
                startDate: startDateStr,
                endDate: endDateStr,
                expiresAt: holdExpiresAt,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        const wordpressPayload: Record<string, unknown> = {
            dates,
            name,
            last_name: lastName,
            email,
            phone,
            resource_id: resourceId,
            check_in: payload.check_in || "15:00",
            check_out: payload.check_out || "12:00",
            adults,
            children,
            date_range: `${startDateStr} - ${endDateStr}`,
            idempotency_key: holdId,
            correlation_id: correlationId,
        };

        if (bookingType === "room") {
            wordpressPayload.unit_id = unitId;
        }

        const licensePlate = typeof payload.license_plate === "string"
            ? payload.license_plate.trim()
            : "";
        if (licensePlate) {
            wordpressPayload.license_plate = licensePlate;
        }

        let providerResult: Record<string, unknown>;
        try {
            providerResult = await callWordPressCreateBooking(wordpressPayload, correlationId);
        } catch (error) {
            await releaseBookingHold(holdRef, holdId, roomRef, bookingType === "room" ? unitId : null, "provider_rejected");
            throw error;
        }

        const bookingId = extractProviderBookingId(providerResult);

        if (!bookingId) {
            await releaseBookingHold(holdRef, holdId, roomRef, bookingType === "room" ? unitId : null, "missing_booking_id");
            throw new HttpsError("internal", "Booking provider did not return a booking ID.");
        }

        const nights = getNights(startDate, endDate);
        const totalPrice = bookingType === "camping"
            ? (adults + children) * nights * pricePerNight
            : nights * pricePerNight;

        const createdAtIso = new Date().toISOString();

        let transactionResult: BookingSummaryResult;
        try {
            transactionResult = await db.runTransaction(async (transaction): Promise<BookingSummaryResult> => {
                let finalUnitName = initialUnitName;

                const holdSnap = await transaction.get(holdRef);
                const holdData = holdSnap.data() || {};
                const holdStatus = holdSnap.exists ? String(holdData.status || "") : "";
                const holdExpires = holdData.expiresAt as admin.firestore.Timestamp | undefined;
                const holdIsActive =
                    holdSnap.exists &&
                    holdStatus === "pending" &&
                    !!holdExpires &&
                    holdExpires.toMillis() > Date.now();
                let activeHolds: Record<string, { start: string; end: string; expiresAt: admin.firestore.Timestamp }> | null = null;
                let alreadyBookedBySameId = false;

                if (unitRef) {
                    const unitSnapTx = await transaction.get(unitRef);
                    if (!unitSnapTx.exists) {
                        throw new HttpsError("not-found", "Unit not found.");
                    }

                    const unitDataTx = unitSnapTx.data() || {};
                    finalUnitName = typeof unitDataTx.name === "string" ? unitDataTx.name : unitId;
                    activeHolds = getActiveUnitHolds(unitDataTx.holds, Date.now());
                    const bookings = unitDataTx.bookings;
                    alreadyBookedBySameId = hasBookingWithId(bookings, bookingId);

                    if (!alreadyBookedBySameId && !holdIsActive) {
                        throw new HttpsError("failed-precondition", "Booking hold is no longer active.");
                    }
                    if (!alreadyBookedBySameId && hasBookingOverlap(bookings, startDate, endDate)) {
                        throw new HttpsError("failed-precondition", "Selected dates are no longer available.");
                    }
                    if (holdIsActive && !activeHolds[holdId] && !alreadyBookedBySameId) {
                        throw new HttpsError("failed-precondition", "Booking hold is missing.");
                    }
                    if (holdIsActive && !alreadyBookedBySameId && hasHoldOverlap(activeHolds, startDate, endDate, holdId)) {
                        throw new HttpsError("failed-precondition", "Selected dates are temporarily reserved.");
                    }

                    if (activeHolds[holdId]) {
                        delete activeHolds[holdId];
                    }
                }

                const orderRef = db.collection("orders").doc(bookingId);
                const existingOrderSnap = await transaction.get(orderRef);
                let userPrivateRef: admin.firestore.DocumentReference | null = null;
                let privateSnap: admin.firestore.DocumentSnapshot | null = null;

                if (ownerUid && !existingOrderSnap.exists) {
                    userPrivateRef = db.collection("users_private").doc(ownerUid);
                    privateSnap = await transaction.get(userPrivateRef);
                }

                if (unitRef && activeHolds) {
                    if (alreadyBookedBySameId) {
                        transaction.update(unitRef, { holds: activeHolds });
                    } else {
                        transaction.update(unitRef, {
                            holds: activeHolds,
                            bookings: admin.firestore.FieldValue.arrayUnion({
                                id: bookingId,
                                start: startDateStr,
                                end: endDateStr,
                            }),
                        });
                    }
                }

                if (existingOrderSnap.exists) {
                    const existing = existingOrderSnap.data() || {};
                    const existingSyncStatus = String(existing.syncStatus || "").toLowerCase() === "pending_local_sync"
                        ? "pending_local_sync"
                        : "synced";
                    transaction.delete(holdRef);

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
                        syncStatus: existingSyncStatus,
                        correlationId,
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
                    status: "pending",
                    syncStatus: "synced",
                    pricePerNight,
                    nights,
                    totalPrice,
                    correlationId,
                    providerStatus: "created",
                    providerRaw: providerResult,
                    providerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
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
                        status: "pending",
                        createdAt: createdAtIso,
                    });

                    const privateUpdate: Record<string, unknown> = {
                        orderCount: admin.firestore.FieldValue.increment(1),
                        lastOrderDate: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    };

                    if (!privateSnap || !privateSnap.exists) {
                        privateUpdate.accountCreatedAt = admin.firestore.FieldValue.serverTimestamp();
                        privateUpdate.createdAt = admin.firestore.FieldValue.serverTimestamp();
                    }

                    if (userPrivateRef) {
                        transaction.set(userPrivateRef, privateUpdate, { merge: true });
                    }
                }

                transaction.delete(holdRef);

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
                    syncStatus: "synced",
                    correlationId,
                };
            });
        } catch (error) {
            const localSyncError = normalizeErrorMessage(error);
            await releaseBookingHold(
                holdRef,
                holdId,
                roomRef,
                bookingType === "room" ? unitId : null,
                "finalization_failed",
                "failed",
                localSyncError
            );
            await writePendingSyncOrder({
                bookingId,
                correlationId,
                ownerUid,
                bookingType,
                roomId,
                unitId: bookingType === "room" ? unitId : undefined,
                resourceId,
                roomTitle,
                unitName: initialUnitName,
                dates,
                startDateStr,
                endDateStr,
                adults,
                children,
                name,
                lastName,
                email,
                phone,
                pricePerNight,
                nights,
                totalPrice,
                lastSyncError: localSyncError,
            });

            return {
                booking_id: bookingId,
                bookingId,
                unitName: initialUnitName,
                itemTitle: roomTitle,
                totalPrice,
                nights,
                guests: { adults, children },
                alreadyExisted: false,
                syncStatus: "pending_local_sync",
                correlationId,
                status: "pending",
                warning: "Booking confirmed with provider. Local sync is pending.",
            };
        }

        return {
            booking_id: transactionResult.bookingId,
            bookingId: transactionResult.bookingId,
            unitName: transactionResult.unitName,
            itemTitle: transactionResult.itemTitle,
            totalPrice: transactionResult.totalPrice,
            nights: transactionResult.nights,
            guests: transactionResult.guests,
            alreadyExisted: transactionResult.alreadyExisted,
            syncStatus: transactionResult.syncStatus,
            correlationId: transactionResult.correlationId,
            status: "pending",
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
            const syncStatus = String(order.syncStatus || "").toLowerCase();
            if (status !== "confirmed" || (syncStatus && syncStatus !== "synced")) {
                throw new HttpsError("failed-precondition", "Discount can be applied only to fully confirmed synced orders.");
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

export const cleanupExpiredBookingHolds = onSchedule(
    {
        schedule: "*/10 * * * *",
        region: "europe-west1",
        timeZone: "Europe/Bucharest",
    },
    async () => {
        const now = admin.firestore.Timestamp.now();
        const staleHoldsSnap = await db
            .collection("booking_holds")
            .where("status", "==", "pending")
            .where("expiresAt", "<=", now)
            .limit(200)
            .get();

        if (staleHoldsSnap.empty) return;

        let cleaned = 0;
        for (const holdDoc of staleHoldsSnap.docs) {
            const hold = holdDoc.data();
            const bookingType = String(hold.bookingType || "");
            const roomId = Number(hold.roomId);
            const unitId = typeof hold.unitId === "string" ? hold.unitId : null;

            if (bookingType === "room" && Number.isFinite(roomId) && unitId) {
                const roomRef = db.collection("rooms").doc(String(roomId));
                await releaseBookingHold(
                    holdDoc.ref,
                    holdDoc.id,
                    roomRef,
                    unitId,
                    "hold_expired",
                    "expired"
                );
            } else {
                await holdDoc.ref.set({
                    status: "expired",
                    failureReason: "hold_expired",
                    expiredAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            cleaned += 1;
        }

        console.log(`[cleanupExpiredBookingHolds] Cleaned ${cleaned} expired booking holds`);
    }
);

export const reconcilePendingExternalBookings = onSchedule(
    {
        schedule: "*/5 * * * *",
        region: "europe-west1",
        timeZone: "Europe/Bucharest",
    },
    async () => {
        const pendingSnap = await db
            .collection("orders")
            .where("syncStatus", "==", "pending_local_sync")
            .limit(100)
            .get();

        if (pendingSnap.empty) return;

        let reconciled = 0;
        let failed = 0;

        for (const orderDoc of pendingSnap.docs) {
            try {
                await reconcilePendingOrder(orderDoc.ref);
                reconciled += 1;
            } catch (error) {
                failed += 1;
                const errMessage = normalizeErrorMessage(error);
                const current = orderDoc.data() || {};
                const retries = Number(current.syncRetryCount || 0) + 1;
                await orderDoc.ref.set({
                    syncRetryCount: retries,
                    syncStatus: retries >= SYNC_RETRY_LIMIT ? "failed_manual_review" : "pending_local_sync",
                    status: "pending",
                    lastSyncError: errMessage,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        }

        console.log(`[reconcilePendingExternalBookings] Reconciled ${reconciled}, failed ${failed}`);
    }
);

export const cleanupTerminalBookingHolds = onSchedule(
    {
        schedule: "15 * * * *",
        region: "europe-west1",
        timeZone: "Europe/Bucharest",
    },
    async () => {
        const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TERMINAL_HOLD_RETENTION_MS);
        const terminalStatuses: Array<"confirmed" | "failed" | "expired"> = ["confirmed", "failed", "expired"];
        let removed = 0;

        for (const status of terminalStatuses) {
            const snap = await db
                .collection("booking_holds")
                .where("status", "==", status)
                .where("updatedAt", "<=", cutoff)
                .limit(200)
                .get();

            if (snap.empty) continue;

            const batch = db.batch();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            removed += snap.size;
        }

        if (removed > 0) {
            console.log(`[cleanupTerminalBookingHolds] Removed ${removed} terminal hold documents`);
        }
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
