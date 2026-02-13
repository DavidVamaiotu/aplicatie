import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, orderBy, updateDoc, increment } from 'firebase/firestore';

/**
 * Save or update user profile in Firestore.
 * Uses set with merge to avoid overwriting existing data.
 * Automatically sets accountCreatedAt on first save for the rules engine.
 */
export const saveUserProfile = async (uid, data) => {
    try {
        const userRef = doc(db, 'users', uid);
        const existingDoc = await getDoc(userRef);

        const profileData = { ...data };

        // Set accountCreatedAt only on first save (for rules engine date_math)
        if (!existingDoc.exists() || !existingDoc.data()?.accountCreatedAt) {
            profileData.accountCreatedAt = new Date().toISOString();
        }

        // Initialize orderCount if not present
        if (!existingDoc.exists() || existingDoc.data()?.orderCount === undefined) {
            profileData.orderCount = existingDoc.exists() ? (existingDoc.data()?.orderCount || 0) : 0;
        }

        await setDoc(userRef, profileData, { merge: true });
    } catch (error) {
        console.error('Error saving user profile:', error);
        throw error;
    }
};

/**
 * Get user profile from Firestore.
 */
export const getUserProfile = async (uid) => {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        return snap.exists() ? { uid, ...snap.data() } : null;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
};

/**
 * Atomically increment the user's orderCount.
 * Called after a successful booking to keep the rules engine data accurate.
 */
export const incrementOrderCount = async (uid) => {
    try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
            orderCount: increment(1)
        });
    } catch (error) {
        console.error('Error incrementing order count:', error);
        // Non-critical — don't throw
    }
};

/**
 * Save a booking summary to the user's bookings subcollection.
 */
export const saveBookingToUser = async (uid, booking) => {
    try {
        const bookingsRef = collection(db, 'users', uid, 'bookings');
        await addDoc(bookingsRef, {
            ...booking,
            createdAt: new Date().toISOString()
        });
        // Also increment the order counter for the rules engine
        await incrementOrderCount(uid);
    } catch (error) {
        console.error('Error saving booking to user:', error);
        throw error;
    }
};

/**
 * Get all bookings for a user, ordered by creation date (newest first).
 */
export const getUserBookings = async (uid) => {
    try {
        const bookingsRef = collection(db, 'users', uid, 'bookings');
        const q = query(bookingsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        return [];
    }
};

