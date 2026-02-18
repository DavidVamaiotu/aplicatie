import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

const DISCOUNT_CACHE_TTL_MS = 60 * 1000;
let discountCache = {
    uid: null,
    data: null,
    expiresAt: 0,
    promise: null
};

export const clearDiscountCache = () => {
    discountCache = {
        uid: null,
        data: null,
        expiresAt: 0,
        promise: null
    };
};

/**
 * Fetch all eligible discounts for the current user.
 * The Cloud Function derives userId from auth — no client payload needed.
 * @returns {Promise<Array>} Array of eligible discount campaign objects.
 */
export const fetchUserDiscounts = async () => {
    const uid = auth.currentUser?.uid || null;
    const now = Date.now();

    if (
        uid &&
        discountCache.uid === uid &&
        Array.isArray(discountCache.data) &&
        discountCache.expiresAt > now
    ) {
        return discountCache.data;
    }

    if (uid && discountCache.uid === uid && discountCache.promise) {
        return discountCache.promise;
    }

    try {
        const fn = httpsCallable(functions, 'evaluateUserDiscounts');
        const requestPromise = fn()
            .then((result) => {
                const discounts = result.data.discounts || [];
                if (uid) {
                    discountCache = {
                        uid,
                        data: discounts,
                        expiresAt: Date.now() + DISCOUNT_CACHE_TTL_MS,
                        promise: null
                    };
                }
                return discounts;
            })
            .catch((error) => {
                if (uid) {
                    discountCache.promise = null;
                }
                throw error;
            });

        if (uid) {
            discountCache = {
                uid,
                data: discountCache.uid === uid ? discountCache.data : null,
                expiresAt: discountCache.uid === uid ? discountCache.expiresAt : 0,
                promise: requestPromise
            };
        }

        return await requestPromise;
    } catch (error) {
        console.error('Failed to fetch discounts:', error);
        return [];
    }
};

/**
 * Apply a discount to a specific order.
 * Uses Firestore transaction on the backend to prevent race conditions.
 * @param {string} campaignId - The campaign to apply.
 * @param {string} orderId - The order to apply it to.
 * @returns {Promise<Object>} Result with discountType and discountValue.
 */
export const applyDiscountToOrder = async (campaignId, orderId) => {
    const fn = httpsCallable(functions, 'applyDiscount');
    const result = await fn({ campaignId, orderId });
    clearDiscountCache();
    return result.data;
};

/**
 * Filter discounts to only those applicable to a specific room.
 * @param {Array} discounts - Array of discount objects from fetchUserDiscounts.
 * @param {number|string} roomId - The room ID to filter for.
 * @returns {Array} Discounts that apply to this room (or have no roomTags restriction).
 */
export const getRoomDiscounts = (discounts, roomId) => {
    const numericId = parseInt(roomId);
    return discounts.filter(d => {
        // If no roomTags or empty array, the discount applies to ALL rooms
        if (!d.roomTags || d.roomTags.length === 0) return true;
        return d.roomTags.includes(numericId);
    });
};

/**
 * Calculate the discounted price for a given base price.
 * @param {number} basePrice - Original price.
 * @param {Object} discount - Discount object with discountType and discountValue.
 * @returns {number} The discounted price (never below 0).
 */
export const calculateDiscountedPrice = (basePrice, discount) => {
    if (!discount) return basePrice;
    if (discount.discountType === 'percentage') {
        return Math.max(0, Math.round(basePrice * (1 - discount.discountValue / 100)));
    }
    if (discount.discountType === 'fixed') {
        return Math.max(0, basePrice - discount.discountValue);
    }
    return basePrice;
};

/**
 * Get the best (highest value) non-stackable discount, or combine stackable ones.
 * @param {Array} discounts - Array of applicable discounts.
 * @param {number} basePrice - The original price to calculate against.
 * @returns {{ bestDiscount: Object|null, finalPrice: number, savings: number }}
 */
export const getBestDiscount = (discounts, basePrice) => {
    if (!discounts || discounts.length === 0) {
        return { bestDiscount: null, finalPrice: basePrice, savings: 0 };
    }

    // Separate stackable and non-stackable
    const stackable = discounts.filter(d => d.canStack);
    const nonStackable = discounts.filter(d => !d.canStack);

    // Find the best non-stackable discount
    let bestNonStackPrice = basePrice;
    let bestNonStack = null;
    for (const d of nonStackable) {
        const price = calculateDiscountedPrice(basePrice, d);
        if (price < bestNonStackPrice) {
            bestNonStackPrice = price;
            bestNonStack = d;
        }
    }

    // Calculate combined stackable discount
    let stackedPrice = basePrice;
    for (const d of stackable) {
        stackedPrice = calculateDiscountedPrice(stackedPrice, d);
    }

    // Return whichever gives the best deal
    if (stackable.length > 0 && stackedPrice < bestNonStackPrice) {
        return {
            bestDiscount: stackable.length === 1 ? stackable[0] : { name: 'Reduceri combinate', discountType: 'combined' },
            finalPrice: stackedPrice,
            savings: basePrice - stackedPrice,
        };
    }

    if (bestNonStack) {
        return {
            bestDiscount: bestNonStack,
            finalPrice: bestNonStackPrice,
            savings: basePrice - bestNonStackPrice,
        };
    }

    return { bestDiscount: null, finalPrice: basePrice, savings: 0 };
};
