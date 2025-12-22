const API_BASE_URL = 'https://www.marinapark.ro/wp-json/wpbc-custom/v1';

/**
 * Creates a new booking via the WordPress API.
 * @param {Object} bookingData - The booking data.
 * @param {Array} bookingData.dates - Array of date strings (e.g., ['2023-10-25', '2023-10-26']).
 * @param {string} bookingData.name - Customer first name.
 * @param {string} bookingData.last_name - Customer last name.
 * @param {string} bookingData.email - Customer email.
 * @param {string} bookingData.phone - Customer phone.
 * @param {number} bookingData.resource_id - The resource ID (default 1).
 * @returns {Promise<Object>} The API response.
 */
export const createBooking = async (bookingData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/create-booking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to create booking');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};
