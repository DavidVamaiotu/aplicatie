import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import logo from '../assets/logo.png';

const Layout = () => {
    const location = useLocation();
    const isBookingPage = location.pathname.startsWith('/book');

    return (
        <div className="min-h-screen pb-safe">
            <header className="top-header">
                <div className="top-header-bg"></div>
                <div className="top-header-content container">
                    <div className="header-brand">
                        <img src={logo} alt="Marina Park" className="header-logo" />
                    </div>
                    <Link to="/account" className="header-avatar tap-highlight">
                        <span>JD</span>
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


