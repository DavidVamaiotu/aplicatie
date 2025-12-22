import { useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { addDays, isSameDay, parseISO, format } from "date-fns";
import { ro } from "date-fns/locale";

export default function BookingCalendar({
  unavailableDates = [],
  bookings = [],
  selected,
  onSelect,
  className
}) {
  // Process bookings to determine start, middle, and end of bookings
  const { bookedStart, bookedMiddle, bookedEnd, chained } = useMemo(() => {
    const start = [];
    const middle = [];
    const end = [];
    const chained = [];

    // If we have bookings data, use it as the primary source of truth
    if (bookings && bookings.length > 0) {
      // Create a map of date -> status based on bookings
      // We need to know for each date if it's a start, end, or middle of ANY booking
      // And specifically if it's a start/end of DIFFERENT bookings for chaining.

      // Collect all relevant dates from bookings
      const allDates = new Set();
      bookings.forEach(b => {
        // Add start and end
        allDates.add(b.start);
        allDates.add(b.end);

        // Add middle dates
        let curr = addDays(parseISO(b.start), 1);
        const last = parseISO(b.end);
        while (curr < last) {
          allDates.add(format(curr, 'yyyy-MM-dd'));
          curr = addDays(curr, 1);
        }
      });

      const sortedDates = Array.from(allDates).sort();

      sortedDates.forEach(dateStr => {
        const starts = bookings.filter(b => b.start === dateStr);
        const ends = bookings.filter(b => b.end === dateStr);

        // Check if it's in the middle of any booking
        const isMiddle = bookings.some(b => dateStr > b.start && dateStr < b.end);

        // Chained: Ends one booking AND Starts another (different IDs)
        const isChained = ends.some(e => starts.some(s => s.id !== e.id));

        if (isChained) {
          chained.push(parseISO(dateStr));
        } else if (starts.length > 0 && ends.length > 0) {
          // Single day booking (Start = End)
          start.push(parseISO(dateStr));
          end.push(parseISO(dateStr));
        } else if (starts.length > 0) {
          start.push(parseISO(dateStr));
        } else if (ends.length > 0) {
          end.push(parseISO(dateStr));
        } else if (isMiddle) {
          middle.push(parseISO(dateStr));
        }
      });
    }

    return { bookedStart: start, bookedMiddle: middle, bookedEnd: end, chained };
  }, [bookings]);

  const handleRangeSelect = (val, selectedDay, modifiers) => {
    // Prevent selecting a booked_start date as the start of a range
    // (We allow it as an end date, but not as a start date because the night is booked)
    const isStartingNewRange = !selected?.from || (selected?.from && selected?.to);
    if (isStartingNewRange && modifiers?.booked_start) {
      return;
    }

    // If a full range is already selected, reset to the new clicked day
    if (selected?.from && selected?.to) {
      onSelect({ from: selectedDay, to: undefined });
      return;
    }

    // Prevent deselecting the single selected day (double click behavior)
    if (!val) {
      onSelect({ from: selectedDay, to: undefined });
      return;
    }

    // Prevent selecting the same day for from and to
    if (val?.from && val?.to && isSameDay(val.from, val.to)) {
      onSelect({ from: val.from, to: undefined });
      return;
    }

    onSelect(val);
  };

  // Calculate the closest booked date after the selected start date
  const disabledDays = useMemo(() => {
    // Include both middle dates AND chained dates (fully booked turnover days)
    let days = [...bookedMiddle, ...chained];

    if (selected?.from && !selected?.to) {
      const selectedFromStr = format(selected.from, "yyyy-MM-dd");

      // Disable dates before the selected start date
      days.push({ before: selected.from });

      let nextBookedStr = null;

      if (bookings && bookings.length > 0) {
        // Find the earliest start date of a booking that starts AFTER the selected date
        // AND is not the same booking (if we were editing, but here we are creating new)
        // Actually, we just need to find the next unavailable date.
        // If I select Dec 10, and there is a booking starting Dec 15, I can't book past Dec 15.
        // The "next booked" date is the START of the next booking.
        const futureBookings = bookings.filter(b => b.start > selectedFromStr).sort((a, b) => a.start.localeCompare(b.start));
        if (futureBookings.length > 0) {
          nextBookedStr = futureBookings[0].start;
        }
      } else {
        // Fallback
        const sortedUnavailable = unavailableDates.map(u => (typeof u === 'string' ? u : u.date)).sort();
        nextBookedStr = sortedUnavailable.find(d => d > selectedFromStr);
      }

      if (nextBookedStr) {
        days.push({ after: parseISO(nextBookedStr) });
      }
    }

    return days;
  }, [bookedMiddle, bookedStart, chained, selected?.from, selected?.to, unavailableDates, bookings]);

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
          chained: chained,
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
          day: { margin: 0, width: "40px", height: "40px" } // Ensure square cells for gradients
        }}
      />
    </div>
  );
}