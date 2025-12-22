import React, { useEffect, useState } from 'react';

const SuccessModal = ({ isOpen, onClose, bookingId, unitName, guests, checkInDate, checkOutDate, totalPrice }) => {
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Show booking details after checkmark animation completes
            const detailsTimer = setTimeout(() => {
                setShowDetails(true);
            }, 1800);

            // Auto close after 5 seconds (longer to allow reading details)
            const closeTimer = setTimeout(() => {
                onClose();
            }, 5000);

            return () => {
                clearTimeout(detailsTimer);
                clearTimeout(closeTimer);
            };
        } else {
            setShowDetails(false);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="success-modal-overlay">
            <div className="success-modal">
                {/* Line Art Animated Checkmark */}
                <div className="success-checkmark-lineart">
                    <svg className="checkmark-svg" viewBox="0 0 100 100">
                        {/* Background circle outline - draws first */}
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
                            stroke="url(#circleGradient)"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        {/* Checkmark path - draws after circle */}
                        <path
                            className="checkmark-path"
                            d="M30 52 L45 67 L72 35"
                            fill="none"
                            stroke="url(#checkGradient)"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        {/* Gradient definitions */}
                        <defs>
                            <linearGradient id="circleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#22c55e" />
                                <stop offset="100%" stopColor="#15803d" />
                            </linearGradient>
                            <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
                <h2 className="success-title">Rezervare Confirmată!</h2>
                <p className="success-subtitle">Mulțumim pentru rezervare</p>

                {/* Booking Details - appears after animation */}
                <div className={`success-details ${showDetails ? 'visible' : ''}`}>
                    <div className="success-detail-row">
                        <span className="success-label">ID Rezervare</span>
                        <span className="success-value">#{bookingId}</span>
                    </div>
                    <div className="success-detail-row">
                        <span className="success-label">Camera</span>
                        <span className="success-value">{unitName}</span>
                    </div>
                    {checkInDate && checkOutDate && (
                        <div className="success-detail-row">
                            <span className="success-label">Perioada</span>
                            <span className="success-value">{checkInDate} - {checkOutDate}</span>
                        </div>
                    )}
                    <div className="success-detail-row">
                        <span className="success-label">Oaspeți</span>
                        <span className="success-value">{guests?.adults || 0} Adulți, {guests?.children || 0} Copii</span>
                    </div>
                    {totalPrice && (
                        <div className="success-detail-row total">
                            <span className="success-label">Total</span>
                            <span className="success-value">{totalPrice} LEI</span>
                        </div>
                    )}
                </div>

                {/* Progress bar for auto-close */}
                <div className={`success-progress ${showDetails ? 'visible' : ''}`}>
                    <div className="success-progress-bar"></div>
                </div>
            </div>
        </div>
    );
};

export default SuccessModal;
