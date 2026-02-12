import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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
export const auth = getAuth(app);

// Enable offline persistence for Firestore
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not available in this browser');
    }
});
