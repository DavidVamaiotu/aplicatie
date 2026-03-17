/**
 * Hybrid pricing service — resolves per-day prices using a 3-tier system:
 *   1. Per-day Firestore overrides  (rooms/{roomId}/pricing/{YYYY-MM})
 *   2. Seasonal pricingRules array  (on the room document)
 *   3. basePrice fallback           (on the room document)
 *
 * All prices are numeric (RON). Labels on pricingRules are optional.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format, addDays } from 'date-fns';

// ── Session cache for monthly override docs ────────────────────────────
// Key: "roomId/YYYY-MM"  →  Value: { "01": 95, "14": 200, … } | null
const overridesCache = new Map();

/**
 * Fetch a monthly override document from Firestore for a given room + month.
 * Returns an object mapping day strings ("01", "14", …) to prices, or null.
 * Caches the result per session so a second call with the same key is free.
 *
 * @param {string|number} roomId
 * @param {string} yearMonth  e.g. "2026-03"
 * @returns {Promise<Object|null>}
 */
export async function fetchMonthlyOverrides(roomId, yearMonth) {
  const cacheKey = `${roomId}/${yearMonth}`;
  if (overridesCache.has(cacheKey)) {
    return overridesCache.get(cacheKey);
  }

  try {
    const ref = doc(db, 'rooms', String(roomId), 'pricing', yearMonth);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    overridesCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`Failed to fetch pricing overrides for ${cacheKey}:`, err);
    overridesCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Resolve the price for a single date.
 *
 * Priority:
 *   1. Monthly override document  (if the specific day key exists)
 *   2. pricingRules array          (first rule whose [from, to] range contains the date)
 *   3. basePrice
 *
 * @param {Date|string} date        JS Date or "YYYY-MM-DD" string
 * @param {Object}      roomData    Room document including basePrice, pricingRules
 * @param {Object|null} overrides   Monthly override doc (day-keyed object)
 * @returns {{ price: number, source: 'override'|'rule'|'base', label?: string }}
 */
export function resolvePrice(date, roomData, overrides) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const dayStr = String(d.getDate()).padStart(2, '0');
  const dateStr = format(d, 'yyyy-MM-dd');

  // Extract base price: prefer numeric basePrice, fall back to parsing old string
  const basePrice = (roomData.basePrice ?? parseInt(String(roomData.price).replace(/[^0-9]/g, ''), 10)) || 0;

  // 1. Check per-day override
  if (overrides && overrides[dayStr] !== undefined) {
    return { price: overrides[dayStr], source: 'override' };
  }

  // 2. Check pricing rules
  const rules = roomData.pricingRules || [];
  for (const rule of rules) {
    if (dateStr >= rule.from && dateStr <= rule.to) {
      const result = { price: rule.price, source: 'rule' };
      if (rule.label) result.label = rule.label;
      return result;
    }
  }

  // 3. Fallback to base price
  return { price: basePrice, source: 'base' };
}

/**
 * Calculate an itemized nightly breakdown + total for a date range.
 * The range is counted as nights: [from, to) — check-in day is billed,
 * check-out day is NOT billed.
 *
 * @param {Date} from       Check-in date
 * @param {Date} to         Check-out date
 * @param {Object} roomData Room document data
 * @param {Map|Object} overridesMap  Map keyed by "YYYY-MM" → overrides object
 * @returns {{ nights: Array<{ date: string, price: number, source: string, label?: string }>, total: number }}
 */
export function calculateRangeTotal(from, to, roomData, overridesMap) {
  const nights = [];
  let total = 0;
  let cursor = new Date(from);
  const end = new Date(to);

  while (cursor < end) {
    const monthKey = format(cursor, 'yyyy-MM');
    const overrides = overridesMap instanceof Map
      ? overridesMap.get(monthKey) ?? null
      : overridesMap?.[monthKey] ?? null;

    const resolved = resolvePrice(cursor, roomData, overrides);
    nights.push({
      date: format(cursor, 'yyyy-MM-dd'),
      price: resolved.price,
      source: resolved.source,
      ...(resolved.label ? { label: resolved.label } : {})
    });
    total += resolved.price;
    cursor = addDays(cursor, 1);
  }

  return { nights, total };
}

/**
 * Convenience: resolve today's price for a room (used by room cards).
 * Fetches the current month's overrides (session-cached) and resolves.
 *
 * @param {Object} roomData  Room document data (must include id)
 * @returns {Promise<{ price: number, source: string, label?: string }>}
 */
export async function resolveTodayPrice(roomData) {
  const today = new Date();
  const monthKey = format(today, 'yyyy-MM');
  const overrides = await fetchMonthlyOverrides(roomData.id, monthKey);
  return resolvePrice(today, roomData, overrides);
}

/**
 * Given a set of months (e.g. ["2026-03", "2026-04"]), ensure override docs
 * for all of them are fetched and cached for a given room.
 *
 * @param {string|number} roomId
 * @param {string[]} months  Array of "YYYY-MM" strings
 * @returns {Promise<Map<string, Object|null>>}  Map of month → overrides
 */
export async function ensureOverridesForMonths(roomId, months) {
  const results = new Map();
  const fetches = months.map(async (m) => {
    const data = await fetchMonthlyOverrides(roomId, m);
    results.set(m, data);
  });
  await Promise.all(fetches);
  return results;
}

/**
 * Build a day-prices map for a visible calendar month.
 * Returns a Map of "YYYY-MM-DD" → { price, source, label? }.
 *
 * @param {number} year
 * @param {number} month  0-indexed (JS Date month)
 * @param {Object} roomData
 * @param {Object|null} overrides  The monthly override doc for that month
 * @returns {Map<string, { price: number, source: string, label?: string }>}
 */
export function buildDayPricesMap(year, month, roomData, overrides) {
  const map = new Map();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = format(d, 'yyyy-MM-dd');
    map.set(key, resolvePrice(d, roomData, overrides));
  }

  return map;
}
