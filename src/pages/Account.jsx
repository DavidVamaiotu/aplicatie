import React, { useState, useEffect } from 'react';
import { Settings, Bell, Moon, LogOut, Calendar, MapPin, Clock, ChevronRight, User, Mail, Shield, HelpCircle, Star } from 'lucide-react';

const mockBookings = [
    {
        id: 1,
        propertyName: "Marina Park - Cameră Deluxe",
        location: "Vama Veche, Constanța",
        dates: "15 Aug - 20 Aug 2024",
        status: "confirmed",
        price: "1250 RON",
        nights: 5
    },
    {
        id: 3,
        propertyName: "Marina Park - Suită",
        location: "Vama Veche, Constanța",
        dates: "01 Iun - 05 Iun 2024",
        status: "cancelled",
        price: "2000 RON",
        nights: 4
    },
    {
        id: 4,
        propertyName: "Marina Park - Bungalow",
        location: "Marina Park Camping",
        dates: "25 Aug - 28 Aug 2024",
        status: "pending",
        price: "800 RON",
        nights: 3
    }
];

const Account = () => {
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('darkMode', darkMode);
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    const toggleDarkMode = () => {
        setDarkMode(!darkMode);
    };

    const settingsItems = [
        { icon: User, label: 'Editează Profilul', hasArrow: true },
        { icon: Bell, label: 'Notificări', badge: 2, hasArrow: true },
        { icon: Shield, label: 'Securitate', hasArrow: true },
        { icon: HelpCircle, label: 'Ajutor & Suport', hasArrow: true },
    ];

    return (
        <div className="account-page min-h-screen pb-safe">
            {/* Hero Header with Gradient */}
            <div className="account-hero">
                <div className="account-hero-bg"></div>
                <div className="account-hero-content">
                    {/* Profile Card - Glassmorphism */}
                    <div className="profile-card">
                        <div className="profile-avatar">
                            <span>JD</span>
                            <div className="profile-avatar-ring"></div>
                        </div>
                        <div className="profile-info">
                            <h2 className="profile-name">John Doe</h2>
                            <div className="profile-email">
                                <Mail size={14} />
                                <span>john.doe@example.com</span>
                            </div>
                            <div className="profile-member-badge">
                                <Star size={12} />
                                <span>Membru din 2024</span>
                            </div>
                        </div>
                        <button className="profile-edit-btn tap-highlight">
                            Editează
                        </button>
                    </div>
                </div>
            </div>

            <div className="account-content">
                {/* Quick Stats */}
                <div className="account-stats">
                    <div className="stat-card">
                        <div className="stat-value">3</div>
                        <div className="stat-label">Rezervări</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">12</div>
                        <div className="stat-label">Nopți</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">4050</div>
                        <div className="stat-label">RON Total</div>
                    </div>
                </div>

                {/* Settings Section */}
                <div className="settings-section">
                    <h3 className="section-title">
                        <Settings size={18} />
                        Setări
                    </h3>
                    <div className="settings-card">
                        {settingsItems.map((item, index) => (
                            <div key={index} className="settings-item tap-highlight">
                                <div className="settings-item-left">
                                    <div className="settings-icon-wrapper">
                                        <item.icon size={18} />
                                    </div>
                                    <span>{item.label}</span>
                                </div>
                                <div className="settings-item-right">
                                    {item.badge && (
                                        <span className="settings-badge">{item.badge}</span>
                                    )}
                                    {item.hasArrow && <ChevronRight size={18} className="settings-arrow" />}
                                </div>
                            </div>
                        ))}

                        {/* Dark Mode Toggle - Special Item */}
                        <div className="settings-item tap-highlight" onClick={toggleDarkMode}>
                            <div className="settings-item-left">
                                <div className="settings-icon-wrapper">
                                    <Moon size={18} />
                                </div>
                                <span>Mod Întunecat</span>
                            </div>
                            <div className="settings-item-right">
                                <div className={`toggle-switch ${darkMode ? 'active' : ''}`}>
                                    <div className="toggle-knob"></div>
                                </div>
                            </div>
                        </div>

                        {/* Logout - Red */}
                        <div className="settings-item settings-item-danger tap-highlight">
                            <div className="settings-item-left">
                                <div className="settings-icon-wrapper danger">
                                    <LogOut size={18} />
                                </div>
                                <span>Deconectare</span>
                            </div>
                            <ChevronRight size={18} className="settings-arrow" />
                        </div>
                    </div>
                </div>

                {/* Bookings Section */}
                <div className="bookings-section">
                    <h3 className="section-title">
                        <Calendar size={18} />
                        Rezervările Mele
                    </h3>
                    <div className="bookings-list">
                        {mockBookings.map((booking, index) => (
                            <div
                                key={booking.id}
                                className="booking-card"
                                style={{ animationDelay: `${index * 0.1}s` }}
                            >
                                <div className="booking-card-header">
                                    <div className="booking-status-wrapper">
                                        <span className={`booking-status ${booking.status}`}>
                                            {booking.status === 'confirmed' ? 'Confirmat' :
                                                booking.status === 'pending' ? 'În așteptare' : 'Anulat'}
                                        </span>
                                    </div>
                                    <span className="booking-nights">{booking.nights} nopți</span>
                                </div>

                                <h4 className="booking-title">{booking.propertyName}</h4>

                                <div className="booking-details">
                                    <div className="booking-detail">
                                        <MapPin size={14} />
                                        <span>{booking.location}</span>
                                    </div>
                                    <div className="booking-detail">
                                        <Clock size={14} />
                                        <span>{booking.dates}</span>
                                    </div>
                                </div>

                                <div className="booking-card-footer">
                                    <span className="booking-price">{booking.price}</span>
                                    <button className="booking-details-btn tap-highlight">
                                        Detalii
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Account;
