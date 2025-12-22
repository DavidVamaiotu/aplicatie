import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Static data kept for reference or fallback
export const rooms = [
    {
        id: 1,
        title: 'Camera Dubla',
        description: 'Cameră rustică cu piatră sedimentară organică, lemn și stuf. Perfectă pentru cupluri.',
        price: '250 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/01/IMG_20210528_140445-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Minibar', 'Uscător de păr']
    },
    {
        id: 2,
        title: 'Camera Cvadrupla',
        description: 'Cameră spațioasă pentru familii sau grupuri. Design tradițional cu confort modern.',
        price: '400 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2023/07/cvadrupla-655x545.jpg',
        type: 'room',
        capacity: 4,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'TV', 'Frigider', 'Balcon', 'Uscător de păr']
    },
    {
        id: 3,
        title: 'Camera dubla in Bungalow',
        description: 'Experiență confortabilă în bungalow. Intim și aproape de natură.',
        price: '200 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/cam_bungalow-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'Terasă proprie', 'Minibar']
    },
    {
        id: 4,
        title: 'Camera dubla in Bungalow Superior',
        description: 'Bungalow superior cu dotări premium. Experiență de lux aproape de natură.',
        price: '250 RON',
        image: 'https://www.marinapark.ro/wp-content/uploads/2022/12/cam_bungalow-655x545.jpg',
        type: 'room',
        capacity: 2,
        facilities: ['Aer condiționat', 'Wi-Fi gratuit', 'Baie privată', 'Terasă proprie', 'Minibar', 'TV', 'Frigider']
    }
];

export const campingSpots = [
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

/**
 * Fetches all rooms from Firestore.
 * @returns {Promise<Array>} List of rooms.
 */
export const getRooms = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, 'rooms'));
        const items = querySnapshot.docs.map(doc => ({ id: parseInt(doc.id), ...doc.data() }));
        return items.filter(item => item.type === 'room');
    } catch (error) {
        console.error("Error fetching rooms:", error);
        return rooms; // Fallback to static data
    }
};

/**
 * Fetches all camping spots from Firestore.
 * @returns {Promise<Array>} List of camping spots.
 */
export const getCampingSpots = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, 'rooms'));
        const items = querySnapshot.docs.map(doc => ({ id: parseInt(doc.id), ...doc.data() }));
        return items.filter(item => item.type === 'camping');
    } catch (error) {
        console.error("Error fetching camping spots:", error);
        return campingSpots; // Fallback to static data
    }
};

/**
 * Fetches a single item by ID.
 * @param {number|string} id 
 * @returns {Promise<Object|null>} The item data.
 */
export const getItemById = async (id) => {
    try {
        const docRef = doc(db, 'rooms', id.toString());
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: parseInt(docSnap.id), ...docSnap.data() };
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching item:", error);
        // Fallback
        const all = [...rooms, ...campingSpots];
        return all.find(i => i.id === parseInt(id)) || null;
    }
};
