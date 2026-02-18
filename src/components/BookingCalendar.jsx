import { useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { addDays, isSameDay, parseISO, format } from "date-fns";
import { ro } from "date-fns/locale";

function normalizeDateString(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace("T", " ").split(" ")[0];
}

function hasChainedBooking(startSet, endSet) {
  if (!startSet || !endSet || startSet.size === 0 || endSet.size === 0) return false;
  for (const endId of endSet) {
    for (const startId of startSet) {
      if (startId !== endId) return true;
    }
  }
  return false;
}

export default function BookingCalendar({
  unavailableDates = [],
  bookings = [],
  selected,
  onSelect,
  className
}) {
  const {
    bookedStart,
    bookedMiddle,
    bookedEnd,
    chained,
    sortedBookingStartDates
  } = useMemo(() => {
    const startIdsByDate = new Map();
    const endIdsByDate = new Map();
    const middleDates = new Set();
    const allDates = new Set();

    if (Array.isArray(bookings) && bookings.length > 0) {
      bookings.forEach((booking, index) => {
        const startStr = normalizeDateString(booking?.start);
        const endStr = normalizeDateString(booking?.end);
        if (!startStr || !endStr) return;

        const startDate = parseISO(startStr);
        const endDate = parseISO(endStr);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;

        const bookingId = String(booking?.id ?? index);

        if (!startIdsByDate.has(startStr)) startIdsByDate.set(startStr, new Set());
        if (!endIdsByDate.has(endStr)) endIdsByDate.set(endStr, new Set());
        startIdsByDate.get(startStr).add(bookingId);
        endIdsByDate.get(endStr).add(bookingId);

        allDates.add(startStr);
        allDates.add(endStr);

        let cursor = addDays(startDate, 1);
        while (cursor < endDate) {
          const mid = format(cursor, "yyyy-MM-dd");
          middleDates.add(mid);
          allDates.add(mid);
          cursor = addDays(cursor, 1);
        }
      });
    }

    const bookedStartDates = [];
    const bookedMiddleDates = [];
    const bookedEndDates = [];
    const chainedDates = [];

    Array.from(allDates)
      .sort()
      .forEach((dateStr) => {
        const starts = startIdsByDate.get(dateStr);
        const ends = endIdsByDate.get(dateStr);
        const isMiddle = middleDates.has(dateStr);
        const isChained = hasChainedBooking(starts, ends);
        const parsedDate = parseISO(dateStr);
        if (Number.isNaN(parsedDate.getTime())) return;

        if (isChained) {
          chainedDates.push(parsedDate);
          return;
        }

        if (starts && ends) {
          bookedStartDates.push(parsedDate);
          bookedEndDates.push(parsedDate);
          return;
        }
        if (starts) {
          bookedStartDates.push(parsedDate);
          return;
        }
        if (ends) {
          bookedEndDates.push(parsedDate);
          return;
        }
        if (isMiddle) {
          bookedMiddleDates.push(parsedDate);
        }
      });

    return {
      bookedStart: bookedStartDates,
      bookedMiddle: bookedMiddleDates,
      bookedEnd: bookedEndDates,
      chained: chainedDates,
      sortedBookingStartDates: Array.from(startIdsByDate.keys()).sort(),
    };
  }, [bookings]);

  const handleRangeSelect = (val, selectedDay, modifiers) => {
    const isStartingNewRange = !selected?.from || (selected?.from && selected?.to);
    if (isStartingNewRange && modifiers?.booked_start) {
      return;
    }

    if (selected?.from && selected?.to) {
      onSelect({ from: selectedDay, to: undefined });
      return;
    }

    if (!val) {
      onSelect({ from: selectedDay, to: undefined });
      return;
    }

    if (val?.from && val?.to && isSameDay(val.from, val.to)) {
      onSelect({ from: val.from, to: undefined });
      return;
    }

    onSelect(val);
  };

  const disabledDays = useMemo(() => {
    const days = [...bookedMiddle, ...chained];

    if (selected?.from && !selected?.to) {
      const selectedFromStr = format(selected.from, "yyyy-MM-dd");
      days.push({ before: selected.from });

      const nextBookedStr = sortedBookingStartDates.find((date) => date > selectedFromStr) ||
        unavailableDates
          .map((value) => normalizeDateString(typeof value === "string" ? value : value?.date))
          .filter(Boolean)
          .sort()
          .find((date) => date > selectedFromStr);

      if (nextBookedStr) {
        const parsed = parseISO(nextBookedStr);
        if (!Number.isNaN(parsed.getTime())) {
          days.push({ after: parsed });
        }
      }
    }

    return days;
  }, [bookedMiddle, chained, selected?.from, selected?.to, sortedBookingStartDates, unavailableDates]);

  return (
    <div className={`relative ${className || ''}`}>
      <DayPicker
        mode="range"
        selected={selected}
        onSelect={handleRangeSelect}
        showOutsideDays={true}
        locale={ro}
        weekStartsOn={1}
        modifiers={{
          booked_start: bookedStart,
          booked_middle: bookedMiddle,
          booked_end: bookedEnd,
          chained,
          disabled: disabledDays
        }}
        classNames={{
          day_range_start: "rdp-day_range_start !bg-white !text-primary !rounded-l-md",
          day_range_end: "rdp-day_range_end !bg-white !text-primary !rounded-r-md",
        }}
        modifiersClassNames={{
          booked_start: "booked_start",
          booked_middle: "booked_middle",
          booked_end: "booked_end",
          chained: "chained"
        }}
        styles={{
          day: { margin: 0, width: "40px", height: "40px" }
        }}
      />
    </div>
  );
}
