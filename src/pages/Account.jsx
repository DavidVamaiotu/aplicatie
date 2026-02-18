import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bell, Moon, LogOut, Calendar, MapPin, Clock, ChevronRight, User, Mail, Shield, HelpCircle, Star, ArrowRight, Sparkles, Tag, Percent, Gift, X, Check, Phone, MessageCircle, BellOff, Lock, KeyRound } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getUserBookings } from '../services/userService';
import { fetchUserDiscounts } from '../services/discountService';
import { useLocalCache } from '../hooks/useLocalCache';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { initPushNotifications, removePushToken } from '../services/pushNotificationService';

const Account = () => {
    const { darkMode, toggleDarkMode } = useTheme();
    const { user, logout, updateUserProfile, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [bookings, setBookings] = useState([]);
    const [loadingBookings, setLoadingBookings] = useState(false);
    const [cachedBookings, setCachedBookings] = useLocalCache('user_bookings_cache', [], 5 * 60 * 1000);

    const [discounts, setDiscounts] = useState([]);
    const [loadingDiscounts, setLoadingDiscounts] = useState(false);

    // ─── Modal States ─────────────────────────────────────────────
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [showSecurity, setShowSecurity] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);

    // ─── Edit Profile State ───────────────────────────────────────
    const [editName, setEditName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState(false);

    // ─── Security State ───────────────────────────────────────────
    const [resetEmailSent, setResetEmailSent] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);

    // ─── Notification State ───────────────────────────────────────
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
        return localStorage.getItem('push_notifications_enabled') !== 'false';
    });

    // Fetch discounts when user is logged in
    useEffect(() => {
        if (!user?.uid) {
            setDiscounts([]);
            return;
        }
        const loadDiscounts = async () => {
            setLoadingDiscounts(true);
            try {
                const data = await fetchUserDiscounts();
                setDiscounts(data);
            } catch (err) {
                console.error('Failed to fetch discounts:', err);
            } finally {
                setLoadingDiscounts(false);
            }
        };
        loadDiscounts();
    }, [user?.uid]);

    // Fetch bookings when user is logged in
    useEffect(() => {
        if (!user?.uid) {
            setBookings([]);
            return;
        }
        if (cachedBookings.length > 0) {
            setBookings(cachedBookings);
        }
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

    // ─── Edit Profile Handler ─────────────────────────────────────
    const handleOpenEditProfile = () => {
        setEditName(user?.displayName || '');
        setProfileSuccess(false);
        setShowEditProfile(true);
    };

    const handleSaveProfile = async () => {
        if (!editName.trim()) return;
        setSavingProfile(true);
        try {
            await updateUserProfile({ displayName: editName.trim() });
            setProfileSuccess(true);
            setTimeout(() => {
                setShowEditProfile(false);
                setProfileSuccess(false);
            }, 1200);
        } catch (err) {
            console.error('Failed to save profile:', err);
        } finally {
            setSavingProfile(false);
        }
    };

    // ─── Security Handler ─────────────────────────────────────────
    const handleSendPasswordReset = async () => {
        if (!user?.email) return;
        setSendingReset(true);
        try {
            await sendPasswordResetEmail(auth, user.email);
            setResetEmailSent(true);
        } catch (err) {
            console.error('Failed to send reset email:', err);
        } finally {
            setSendingReset(false);
        }
    };

    const handleOpenSecurity = () => {
        setResetEmailSent(false);
        setShowSecurity(true);
    };

    // ─── Notification Toggle ──────────────────────────────────────
    const handleToggleNotifications = async () => {
        const newValue = !notificationsEnabled;
        setNotificationsEnabled(newValue);
        localStorage.setItem('push_notifications_enabled', String(newValue));

        if (Capacitor.isNativePlatform()) {
            try {
                if (newValue) {
                    await initPushNotifications(user?.uid);
                } else {
                    await removePushToken(user?.uid);
                }
            } catch (err) {
                console.error('Failed to toggle notifications:', err);
            }
        }
    };

    // Calculate stats from real bookings
    const stats = {
        totalBookings: bookings.length,
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

    // Check if user signed in with Google (no password to change)
    const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com' ||
        auth.currentUser?.providerData?.[0]?.providerId === 'google.com';

    // ─── MODAL COMPONENT ──────────────────────────────────────────
    const Modal = ({ show, onClose, title, children }) => {
        if (!show) return null;
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">{title}</h3>
                        <button className="modal-close-btn tap-highlight" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>
                    <div className="modal-body">
                        {children}
                    </div>
                </div>
            </div>
        );
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
                            <div className="settings-item tap-highlight" onClick={() => setShowHelp(true)}>
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

                {/* Help Modal (accessible without login) */}
                <Modal show={showHelp} onClose={() => setShowHelp(false)} title="Ajutor & Suport">
                    <div className="help-support-content">
                        <p className="settings-modal-description">
                            Ai nevoie de ajutor? Contactează-ne prin una din metodele de mai jos:
                        </p>
                        <a href="tel:+40733224455" className="help-contact-item tap-highlight">
                            <div className="help-contact-icon">
                                <Phone size={20} />
                            </div>
                            <div className="help-contact-info">
                                <span className="help-contact-label">Telefon</span>
                                <span className="help-contact-value">+40 733 224 455</span>
                            </div>
                            <ChevronRight size={18} className="settings-arrow" />
                        </a>
                        <a href="https://wa.me/40733224455" target="_blank" rel="noopener noreferrer" className="help-contact-item tap-highlight">
                            <div className="help-contact-icon whatsapp">
                                <MessageCircle size={20} />
                            </div>
                            <div className="help-contact-info">
                                <span className="help-contact-label">WhatsApp</span>
                                <span className="help-contact-value">Scrie-ne un mesaj</span>
                            </div>
                            <ChevronRight size={18} className="settings-arrow" />
                        </a>
                        <a href="mailto:contact@marinapark.ro" className="help-contact-item tap-highlight">
                            <div className="help-contact-icon email">
                                <Mail size={20} />
                            </div>
                            <div className="help-contact-info">
                                <span className="help-contact-label">Email</span>
                                <span className="help-contact-value">contact@marinapark.ro</span>
                            </div>
                            <ChevronRight size={18} className="settings-arrow" />
                        </a>
                    </div>
                </Modal>
            </div>
        );
    }

    // ─── LOGGED IN ──────────────────────────────────────────────────
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
                        <button className="profile-edit-btn tap-highlight" onClick={handleOpenEditProfile}>
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
                </div>

                {/* Discounts Section */}
                <div className="discounts-section">
                    <h3 className="section-title">
                        <Tag size={18} />
                        Reducerile Mele
                    </h3>
                    <div className="discounts-list">
                        {loadingDiscounts ? (
                            <div className="modern-card p-6" style={{ textAlign: 'center' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                                <p className="text-sm text-gray-500 mt-3">Se caută reduceri disponibile...</p>
                            </div>
                        ) : discounts.length === 0 ? (
                            <div className="modern-card p-6" style={{ textAlign: 'center' }}>
                                <Gift size={40} className="text-gray-300" style={{ margin: '0 auto 12px' }} />
                                <p className="text-sm text-gray-500">Nu ai reduceri disponibile momentan.</p>
                                <p className="text-xs text-gray-400 mt-1">Reducerile apar automat când ești eligibil.</p>
                            </div>
                        ) : (
                            discounts.map((discount, index) => (
                                <div
                                    key={discount.id}
                                    className="discount-card"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <div className="discount-card-header">
                                        <div className="discount-badge-icon">
                                            <Percent size={20} />
                                        </div>
                                        <div className="discount-card-info">
                                            <h4 className="discount-card-name">{discount.name}</h4>
                                            <span className="discount-card-value">
                                                {discount.discountType === 'percentage'
                                                    ? `-${discount.discountValue}%`
                                                    : `-${discount.discountValue} RON`
                                                }
                                            </span>
                                        </div>
                                    </div>
                                    <div className="discount-card-details">
                                        {discount.roomTags && discount.roomTags.length > 0 && (
                                            <div className="discount-detail">
                                                <MapPin size={14} />
                                                <span>Camere: {discount.roomTags.join(', ')}</span>
                                            </div>
                                        )}
                                        <div className="discount-detail">
                                            <Clock size={14} />
                                            <span>Valabil până la {new Date(discount.validUntil).toLocaleDateString('ro-RO')}</span>
                                        </div>
                                        {discount.usesRemaining !== null && (
                                            <div className="discount-detail">
                                                <Sparkles size={14} />
                                                <span>{discount.usesRemaining} {discount.usesRemaining === 1 ? 'utilizare rămasă' : 'utilizări rămase'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Settings Section */}
                <div className="settings-section">
                    <h3 className="section-title">
                        <Settings size={18} />
                        Setări
                    </h3>
                    <div className="settings-card">
                        {/* Edit Profile */}
                        <div className="settings-item tap-highlight" onClick={handleOpenEditProfile}>
                            <div className="settings-item-left">
                                <div className="settings-icon-wrapper">
                                    <User size={18} />
                                </div>
                                <span>Editează Profilul</span>
                            </div>
                            <div className="settings-item-right">
                                <ChevronRight size={18} className="settings-arrow" />
                            </div>
                        </div>

                        {/* Notifications */}
                        <div className="settings-item tap-highlight" onClick={handleToggleNotifications}>
                            <div className="settings-item-left">
                                <div className="settings-icon-wrapper">
                                    {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
                                </div>
                                <span>Notificări</span>
                            </div>
                            <div className="settings-item-right">
                                <div className={`toggle-switch ${notificationsEnabled ? 'active' : ''}`}>
                                    <div className="toggle-knob"></div>
                                </div>
                            </div>
                        </div>

                        {/* Security */}
                        <div className="settings-item tap-highlight" onClick={handleOpenSecurity}>
                            <div className="settings-item-left">
                                <div className="settings-icon-wrapper">
                                    <Shield size={18} />
                                </div>
                                <span>Securitate</span>
                            </div>
                            <div className="settings-item-right">
                                <ChevronRight size={18} className="settings-arrow" />
                            </div>
                        </div>

                        {/* Help & Support */}
                        <div className="settings-item tap-highlight" onClick={() => setShowHelp(true)}>
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
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ─── MODALS ──────────────────────────────────────────────────── */}

            {/* Edit Profile Modal */}
            <Modal show={showEditProfile} onClose={() => setShowEditProfile(false)} title="Editează Profilul">
                <div className="edit-profile-content">
                    <div className="settings-modal-field">
                        <label className="settings-modal-label">Nume complet</label>
                        <input
                            type="text"
                            className="settings-modal-input"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Introdu numele tău"
                            disabled={savingProfile}
                        />
                    </div>
                    <div className="settings-modal-field">
                        <label className="settings-modal-label">Email</label>
                        <input
                            type="email"
                            className="settings-modal-input"
                            value={user?.email || ''}
                            disabled
                            style={{ opacity: 0.6 }}
                        />
                        <p className="settings-modal-hint">Emailul nu poate fi modificat.</p>
                    </div>
                    <button
                        className="login-submit-btn tap-highlight"
                        style={{ width: '100%', marginTop: '16px' }}
                        onClick={handleSaveProfile}
                        disabled={savingProfile || !editName.trim() || editName.trim() === user?.displayName}
                    >
                        {profileSuccess ? (
                            <span className="flex items-center justify-center gap-2">
                                <Check size={18} />
                                Salvat!
                            </span>
                        ) : savingProfile ? (
                            <span>Se salvează...</span>
                        ) : (
                            <span>Salvează</span>
                        )}
                    </button>
                </div>
            </Modal>

            {/* Security Modal */}
            <Modal show={showSecurity} onClose={() => setShowSecurity(false)} title="Securitate">
                <div className="security-content">
                    {isGoogleUser ? (
                        <div className="settings-modal-info-box">
                            <Lock size={24} style={{ color: 'var(--primary)', marginBottom: '8px' }} />
                            <p className="settings-modal-description">
                                Contul tău este conectat prin <strong>Google</strong>. Securitatea contului este gestionată de Google.
                            </p>
                            <a
                                href="https://myaccount.google.com/security"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="login-submit-btn tap-highlight"
                                style={{ width: '100%', marginTop: '16px', display: 'block', textAlign: 'center', textDecoration: 'none' }}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <Shield size={18} />
                                    Setări Securitate Google
                                </span>
                            </a>
                        </div>
                    ) : (
                        <div className="settings-modal-info-box">
                            <KeyRound size={24} style={{ color: 'var(--primary)', marginBottom: '8px' }} />
                            <p className="settings-modal-description">
                                Trimite un email de resetare a parolei la adresa <strong>{user?.email}</strong>.
                            </p>
                            {resetEmailSent ? (
                                <div className="settings-modal-success">
                                    <Check size={20} />
                                    <span>Email trimis! Verifică-ți inbox-ul.</span>
                                </div>
                            ) : (
                                <button
                                    className="login-submit-btn tap-highlight"
                                    style={{ width: '100%', marginTop: '16px' }}
                                    onClick={handleSendPasswordReset}
                                    disabled={sendingReset}
                                >
                                    {sendingReset ? (
                                        <span>Se trimite...</span>
                                    ) : (
                                        <span className="flex items-center justify-center gap-2">
                                            <Mail size={18} />
                                            Resetează Parola
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Help & Support Modal */}
            <Modal show={showHelp} onClose={() => setShowHelp(false)} title="Ajutor & Suport">
                <div className="help-support-content">
                    <p className="settings-modal-description">
                        Ai nevoie de ajutor? Contactează-ne prin una din metodele de mai jos:
                    </p>
                    <a href="tel:+40733224455" className="help-contact-item tap-highlight">
                        <div className="help-contact-icon">
                            <Phone size={20} />
                        </div>
                        <div className="help-contact-info">
                            <span className="help-contact-label">Telefon</span>
                            <span className="help-contact-value">+40 733 224 455</span>
                        </div>
                        <ChevronRight size={18} className="settings-arrow" />
                    </a>
                    <a href="https://wa.me/40733224455" target="_blank" rel="noopener noreferrer" className="help-contact-item tap-highlight">
                        <div className="help-contact-icon whatsapp">
                            <MessageCircle size={20} />
                        </div>
                        <div className="help-contact-info">
                            <span className="help-contact-label">WhatsApp</span>
                            <span className="help-contact-value">Scrie-ne un mesaj</span>
                        </div>
                        <ChevronRight size={18} className="settings-arrow" />
                    </a>
                    <a href="mailto:contact@marinapark.ro" className="help-contact-item tap-highlight">
                        <div className="help-contact-icon email">
                            <Mail size={20} />
                        </div>
                        <div className="help-contact-info">
                            <span className="help-contact-label">Email</span>
                            <span className="help-contact-value">contact@marinapark.ro</span>
                        </div>
                        <ChevronRight size={18} className="settings-arrow" />
                    </a>
                </div>
            </Modal>
        </div>
    );
};

export default Account;
