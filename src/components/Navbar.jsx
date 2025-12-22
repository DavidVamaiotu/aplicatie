import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Tent, User, Settings } from 'lucide-react';

const Navbar = () => {
    const navItems = [
        { path: '/', icon: <Home size={22} />, label: 'Camere' },
        { path: '/camping', icon: <Tent size={22} />, label: 'Camping' },
    ];

    return (
        <nav className="bottom-navbar">
            <div className="navbar-container">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `navbar-item tap-highlight ${isActive ? 'active' : ''}`
                        }
                    >
                        <span className="navbar-icon">{item.icon}</span>
                        <span className="navbar-label">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default Navbar;
