import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createBooking } from '../services/api';
import { getBookingCaptchaToken } from '../services/captchaService';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { fetchUserDiscounts, getRoomDiscounts, getBestDiscount } from '../services/discountService';
import { fetchMonthlyOverrides, buildDayPricesMap, calculateRangeTotal, ensureOverridesForMonths, groupBreakdownNights } from '../services/pricingService';
import { useParams, useNavigate } from 'react-router-dom';
import { format, addDays, isSameDay, differenceInDays } from 'date-fns';
import { getItemById } from '../data/rooms';
import { getUnitsForRoom, getUnavailableDatesFromUnits } from '../data/units';
import Button from '../components/Button';
import BookingCalendar from "../components/BookingCalendar";
import SuccessModal from '../components/SuccessModal';
import { X, ArrowRight, Minus, Plus, Share, Wifi, Tv, Flame, Wind, Utensils, Key, Award, Clock, User, Mail, Phone, Sparkles, Calendar, Users, ChevronDown, MapPin, Car, TreePine, Tag, Percent } from 'lucide-react';
import 'react-day-picker/dist/style.css';

const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

const BookingPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const today = new Date();
    const [range, setRange] = useState(undefined);
    const [guests, setGuests] = useState({ adults: 2, children: 0 });
    const [guestDetails, setGuestDetails] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    });

    // Auto-fill from logged-in user
    useEffect(() => {
        if (user) {
            const nameParts = (user.displayName || '').split(' ');
            setGuestDetails(prev => ({
                ...prev,
                firstName: prev.firstName || nameParts[0] || '',
                lastName: prev.lastName || nameParts.slice(1).join(' ') || '',
                email: prev.email || user.email || ''
            }));
        }
    }, [user]);

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetchingItem, setFetchingItem] = useState(true);
    const [fullyBookedDates, setFullyBookedDates] = useState([]);
    const [allUnits, setAllUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [bookingResult, setBookingResult] = useState(null);

    // Discount state
    const [userDiscounts, setUserDiscounts] = useState([]);
    const [roomDiscounts, setRoomDiscounts] = useState([]);

    // Pricing state
    const [dayPrices, setDayPrices] = useState(null);           // Map for calendar display
    const [overridesCache, setOverridesCache] = useState({});    // { "YYYY-MM": overridesObj|null }
    const [rangeBreakdown, setRangeBreakdown] = useState(null);  // { nights: [...], total }
    const currentMonthRef = useRef(format(today, 'yyyy-MM'));

    // Fetch discounts when user is logged in
    useEffect(() => {
        if (!user?.uid) return;
        const loadDiscounts = async () => {
            try {
                const allDiscounts = await fetchUserDiscounts();
                setUserDiscounts(allDiscounts);
            } catch (err) {
                console.error('Failed to fetch discounts:', err);
            }
        };
        loadDiscounts();
    }, [user?.uid]);

    // Filter discounts for the current room whenever item or discounts change
    useEffect(() => {
        if (item && userDiscounts.length > 0) {
            const applicable = getRoomDiscounts(userDiscounts, item.id);
            setRoomDiscounts(applicable);
        } else {
            setRoomDiscounts([]);
        }
    }, [item, userDiscounts]);

    React.useEffect(() => {
        const fetchItem = async () => {
            const data = await getItemById(id);
            setItem(data);

            // Fetch units once, then derive all unit/date UI state locally.
            if (data) {
                const units = await getUnitsForRoom(data.id);
                setAllUnits(units);
                setFullyBookedDates(getUnavailableDatesFromUnits(units));

                // Fetch current month overrides for pricing calendar
                const monthKey = format(today, 'yyyy-MM');
                const overrides = await fetchMonthlyOverrides(data.id, monthKey);
                setOverridesCache(prev => ({ ...prev, [monthKey]: overrides }));

                // Build initial day prices map
                const pricesMap = buildDayPricesMap(today.getFullYear(), today.getMonth(), data, overrides);
                setDayPrices(pricesMap);
            }

            setFetchingItem(false);
        };
        fetchItem();
    }, [id]);

    // Handle calendar month change — fetch overrides for the new month
    const handleMonthChange = useCallback(async (month) => {
        if (!item) return;
        const monthKey = format(month, 'yyyy-MM');
        currentMonthRef.current = monthKey;

        let overrides = overridesCache[monthKey];
        if (overrides === undefined) {
            overrides = await fetchMonthlyOverrides(item.id, monthKey);
            setOverridesCache(prev => ({ ...prev, [monthKey]: overrides }));
        }

        const pricesMap = buildDayPricesMap(month.getFullYear(), month.getMonth(), item, overrides);
        setDayPrices(pricesMap);
    }, [item, overridesCache]);

    // Calculate itemized breakdown when range changes
    useEffect(() => {
        if (!range?.from || !range?.to || !item) {
            setRangeBreakdown(null);
            return;
        }

        const calculateBreakdown = async () => {
            // Determine which months the range spans
            const months = new Set();
            let cursor = new Date(range.from);
            const end = new Date(range.to);
            while (cursor < end) {
                months.add(format(cursor, 'yyyy-MM'));
                cursor = addDays(cursor, 1);
            }

            // Fetch any missing month overrides
            const missingMonths = [...months].filter(m => overridesCache[m] === undefined);
            if (missingMonths.length > 0) {
                const fetched = await ensureOverridesForMonths(item.id, missingMonths);
                const newCache = { ...overridesCache };
                fetched.forEach((data, key) => {
                    newCache[key] = data;
                });
                setOverridesCache(newCache);
            }

            // Build overrides map for calculation using latest cache
            const overridesMap = new Map();
            months.forEach(m => {
                overridesMap.set(m, overridesCache[m] ?? null);
            });

            const breakdown = calculateRangeTotal(range.from, range.to, item, overridesMap);
            setRangeBreakdown(breakdown);
        };

        calculateBreakdown();
    }, [range?.from, range?.to, item, overridesCache]);

    if (fetchingItem) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
            <div className="loading-spinner"></div>
        </div>
    );
    if (!item) return <div className="min-h-screen flex items-center justify-center">Item not found</div>;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        if (authLoading) {
            alert('Se verifică sesiunea. Încearcă din nou în câteva secunde.');
            return;
        }

        const isAuthenticated = Boolean(auth.currentUser?.uid);
        if (user && !isAuthenticated) {
            alert('Sesiunea ta a expirat. Te rugăm să te reconectezi.');
            navigate('/login');
            return;
        }

        if (!guestDetails.firstName || !guestDetails.lastName || !guestDetails.email || !guestDetails.phone) {
            alert('Te rugăm să completezi toate detaliile personale!');
            return;
        }

        if (!range?.from || !range?.to) {
            alert('Te rugăm să selectezi perioada!');
            return;
        }

        if (!selectedUnit) {
            alert('Te rugăm să alegi o cameră!');
            return;
        }

        // Validate availability for the selected unit
        const dates = [];
        let currentDate = new Date(range.from);
        const endDate = new Date(range.to);

        let dateIndex = 0;
        const totalDates = Math.ceil((endDate - new Date(range.from)) / (1000 * 60 * 60 * 24)) + 1;

        while (currentDate <= endDate) {
            const dateStr = format(currentDate, 'yyyy-MM-dd');

            if (dateIndex === 0) {
                dates.push(`${dateStr} 15:00:01`);
            } else if (dateIndex === totalDates - 1) {
                dates.push(`${dateStr} 12:00:02`);
            } else {
                dates.push(`${dateStr} 00:00:00`);
            }

            currentDate = addDays(currentDate, 1);
            dateIndex++;
        }

        setLoading(true);

        try {
            const guestCaptchaToken = isAuthenticated ? '' : await getBookingCaptchaToken('create_booking_room');

            const bookingData = {
                bookingType: 'room',
                roomId: item.id,
                dates: dates,
                name: guestDetails.firstName,
                last_name: guestDetails.lastName,
                email: guestDetails.email,
                phone: guestDetails.phone,
                resource_id: parseInt(selectedUnit.id),
                unit_id: selectedUnit.id,
                unitId: selectedUnit.id,
                adults: guests.adults,
                children: guests.children,
                check_in: '15:00',
                check_out: '12:00',
                captcha_token: guestCaptchaToken
            };

            const result = await createBooking(bookingData);
            console.log('Booking created:', result);

            navigate('/booking-success', {
                state: {
                    bookingId: result.bookingId || result.booking_id,
                    unitName: result.unitName || selectedUnit.name,
                    guests: result.guests || guests,
                    syncStatus: result.syncStatus || 'synced'
                }
            });
        } catch (error) {
            console.error(error);
            alert(`Eroare la rezervare: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Determine which unavailable dates to show
    const datesToDisable = selectedUnit ? [] : fullyBookedDates;

    // Compute pricing for the bottom bar
    const pricingInfo = (() => {
        if (!range?.from || !range?.to || !rangeBreakdown) return null;
        const nights = differenceInDays(range.to, range.from);
        const { bestDiscount, finalPrice, savings } = getBestDiscount(roomDiscounts, rangeBreakdown.total);
        return { nights, total: rangeBreakdown.total, bestDiscount, finalPrice, savings, breakdown: rangeBreakdown.nights };
    })();

    return (
        <div className="min-h-screen bg-gradient-dark pb-40">
            {/* Top Image Section - Edge to edge with rounded bottom */}
            <div className="relative w-full overflow-hidden bg-gray-200 rounded-b-3xl hero-image-container" style={{ aspectRatio: '4/3' }}>
                <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover hero-image"
                />
                {/* Dark gradient overlay for status bar visibility */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/40 to-transparent"></div>
                <div className="absolute top-0 left-0 right-0 p-4 pt-safe flex justify-between items-start">
                    <button
                        onClick={() => navigate(-1)}
                        className="glass-button w-10 h-10 rounded-full flex items-center justify-center tap-highlight"
                    >
                        <X size={20} className="text-gray-900" />
                    </button>
                    <button className="glass-button w-10 h-10 rounded-full flex items-center justify-center tap-highlight">
                        <Clock size={20} className="text-gray-900" />
                    </button>
                </div>
                {/* Image counter badge */}
                <div className="absolute bottom-4 right-4 glass-badge px-3 py-1.5 rounded-lg text-xs font-medium">
                    <span className="text-white">1 / 7</span>
                </div>
            </div>

            <div className="px-5 py-6 flex flex-col gap-6">
                {/* Details Section - Modern Card */}
                <div className="modern-card p-6 animate-slide-up">
                    {/* Title */}
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-3 leading-tight">{item.title}</h1>
                    </div>

                    {/* Discount Banner */}
                    {roomDiscounts.length > 0 && (
                        <div className="discount-banner animate-slide-up">
                            <div className="discount-banner-icon">
                                <Tag size={18} />
                            </div>
                            <div className="discount-banner-content">
                                {roomDiscounts.map((d, i) => (
                                    <div key={d.id} className="discount-banner-item">
                                        <span className="discount-banner-name">{d.name}</span>
                                        <span className="discount-banner-value">
                                            {d.discountType === 'percentage'
                                                ? `-${d.discountValue}%`
                                                : `-${d.discountValue} RON`
                                            }
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="section-divider"></div>

                    {/* Amenities - Modern Pills */}
                    <div>
                        <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                            <Sparkles size={18} className="text-primary" />
                            Facilități
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            {item.facilities && item.facilities.length > 0 ? (
                                item.facilities.map((facility, index) => (
                                    <span key={index} className="amenity-pill">
                                        <Sparkles size={16} className="text-primary" /> {facility}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-500 italic">Facilitățile vor fi adăugate în curând.</span>
                            )}
                        </div>
                    </div>

                    <div className="section-divider"></div>

                    {/* Highlights - Enhanced */}
                    <div className="flex flex-col gap-5">
                        <div className="highlight-item">
                            <div className="highlight-icon">
                                <MapPin className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Aproape de plajă</h3>
                                <p className="text-sm text-gray-500">La doar 2 minute de mers pe jos de plaja Vama Veche</p>
                            </div>
                        </div>
                        <div className="highlight-item">
                            <div className="highlight-icon">
                                <Car className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Parcare gratuită</h3>
                                <p className="text-sm text-gray-500">Loc de parcare privat inclus pentru toți oaspeții</p>
                            </div>
                        </div>
                        <div className="highlight-item">
                            <div className="highlight-icon">
                                <TreePine className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Foișor</h3>
                                <p className="text-sm text-gray-500">Zonă de relaxare în aer liber cu umbrar și grătar</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Booking Form Section */}
                <div id="booking-section" className="flex flex-col gap-6 pt-2">
                    <h2 className="section-title px-2">
                        <Calendar size={22} className="text-primary" />
                        Selectează Perioada
                    </h2>

                    {/* Room Selection - Enhanced */}
                    {allUnits.length > 0 && (
                        <div className="modern-card p-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                            <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                                <Key size={18} className="text-primary" />
                                Alege Camera
                            </h2>
                            <div className="relative">
                                <select
                                    value={selectedUnit?.id || ''}
                                    onChange={(e) => {
                                        const unitId = e.target.value;
                                        const unit = allUnits.find((entry) => entry.id === unitId) || null;
                                        setSelectedUnit(unit);
                                        setRange(undefined);
                                    }}
                                    className="modern-select"
                                >
                                    <option value="" disabled>Selectează o cameră...</option>
                                    {allUnits.map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                            {unit.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="select-arrow">
                                    <ChevronDown size={20} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Calendar & Guest Selection - Enhanced Card */}
                    <div className="modern-card p-6 flex flex-col gap-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                        {/* Calendar */}
                        <div className="flex justify-center">
                            <BookingCalendar
                                unavailableDates={datesToDisable}
                                bookings={selectedUnit?.bookings || []}
                                selected={range}
                                onSelect={setRange}
                                dayPrices={dayPrices}
                                onMonthChange={handleMonthChange}
                            />
                        </div>

                        {/* Dates Display - Modern */}
                        <div className="dates-display">
                            <div className="date-box">
                                <p className="date-label">SOSIRE</p>
                                <p className="date-value">
                                    {range?.from ? format(range.from, 'MMM dd') : '--'}
                                </p>
                                <p className="date-day">
                                    {range?.from ? format(range.from, 'EEEE') : '--'}
                                </p>
                            </div>

                            <div className="date-arrow">
                                <ArrowRight size={20} />
                            </div>

                            <div className="date-box">
                                <p className="date-label">PLECARE</p>
                                <p className="date-value">
                                    {range?.to ? format(range.to, 'MMM dd') : '--'}
                                </p>
                                <p className="date-day">
                                    {range?.to ? format(range.to, 'EEEE') : '--'}
                                </p>
                            </div>
                        </div>

                        {/* Guest Counters - Enhanced */}
                        <div className="guests-container">
                            <h3 className="font-bold text-lg text-gray-900 mb-5 flex items-center justify-center gap-2">
                                <Users size={18} className="text-primary" />
                                Oaspeți
                            </h3>
                            <div className="flex justify-center gap-10">
                                {/* Adults */}
                                <div className="guest-counter">
                                    <p className="guest-label">Adulți</p>
                                    <p className="guest-value">{guests.adults}</p>
                                    <div className="counter-buttons">
                                        <button
                                            type="button"
                                            onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                                            className="counter-btn tap-highlight"
                                        >
                                            <Minus size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGuests(g => ({ ...g, adults: g.adults + 1 }))}
                                            className="counter-btn tap-highlight"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>
                                {/* Children */}
                                <div className="guest-counter">
                                    <p className="guest-label">Copii</p>
                                    <p className="guest-sublabel">50% reducere</p>
                                    <p className="guest-value">{guests.children}</p>
                                    <div className="counter-buttons">
                                        <button
                                            type="button"
                                            onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                                            className="counter-btn tap-highlight"
                                        >
                                            <Minus size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGuests(g => ({ ...g, children: g.children + 1 }))}
                                            className="counter-btn tap-highlight"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Itemized Price Breakdown */}
                    {pricingInfo && (
                        <div className="modern-card p-6 animate-slide-up" style={{ animationDelay: '0.25s' }}>
                            <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                                <Tag size={18} className="text-primary" />
                                Detalii Preț
                            </h2>
                            <div className="price-breakdown-list">
                                {groupBreakdownNights(pricingInfo.breakdown).map((group, i) => (
                                    <div key={i} className="price-breakdown-row">
                                        <span className="price-breakdown-date">
                                            {group.count === 1
                                                ? format(new Date(group.from + 'T00:00:00'), 'dd MMM')
                                                : `${format(new Date(group.from + 'T00:00:00'), 'dd')}–${format(new Date(group.to + 'T00:00:00'), 'dd MMM')}`
                                            }
                                        </span>
                                        <span className="price-breakdown-amount">
                                            {group.count === 1
                                                ? `${group.price} RON`
                                                : `${group.price} × ${group.count} = ${group.subtotal} RON`
                                            }
                                            {group.label && (
                                                <span className="price-breakdown-label"> ({group.label})</span>
                                            )}
                                            {group.source === 'override' && !group.label && (
                                                <span className="price-breakdown-label"> (Preț special)</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                                <div className="price-breakdown-divider"></div>
                                <div className="price-breakdown-row price-breakdown-total">
                                    <span>Total ({pricingInfo.nights} {pricingInfo.nights === 1 ? 'noapte' : 'nopți'})</span>
                                    <span>{pricingInfo.total} RON</span>
                                </div>
                                {pricingInfo.bestDiscount && (
                                    <div className="price-breakdown-row price-breakdown-discount">
                                        <span>Reducere</span>
                                        <span>-{pricingInfo.savings} RON</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Personal Details Form - Enhanced */}
                    <div className="modern-card p-6 animate-slide-up" style={{ animationDelay: '0.3s' }}>
                        <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                            <User size={18} className="text-primary" />
                            Date Personale
                        </h2>
                        <form id="booking-form" onSubmit={handleSubmit} className="flex flex-col gap-5" autoComplete="on">
                            <div className="input-group">
                                <label htmlFor="firstName" className="input-label">Prenume</label>
                                <div className="input-wrapper">
                                    <User size={18} className="input-icon" />
                                    <input
                                        id="firstName"
                                        type="text"
                                        name="firstName"
                                        autoComplete="given-name"
                                        placeholder="Numele tău"
                                        value={guestDetails.firstName}
                                        onChange={(e) => setGuestDetails({ ...guestDetails, firstName: e.target.value })}
                                        className="modern-input"
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label htmlFor="lastName" className="input-label">Nume de Familie</label>
                                <div className="input-wrapper">
                                    <User size={18} className="input-icon" />
                                    <input
                                        id="lastName"
                                        type="text"
                                        name="lastName"
                                        autoComplete="family-name"
                                        placeholder="Numele de familie"
                                        value={guestDetails.lastName}
                                        onChange={(e) => setGuestDetails({ ...guestDetails, lastName: e.target.value })}
                                        className="modern-input"
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label htmlFor="email" className="input-label">Email</label>
                                <div className="input-wrapper">
                                    <Mail size={18} className="input-icon" />
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        autoComplete="email"
                                        placeholder="email@exemplu.com"
                                        value={guestDetails.email}
                                        onChange={(e) => setGuestDetails({ ...guestDetails, email: e.target.value })}
                                        className="modern-input"
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label htmlFor="phone" className="input-label">Telefon</label>
                                <div className="input-wrapper">
                                    <Phone size={18} className="input-icon" />
                                    <input
                                        id="phone"
                                        type="tel"
                                        name="phone"
                                        autoComplete="tel"
                                        placeholder="+40 700 000 000"
                                        value={guestDetails.phone}
                                        onChange={(e) => setGuestDetails({ ...guestDetails, phone: e.target.value })}
                                        className="modern-input"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* Bottom Fixed Bar - Premium Floating Design */}
            <div className="bottom-bar">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        {pricingInfo ? (() => {
                            return (
                                <>
                                    <div className="flex items-baseline gap-2">
                                        {pricingInfo.bestDiscount ? (
                                            <>
                                                <span className="price-original">{pricingInfo.total} RON</span>
                                                <span className="price-discounted">{pricingInfo.finalPrice} RON</span>
                                            </>
                                        ) : (
                                            <span className="price-total">{pricingInfo.total} RON</span>
                                        )}
                                        <span className="price-label">total</span>
                                    </div>
                                    <p className="price-breakdown">
                                        {pricingInfo.nights} {pricingInfo.nights === 1 ? 'noapte' : 'nopți'}
                                        {pricingInfo.bestDiscount && (
                                            <span className="price-savings"> (-{pricingInfo.savings} RON)</span>
                                        )}
                                    </p>
                                </>
                            );
                        })() : (
                            <>
                                <div className="flex items-baseline gap-2">
                                    <span className="price-total">
                                        {item.basePrice ?? parseInt(String(item.price).replace(/[^0-9]/g, ''), 10)} RON
                                    </span>
                                    <span className="price-label">/ noapte</span>
                                </div>
                                <p className="price-cta">Selectează datele</p>
                            </>
                        )}
                    </div>
                    {/* Book Now Button - Premium Style */}
                    <button
                        onClick={(e) => {
                            if (!range?.from || !guestDetails.firstName) {
                                document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
                            } else {
                                handleSubmit(e);
                            }
                        }}
                        className="book-button tap-highlight"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="button-spinner"></div>
                                Se încarcă...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Sparkles size={18} />
                                Rezervă
                            </span>
                        )}
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                    Protejat de reCAPTCHA (verificare invizibilă).
                </p>
            </div>

            {/* Success Modal */}
            <SuccessModal
                isOpen={showSuccessModal}
                onClose={() => {
                    setShowSuccessModal(false);
                    navigate('/');
                }}
                bookingId={bookingResult?.id}
                unitName={bookingResult?.unitName}
                guests={guests}
            />
        </div>
    );
};

export default BookingPage;
