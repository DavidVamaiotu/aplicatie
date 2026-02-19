#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const argMap = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.split("=");
    return [k, rest.join("=")];
  })
);

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = Math.max(20, Number(argMap.get("--batch") || 120));
const START_AFTER = String(argMap.get("--startAfter") || "").trim();
const PROJECT_ID = String(
  process.env.FIREBASE_PROJECT_ID || "marina-park-booking-app"
).trim();
const KEY_PATH = path.resolve(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
    path.join(__dirname, "..", "service-account.json")
);

if (!fs.existsSync(KEY_PATH)) {
  console.error(`Missing service account file: ${KEY_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
  });
}

const db = admin.firestore();
const { FieldValue, FieldPath, Timestamp } = admin.firestore;
const CHECKPOINT_REF = db
  .collection("_maintenance")
  .doc("booking_schema_v2_migration_checkpoint");

function normalizeDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace("T", " ").split(" ")[0];
}

function deriveDateRange(data) {
  const fromFieldsStart = normalizeDateOnly(data.startDate);
  const fromFieldsEnd = normalizeDateOnly(data.endDate);
  if (fromFieldsStart && fromFieldsEnd) {
    return { startDate: fromFieldsStart, endDate: fromFieldsEnd };
  }

  const rawDates = Array.isArray(data.dates) ? data.dates : [];
  const normalized = rawDates
    .map(normalizeDateOnly)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  if (normalized.length === 0) return { startDate: "", endDate: "" };
  return {
    startDate: normalized[0],
    endDate: normalized[normalized.length - 1],
  };
}

function normalizeWpApproval(data) {
  const rawApproval = String(data.wpApproval || "").toLowerCase().trim();
  if (rawApproval === "confirmed" || rawApproval === "pending") {
    return rawApproval;
  }

  const status = String(data.status || "").toLowerCase().trim();
  if (status === "confirmed" || status === "approved") return "confirmed";
  return "pending";
}

function normalizeStatus(statusRaw, wpApproval) {
  const status = String(statusRaw || "").toLowerCase().trim();
  if (status === "cancelled") return "cancelled";
  return wpApproval === "confirmed" ? "confirmed" : "pending";
}

function toIso(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function isEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function run() {
  let checkpoint = null;
  if (!START_AFTER) {
    const checkpointSnap = await CHECKPOINT_REF.get();
    if (checkpointSnap.exists) {
      checkpoint = checkpointSnap.data() || null;
    }
  }

  let startAfter = START_AFTER || String(checkpoint?.lastDocId || "").trim();
  let totalProcessed = 0;
  let totalOrderUpdates = 0;
  let totalUserUpdates = 0;
  let totalOrderDeletes = 0;
  let totalUserDeletes = 0;

  console.log(
    `[migrate-booking-schema-v2] start dryRun=${DRY_RUN} batch=${BATCH_SIZE} startAfter=${startAfter || "<none>"}`
  );

  while (true) {
    let query = db
      .collection("orders")
      .orderBy(FieldPath.documentId())
      .limit(BATCH_SIZE);

    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    const snap = await query.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      const bookingId = docSnap.id;
      const data = docSnap.data() || {};
      totalProcessed += 1;

      const orderPatch = {};
      let orderChanged = false;

      const { startDate, endDate } = deriveDateRange(data);
      const wpApproval = normalizeWpApproval(data);
      const status = normalizeStatus(data.status, wpApproval);

      if (!data.bookingId) {
        orderPatch.bookingId = bookingId;
        orderChanged = true;
      }
      if (!Object.prototype.hasOwnProperty.call(data, "ownerUid")) {
        orderPatch.ownerUid = null;
        orderChanged = true;
      }
      if (!Object.prototype.hasOwnProperty.call(data, "unitId")) {
        orderPatch.unitId = data.bookingType === "room" ? null : null;
        orderChanged = true;
      }
      if (!Object.prototype.hasOwnProperty.call(data, "syncStatus")) {
        orderPatch.syncStatus = "synced";
        orderChanged = true;
      }
      if (startDate && String(data.startDate || "") !== startDate) {
        orderPatch.startDate = startDate;
        orderChanged = true;
      }
      if (endDate && String(data.endDate || "") !== endDate) {
        orderPatch.endDate = endDate;
        orderChanged = true;
      }
      if (String(data.wpApproval || "").toLowerCase() !== wpApproval) {
        orderPatch.wpApproval = wpApproval;
        orderChanged = true;
      }
      if (String(data.status || "").toLowerCase() !== status) {
        orderPatch.status = status;
        orderChanged = true;
      }
      if (data.providerRaw !== undefined) {
        orderPatch.providerRaw = FieldValue.delete();
        orderChanged = true;
        totalOrderDeletes += 1;
      }
      if (data.customer !== undefined) {
        orderPatch.customer = FieldValue.delete();
        orderChanged = true;
        totalOrderDeletes += 1;
      }
      if (startDate && endDate && data.dates !== undefined) {
        orderPatch.dates = FieldValue.delete();
        orderChanged = true;
        totalOrderDeletes += 1;
      }

      if (orderChanged) {
        orderPatch.updatedAt = FieldValue.serverTimestamp();
        totalOrderUpdates += 1;
        if (!DRY_RUN) {
          batch.set(docSnap.ref, orderPatch, { merge: true });
          ops += 1;
        }
      }

      const ownerUid = typeof data.ownerUid === "string" ? data.ownerUid.trim() : "";
      if (ownerUid) {
        const userRef = db
          .collection("users")
          .doc(ownerUid)
          .collection("bookings")
          .doc(bookingId);

        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const userStatus = status === "cancelled" ? "cancelled" : (wpApproval === "confirmed" ? "confirmed" : "pending");
        const userPatch = {};
        let userChanged = false;

        const mappedDates = startDate && endDate ? `${startDate} - ${endDate}` : "";
        const createdAtIso = toIso(userData.createdAt || data.createdAt);

        const desiredFields = {
          bookingId,
          status: userStatus,
          wpApproval,
          itemTitle: String(data.itemTitle || "Rezervare"),
          unitName: typeof data.unitName === "string" ? data.unitName : null,
          nights: Number(data.nights || 0),
          totalPrice: Number(data.totalPrice || 0),
          dates: mappedDates || String(userData.dates || ""),
        };

        for (const [field, value] of Object.entries(desiredFields)) {
          if (!isEqual(userData[field], value)) {
            userPatch[field] = value;
            userChanged = true;
          }
        }

        if (!userData.createdAt) {
          userPatch.createdAt = createdAtIso;
          userChanged = true;
        }

        if (userData.guests !== undefined) {
          userPatch.guests = FieldValue.delete();
          userChanged = true;
          totalUserDeletes += 1;
        }

        if (userChanged) {
          userPatch.updatedAt = new Date().toISOString();
          totalUserUpdates += 1;
          if (!DRY_RUN) {
            batch.set(userRef, userPatch, { merge: true });
            ops += 1;
          }
        }
      }

      if (!DRY_RUN && ops >= 420) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (!DRY_RUN && ops > 0) {
      await batch.commit();
    }

    const lastDocId = snap.docs[snap.docs.length - 1].id;
    if (!DRY_RUN) {
      await CHECKPOINT_REF.set(
        {
          lastDocId,
          updatedAt: FieldValue.serverTimestamp(),
          processedCount: FieldValue.increment(snap.size),
        },
        { merge: true }
      );
    }

    startAfter = lastDocId;

    console.log(
      `[migrate-booking-schema-v2] page processed=${snap.size} total=${totalProcessed} orderUpdates=${totalOrderUpdates} userUpdates=${totalUserUpdates}`
    );

    if (snap.size < BATCH_SIZE) break;
  }

  console.log("\n[migrate-booking-schema-v2] done");
  console.log(`  processed orders: ${totalProcessed}`);
  console.log(`  order updates: ${totalOrderUpdates}`);
  console.log(`  user updates: ${totalUserUpdates}`);
  console.log(`  removed order heavy fields: ${totalOrderDeletes}`);
  console.log(`  removed user heavy fields: ${totalUserDeletes}`);
  console.log(`  dry run: ${DRY_RUN}`);
}

run().catch((error) => {
  console.error("[migrate-booking-schema-v2] failed:", error);
  process.exit(1);
});
