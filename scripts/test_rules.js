
import { db } from '../src/firebase.js';
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

// Helper to pause
const delay = ms => new Promise(res => setTimeout(res, ms));

const testRules = async () => {
    console.log("=== Testing Firestore Security Rules ===");

    // 1. Test Read Access
    try {
        console.log("\n[TEST 1] Reading Units (Should SUCCEED)...");
        const roomId = "1";
        const unitsRef = collection(db, 'rooms', roomId, 'units');
        const snapshot = await getDocs(unitsRef);
        console.log(`✅ Success! Found ${snapshot.size} units.`);
    } catch (error) {
        console.error("❌ Read Failed:", error.message);
    }

    // 2. Test Invalid Write (Destructive Update)
    try {
        console.log("\n[TEST 2] Deleting a booking (Should FAIL)...");
        // Try to remove a booking from unit 101 (if it has one)
        const unitRef = doc(db, 'rooms', '1', 'units', '101');
        const unitSnap = await getDoc(unitRef);

        if (unitSnap.exists()) {
            // Try to overwrite bookings with empty array
            await updateDoc(unitRef, { bookings: [] });
            console.error("❌ Destructive Update Succeeded (THIS IS BAD!)");
        } else {
            console.log("⚠️ Unit 101 not found, skipping delete test.");
        }
    } catch (error) {
        if (error.code === 'permission-denied') {
            console.log("✅ Destructive/Overwrite operation blocked correctly.");
        } else {
            console.error("❓ Unexpected error:", error);
        }
    }

    // 3. Test Valid Write (Append Booking)
    try {
        console.log("\n[TEST 3] Adding a valid booking (Should SUCCEED)...");
        const unitRef = doc(db, 'rooms', '1', 'units', '102'); // Using 102 as test target

        const newBooking = {
            id: 'test_rule_' + Date.now(),
            start: '2030-01-01',
            end: '2030-01-02'
        };

        // Note: arrayUnion technically allows appending, but our rule checks specifically for:
        // size == size + 1 AND previous elements identical.
        // arrayUnion fulfills this naturally if the element is new.

        await updateDoc(unitRef, {
            bookings: arrayUnion(newBooking)
        });
        console.log("✅ Valid booking added successfully.");

        // Clean up (Wait... we prevent deletion! So we can't clean up from the client!)
        console.log("ℹ️ Note: This test booking cannot be deleted by the client (working as intended).");

    } catch (error) {
        console.error("❌ Valid Write Failed:", error);
    }

    process.exit(0);
};

testRules();
