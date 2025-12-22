import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../service-account.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// Room categories with their data
const roomCategories = [
    {
        id: 1,
        title: 'Camera Dubla',
        description: 'Cameră rustică cu piatră sedimentară organică, lemn și stuf. Perfectă pentru cupluri.',
        price: '250 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/01/IMG_20210528_140445-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Minibar', 'Uscător de păr'],
        // Units with WordPress resource IDs
        units: [
            { id: '8', name: 'Camera dubla 2' },
            { id: '9', name: 'Camera dubla 3' },
            { id: '10', name: 'Camera dubla 5' },
            { id: '11', name: 'Camera dubla 6' },
            { id: '12', name: 'Camera dubla 7' },
            { id: '13', name: 'Camera dubla 8' }
        ]
    },
    {
        id: 2,
        title: 'Camera Cvadrupla',
        description: 'Cameră spațioasă pentru familii sau grupuri. Design tradițional cu confort modern.',
        price: '400 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2023/07/cvadrupla-655x545.jpg',
        type: 'room',
        capacity: 4,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Frigider', 'Balcon', 'Uscător de păr'],
        units: [
            { id: '6', name: 'Camera cvadrupla 1' },
            { id: '7', name: 'Camera cvadrupla 4' }
        ]
    },
    {
        id: 3,
        title: 'Camera dubla in Bungalow',
        description: 'Experiență confortabilă în bungalow. Intim și aproape de natură.',
        price: '200 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/cam_bungalow-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'Terasă proprie', 'Minibar'],
        units: [
            { id: '14', name: 'Camera dubla in bungalow 9' },
            { id: '17', name: 'Camera dubla in bungalow 10' },
            { id: '18', name: 'Camera dubla in bungalow 11' },
            { id: '19', name: 'Camera dubla in bungalow 12' },
            { id: '20', name: 'Camera dubla in bungalow 14' },
            { id: '21', name: 'Camera dubla in bungalow 15' },
            { id: '22', name: 'Camera dubla in bungalow 16' }
        ]
    },
    {
        id: 4,
        title: 'Camera dubla in Bungalow Superior',
        description: 'Bungalow superior cu dotări premium. Experiență de lux aproape de natură.',
        price: '250 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/cam_bungalow-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'Terasă proprie', 'Minibar', 'TV', 'Frigider'],
        units: [
            { id: '23', name: 'Camera dubla in bungalow - superior 18' },
            { id: '24', name: 'Camera dubla in bungalow - superior 19' },
            { id: '25', name: 'Camera dubla in bungalow - superior 20' },
            { id: '26', name: 'Camera dubla in bungalow - superior 21' },
            { id: '27', name: 'Camera dubla in bungalow - superior 23' },
            { id: '29', name: 'Camera dubla in bungalow - superior 24' },
            { id: '30', name: 'Camera dubla in bungalow - superior 25' }
        ]
    }
];

const campingSpots = [
    {
        id: 101,
        title: 'Campare cu cortul personal',
        description: 'Adu-ți propriul cort. Acces la dușuri și toalete inclus.',
        price: '50 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2020/11/cort-655x532.jpg',
        type: 'camping',
        capacity: 2,
        facilities: ['Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Zonă de grătar', 'Parcare']
    },
    {
        id: 102,
        title: 'Campare cu rulota personala',
        description: 'Spațiu pentru rulota ta cu racordare la electricitate.',
        price: '100 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/hamace-1-655x532.jpg',
        type: 'camping',
        capacity: 4,
        facilities: ['Racordare electricitate', 'Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Zonă de grătar', 'Parcare']
    },
    {
        id: 103,
        title: 'Campare Rulota – all seasons',
        description: 'Spațiu de campare pentru rulote disponibil tot anul.',
        price: '120 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/rulote-655x545.jpg',
        type: 'camping',
        capacity: 4,
        facilities: ['Racordare electricitate', 'Acces la dușuri și toalete', 'Wi-Fi în zone comune', 'Pază 24/7', 'Parcare']
    }
];

const seedRooms = async () => {
    console.log("Starting room seeding with Admin SDK...\n");

    // Seed room categories with units
    for (const room of roomCategories) {
        const { units, ...roomData } = room;

        try {
            // Create/update room document
            await db.collection("rooms").doc(room.id.toString()).set(roomData);
            console.log(`✓ Created room category: ${room.title} (ID: ${room.id})`);

            // Create units subcollection
            for (const unit of units) {
                await db.collection("rooms").doc(room.id.toString())
                    .collection("units").doc(unit.id).set({
                        name: unit.name,
                        bookings: []
                    });
                console.log(`  └─ Added unit: ${unit.name} (Resource ID: ${unit.id})`);
            }
        } catch (error) {
            console.error(`Error creating room ${room.id}:`, error);
        }
    }

    // Seed camping spots (no units needed)
    console.log("\nSeeding camping spots...");
    for (const spot of campingSpots) {
        try {
            await db.collection("rooms").doc(spot.id.toString()).set(spot);
            console.log(`✓ Created camping spot: ${spot.title} (ID: ${spot.id})`);
        } catch (error) {
            console.error(`Error creating camping spot ${spot.id}:`, error);
        }
    }

    console.log("\n✅ Seeding complete!");
    process.exit(0);
};

seedRooms();
