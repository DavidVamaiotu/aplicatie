import { db } from './firebase.js';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const ensureBookingsField = async () => {
    console.log("Starting check for bookings field...");
    try {
        const roomsRef = collection(db, 'rooms');
        const roomsSnapshot = await getDocs(roomsRef);

        for (const roomDoc of roomsSnapshot.docs) {
            console.log(`Processing room: ${roomDoc.id}`);
            const unitsRef = collection(db, 'rooms', roomDoc.id, 'units');
            const unitsSnapshot = await getDocs(unitsRef);

            for (const unitDoc of unitsSnapshot.docs) {
                const unitData = unitDoc.data();

                // Check if bookings field exists
                if (!unitData.bookings) {
                    console.log(`  Initializing bookings for unit: ${unitDoc.id}`);
                    const unitRef = doc(db, 'rooms', roomDoc.id, 'units', unitDoc.id);
                    await updateDoc(unitRef, {
                        bookings: []
                    });
                } else {
                    // console.log(`  Unit ${unitDoc.id} already has bookings field.`);
                }

                // Also ensure unavailableDates is consistent if missing
                if (!unitData.unavailableDates) {
                    console.log(`  Initializing unavailableDates for unit: ${unitDoc.id}`);
                    const unitRef = doc(db, 'rooms', roomDoc.id, 'units', unitDoc.id);
                    await updateDoc(unitRef, {
                        unavailableDates: []
                    });
                }
            }
        }
        console.log("Check complete!");
    } catch (error) {
        console.error("Failed:", error);
    }
};

ensureBookingsField();
