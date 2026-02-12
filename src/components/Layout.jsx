import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
    const location = useLocation();
    const isBookingPage = location.pathname.startsWith('/book');
    const { user } = useAuth();

    // Generate initials from display name or email
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

    return (
        <div className="min-h-screen pb-safe">
            <header className="top-header">
                <div className="top-header-bg"></div>
                <div className="top-header-content container">
                    <div className="header-brand">
                        <img src={logo} alt="Marina Park" className="header-logo" />
                    </div>
                    <Link to={user ? "/account" : "/login"} className="header-avatar tap-highlight">
                        {user?.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName || 'Avatar'}
                                className="header-avatar-img"
                            />
                        ) : (
                            <span>{getInitials()}</span>
                        )}
                        <div className="header-avatar-ring"></div>
                    </Link>
                </div>
            </header>

            <main className="pt-header">
                <Outlet />
            </main>

            {!isBookingPage && <Navbar />}
        </div>
    );
};

export default Layout;
