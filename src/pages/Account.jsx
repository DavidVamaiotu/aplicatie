import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bell, Moon, LogOut, Calendar, MapPin, Clock, ChevronRight, User, Mail, Shield, HelpCircle, Star, ArrowRight, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getUserBookings } from '../services/userService';
import { useLocalCache } from '../hooks/useLocalCache';

const Account = () => {
    const { darkMode, toggleDarkMode } = useTheme();
    const { user, logout, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [bookings, setBookings] = useState([]);
    const [loadingBookings, setLoadingBookings] = useState(false);
    const [cachedBookings, setCachedBookings] = useLocalCache('user_bookings_cache', [], 5 * 60 * 1000); // 5 min TTL

    // Fetch bookings when user is logged in
    useEffect(() => {
        if (!user?.uid) {
            setBookings([]);
            return;
        }

        // Show cached data immediately
        if (cachedBookings.length > 0) {
            setBookings(cachedBookings);
        }

        // Fetch fresh data
        const fetchBookings = async () => {
            setLoadingBookings(true);
            try {
                const data = await getUserBookings(user.uid);
                setBookings(data);
                setCachedBookings(data);
            } catch (err) {
                console.error('Failed to fetch bookings:', err);
            } finally {
                setLoadingBookings(false);
            }
        };
        fetchBookings();
    }, [user?.uid]);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    // Calculate stats from real bookings
    const stats = {
        totalBookings: bookings.length,
        totalNights: bookings.reduce((sum, b) => sum + (b.nights || 0), 0),
        totalSpent: bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0)
    };

    // Get user initials
    const getInitials = () => {
        if (!user) return '?';
        if (user.displayName) {
            const parts = user.displayName.split(' ');
            return parts.length >= 2
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : parts[0][0].toUpperCase();
        }
        if (user.email) return user.email[0].toUpperCase();
        return '?';
    };

    // ─── NOT LOGGED IN ──────────────────────────────────────────────
    if (!user && !authLoading) {
        return (
            <div className="account-page min-h-screen pb-safe">
                <div className="account-hero">
                    <div className="account-hero-bg"></div>
                    <div className="account-hero-content">
                        <div className="profile-card">
                            <div className="profile-avatar">
                                <span>?</span>
                                <div className="profile-avatar-ring"></div>
                            </div>
                            <div className="profile-info" style={{ flex: 1 }}>
                                <h2 className="profile-name">Bine ai venit!</h2>
                                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                                    Conectează-te pentru a vedea rezervările tale
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="account-content">
                    <div className="modern-card p-6 animate-slide-up" style={{ textAlign: 'center' }}>
                        <User size={48} className="text-primary" style={{ margin: '0 auto 16px' }} />
                        <h3 className="font-bold text-lg text-gray-900 mb-2">Contul Tău</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Conectează-te pentru a-ți gestiona rezervările și a accesa profilul tău.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="login-submit-btn tap-highlight"
                            style={{ width: '100%' }}
                        >
                            <span className="flex items-center justify-center gap-2">
                                Conectare
                                <ArrowRight size={18} />
                            </span>
                        </button>
                    </div>

                    {/* Settings still accessible without login */}
                    <div className="settings-section">
                        <h3 className="section-title">
                            <Settings size={18} />
                            Setări
                        </h3>
                        <div className="settings-card">
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
                            <div className="settings-item tap-highlight">
                                <div className="settings-item-left">
                                    <div className="settings-icon-wrapper">
                                        <HelpCircle size={18} />
                                    </div>
                                    <span>Ajutor & Suport</span>
                                </div>
                                <div className="settings-item-right">
                                    <ChevronRight size={18} className="settings-arrow" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── LOGGED IN ──────────────────────────────────────────────────
    const settingsItems = [
        { icon: User, label: 'Editează Profilul', hasArrow: true },
        { icon: Bell, label: 'Notificări', badge: 0, hasArrow: true },
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
                            {user?.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt={user.displayName || 'Avatar'}
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                />
                            ) : (
                                <span>{getInitials()}</span>
                            )}
                            <div className="profile-avatar-ring"></div>
                        </div>
                        <div className="profile-info">
                            <h2 className="profile-name">{user?.displayName || 'Utilizator'}</h2>
                            <div className="profile-email">
                                <Mail size={14} />
                                <span>{user?.email || 'N/A'}</span>
                            </div>
                            <div className="profile-member-badge">
                                <Star size={12} />
                                <span>Membru Marina Park</span>
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
                        <div className="stat-value">{stats.totalBookings}</div>
                        <div className="stat-label">Rezervări</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.totalNights}</div>
                        <div className="stat-label">Nopți</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.totalSpent}</div>
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
                                    {item.badge > 0 && (
                                        <span className="settings-badge">{item.badge}</span>
                                    )}
                                    {item.hasArrow && <ChevronRight size={18} className="settings-arrow" />}
                                </div>
                            </div>
                        ))}

                        {/* Dark Mode Toggle */}
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

                        {/* Logout */}
                        <div className="settings-item settings-item-danger tap-highlight" onClick={handleLogout}>
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
                        {loadingBookings && bookings.length === 0 ? (
                            <div className="modern-card p-6" style={{ textAlign: 'center' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                                <p className="text-sm text-gray-500 mt-3">Se încarcă rezervările...</p>
                            </div>
                        ) : bookings.length === 0 ? (
                            <div className="modern-card p-6" style={{ textAlign: 'center' }}>
                                <Calendar size={40} className="text-gray-300" style={{ margin: '0 auto 12px' }} />
                                <p className="text-sm text-gray-500">Nu ai nicio rezervare încă.</p>
                                <button
                                    onClick={() => navigate('/')}
                                    className="login-submit-btn tap-highlight mt-4"
                                    style={{ width: '100%' }}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        Explorează Camerele
                                    </span>
                                </button>
                            </div>
                        ) : (
                            bookings.map((booking, index) => (
                                <div
                                    key={booking.id}
                                    className="booking-card"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <div className="booking-card-header">
                                        <div className="booking-status-wrapper">
                                            <span className={`booking-status ${booking.status || 'confirmed'}`}>
                                                {booking.status === 'confirmed' ? 'Confirmat' :
                                                    booking.status === 'pending' ? 'În așteptare' : 'Anulat'}
                                            </span>
                                        </div>
                                        <span className="booking-nights">{booking.nights || 0} nopți</span>
                                    </div>

                                    <h4 className="booking-title">{booking.itemTitle || 'Rezervare'}</h4>

                                    <div className="booking-details">
                                        <div className="booking-detail">
                                            <MapPin size={14} />
                                            <span>Marina Park, Vama Veche</span>
                                        </div>
                                        <div className="booking-detail">
                                            <Clock size={14} />
                                            <span>{booking.dates || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="booking-card-footer">
                                        <span className="booking-price">{booking.totalPrice || 0} RON</span>
                                        <button className="booking-details-btn tap-highlight">
                                            Detalii
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Account;
