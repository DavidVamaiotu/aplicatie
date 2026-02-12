import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';

/**
 * Save or update user profile in Firestore.
 * Uses set with merge to avoid overwriting existing data.
 */
export const saveUserProfile = async (uid, data) => {
    try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, data, { merge: true });
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
 * Save a booking summary to the user's bookings subcollection.
 */
export const saveBookingToUser = async (uid, booking) => {
    try {
        const bookingsRef = collection(db, 'users', uid, 'bookings');
        await addDoc(bookingsRef, {
            ...booking,
            createdAt: new Date().toISOString()
        });
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
