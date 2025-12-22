import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCw1KLPe9Jk7ZIfVH0aYgbKBKIxzaiFW9Q",
    authDomain: "marina-park-booking-app.firebaseapp.com",
    projectId: "marina-park-booking-app",
    storageBucket: "marina-park-booking-app.firebasestorage.app",
    messagingSenderId: "595568513962",
    appId: "1:595568513962:web:e666f95711adb60e5a11d3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
