

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

const rooms = [
    {
        id: 1,
        title: 'Camera Dubla',
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Minibar', 'Uscător de păr']
    },
    {
        id: 2,
        title: 'Camera Cvadrupla',
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Frigider', 'Balcon', 'Uscător de păr']
    },
    {
        id: 3,
        title: 'Camera dubla in Bungalow',
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'Terasă proprie', 'Minibar']
    }
];

const campingSpots = [
    {
        id: 101,
        title: 'Campare cu cortul personal',
        facilities: ['Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Zonă de grătar', 'Parcare']
    },
    {
        id: 102,
        title: 'Campare cu rulota personala',
        facilities: ['Racordare electricitate', 'Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Zonă de grătar', 'Parcare']
    },
    {
        id: 103,
        title: 'Campare Rulota – all seasons',
        facilities: ['Racordare electricitate', 'Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Pază 24/7', 'Parcare']
    }
];

const updateFacilities = async () => {
    console.log("Starting facilities update with Admin SDK...");

    const allUnits = [...rooms, ...campingSpots];

    for (const unit of allUnits) {
        try {
            await db.collection("rooms").doc(unit.id.toString()).update({
                facilities: unit.facilities
            });

            console.log(`Updated unit ${unit.id} (${unit.title}) with facilities.`);
        } catch (error) {
            console.error(`Error updating unit ${unit.id}:`, error);
        }
    }

    console.log("Update complete.");
    process.exit(0);
};


updateFacilities();
