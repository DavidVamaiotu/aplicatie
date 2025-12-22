import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BookingSuccess = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const bookingData = location.state || {};
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        // Show booking details after checkmark animation completes
        const detailsTimer = setTimeout(() => {
            setShowDetails(true);
        }, 1800);

        // Auto redirect to home after 6 seconds
        const timer = setTimeout(() => {
            navigate('/');
        }, 6000);

        return () => {
            clearTimeout(detailsTimer);
            clearTimeout(timer);
        };
    }, [navigate]);

    return (
        <div className="success-page">
            {/* Line Art Animated Checkmark */}
            <div className="success-checkmark-lineart">
                <svg className="checkmark-svg" viewBox="0 0 100 100">
                    {/* Background circle outline */}
                    <circle
                        className="checkmark-circle-bg"
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="3"
                    />
                    {/* Animated circle stroke */}
                    <circle
                        className="checkmark-circle-stroke"
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="url(#circleGradientPage)"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                    {/* Checkmark path */}
                    <path
                        className="checkmark-path"
                        d="M30 52 L45 67 L72 35"
                        fill="none"
                        stroke="url(#checkGradientPage)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Gradient definitions */}
                    <defs>
                        <linearGradient id="circleGradientPage" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#22c55e" />
                            <stop offset="100%" stopColor="#15803d" />
                        </linearGradient>
                        <linearGradient id="checkGradientPage" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#4ade80" />
                            <stop offset="100%" stopColor="#22c55e" />
                        </linearGradient>
                    </defs>
                </svg>
                {/* Celebration particles */}
                <div className="success-particles">
                    <span className="particle"></span>
                    <span className="particle"></span>
                    <span className="particle"></span>
                    <span className="particle"></span>
                    <span className="particle"></span>
                    <span className="particle"></span>
                </div>
            </div>

            {/* Success Message */}
            <h1 className="success-title">Rezervare Confirmată!</h1>
            <p className="success-subtitle">Mulțumim pentru rezervare</p>

            {/* Booking Details - appears after animation */}
            {bookingData.bookingId && (
                <div className={`success-details ${showDetails ? 'visible' : ''}`}>
                    <div className="success-detail-row">
                        <span className="success-label">ID Rezervare</span>
                        <span className="success-value">#{bookingData.bookingId}</span>
                    </div>
                    {bookingData.unitName && (
                        <div className="success-detail-row">
                            <span className="success-label">Camera</span>
                            <span className="success-value">{bookingData.unitName}</span>
                        </div>
                    )}
                    {bookingData.guests && (
                        <div className="success-detail-row">
                            <span className="success-label">Oaspeți</span>
                            <span className="success-value">
                                {bookingData.guests.adults} Adulți, {bookingData.guests.children} Copii
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Progress bar - appears with details */}
            <div className={`success-progress ${showDetails ? 'visible' : ''}`}>
                <div className="success-progress-bar" style={{ animationDuration: '6s' }}></div>
            </div>

            <p className={`success-redirect-text ${showDetails ? 'visible' : ''}`}>Vei fi redirecționat automat...</p>
        </div>
    );
};

export default BookingSuccess;
