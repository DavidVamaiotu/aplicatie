import { useState, useEffect } from 'react';

/**
 * Hook for reading/writing JSON to localStorage with an optional TTL.
 * @param {string} key - localStorage key
 * @param {*} defaultValue - fallback value if nothing cached or expired
 * @param {number} [ttlMs] - time-to-live in milliseconds (optional, no expiry if omitted)
 */
export const useLocalCache = (key, defaultValue, ttlMs) => {
    const [data, setData] = useState(() => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return defaultValue;

            const parsed = JSON.parse(raw);

            // Check TTL if applicable
            if (ttlMs && parsed._cachedAt) {
                const age = Date.now() - parsed._cachedAt;
                if (age > ttlMs) {
                    localStorage.removeItem(key);
                    return defaultValue;
                }
            }

            return parsed.value !== undefined ? parsed.value : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    const setCachedData = (newData) => {
        setData(newData);
        try {
            localStorage.setItem(key, JSON.stringify({
                value: newData,
                _cachedAt: Date.now()
            }));
        } catch {
            // localStorage full or unavailable
        }
    };

    const clearCache = () => {
        setData(defaultValue);
        localStorage.removeItem(key);
    };

    return [data, setCachedData, clearCache];
};
