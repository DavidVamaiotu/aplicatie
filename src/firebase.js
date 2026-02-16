import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { Capacitor } from "@capacitor/core";

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
export const functions = getFunctions(app, "europe-west1");

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
const isNativePlatform = Capacitor.isNativePlatform();

if (typeof window !== "undefined" && isNativePlatform && appCheckDebugToken) {
    window.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === "true" ? true : appCheckDebugToken;
}

if (typeof window !== "undefined" && appCheckSiteKey) {
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true,
        });
    } catch (error) {
        console.error("Firebase App Check init failed. Verify VITE_FIREBASE_APPCHECK_SITE_KEY.", error);
    }
} else if (!appCheckSiteKey) {
    console.error("VITE_FIREBASE_APPCHECK_SITE_KEY is missing. Callable functions with App Check enforcement will fail.");
}

// Enable offline persistence for Firestore
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not available in this browser');
    }
});
