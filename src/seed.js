import { collection, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { rooms, campingSpots } from "./data/rooms";

export const seedDatabase = async () => {
    alert("Starting seed...");
    console.log("Starting seed...");
    const batch = writeBatch(db);

    rooms.forEach((room) => {
        const docRef = doc(db, "rooms", room.id.toString());
        batch.set(docRef, room);
    });

    campingSpots.forEach((spot) => {
        const docRef = doc(db, "rooms", spot.id.toString()); // Using same collection 'rooms' for simplicity, or 'camping'
        batch.set(docRef, spot);
    });

    try {
        await batch.commit();
        console.log("Database seeded successfully!");
        alert("Database seeded successfully!");
    } catch (error) {
        console.error("Error seeding database:", error);
        alert("Error seeding database: " + error.message);
    }
};
