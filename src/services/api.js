import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * Creates and reserves a booking via Cloud Functions.
 * Booking provider and Firestore writes are handled server-side.
 * @param {Object} bookingData - The booking data.
 * @param {Array} bookingData.dates - Array of date strings.
 * @param {'room'|'camping'} bookingData.bookingType - Booking type.
 * @param {number} bookingData.roomId - Firestore room document id.
 * @param {number} bookingData.resource_id - WordPress resource id.
 * @returns {Promise<Object>} The API response.
 */
export const createBooking = async (bookingData) => {
    try {
        const fn = httpsCallable(functions, 'createBookingAndReserve');
        const result = await fn(bookingData);
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        throw new Error(error?.message || 'Failed to create booking');
    }
};
