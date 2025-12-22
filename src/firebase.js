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

enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled
        // in one tab at a a time.
        console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        // The current browser does not support all of the
        // features required to enable persistence
        console.warn('Firestore persistence is not supported by this browser');
    }
});
