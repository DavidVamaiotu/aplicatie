import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { addDays, parseISO, format } from 'date-fns';

export const getUnitsForRoom = async (roomId) => {
    try {
        const unitsRef = collection(db, 'rooms', roomId.toString(), 'units');
        const snapshot = await getDocs(unitsRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching units:", error);
        return [];
    }
};

export const getUnit = async (roomId, unitId) => {
    try {
        const unitRef = doc(db, 'rooms', roomId.toString(), 'units', unitId);
        const unitSnap = await getDoc(unitRef);

        if (unitSnap.exists()) {
            return { id: unitSnap.id, ...unitSnap.data() };
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching unit:", error);
        return null;
    }
};

export const checkUnitAvailability = async (roomId, dates) => {
    const units = await getUnitsForRoom(roomId);

    // Find a unit that is NOT booked on ANY of the requested dates
    const availableUnit = units.find(unit => {
        const bookings = unit.bookings || [];
        // Check if any requested date falls within any booking range
        return !dates.some(date => {
            return bookings.some(booking => date >= booking.start && date <= booking.end);
        });
    });

    return availableUnit;
};

export const getAvailableUnits = async (roomId, dates) => {
    const units = await getUnitsForRoom(roomId);
    return units.filter(unit => {
        const bookings = unit.bookings || [];
        return dates.every(date => {
            return !bookings.some(booking => date >= booking.start && date <= booking.end);
        });
    });
};

export const getUnavailableDatesForRoom = async (roomId) => {
    const units = await getUnitsForRoom(roomId);
    if (units.length === 0) return [];

    // Map of date -> count of booked units
    const dateCounts = {};

    units.forEach(unit => {
        const bookings = unit.bookings || [];
        bookings.forEach(booking => {
            let curr = parseISO(booking.start);
            const end = parseISO(booking.end);

            while (curr <= end) {
                const dateStr = format(curr, 'yyyy-MM-dd');
                dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
                curr = addDays(curr, 1);
            }
        });
    });

    // A date is unavailable for the ROOM TYPE only if ALL units are booked
    const fullyBookedDates = Object.keys(dateCounts).filter(date => dateCounts[date] >= units.length);

    return fullyBookedDates;
};

export const markUnitAsUnavailable = async (roomId, unitId, dates, bookingId) => {
    try {
        const unitRef = doc(db, 'rooms', roomId.toString(), 'units', unitId);

        // Strip time portion from dates (they may contain timestamps like "2025-06-24 15:00:01")
        const startDate = dates[0].split(' ')[0];
        const endDate = dates[dates.length - 1].split(' ')[0];

        await updateDoc(unitRef, {
            bookings: arrayUnion({
                id: bookingId,
                start: startDate,
                end: endDate
            })
        });
    } catch (error) {
        console.error("Error updating unit availability:", error);
        throw error;
    }
};
