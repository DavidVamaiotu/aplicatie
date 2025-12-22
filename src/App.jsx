import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Camping from './pages/Camping';
import Account from './pages/Account';
import BookingPage from './pages/BookingPage';
import BookingSuccess from './pages/BookingSuccess';

import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Configure Status Bar
    const configureStatusBar = async () => {
      try {
        await StatusBar.show();
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' });
      } catch (err) {
        console.log('StatusBar configuration failed', err);
      }
    };
    configureStatusBar();

    // Enable :active styles on mobile
    document.addEventListener('touchstart', () => { }, { passive: true });

    // Handle back button
    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (location.pathname === '/') {
        CapacitorApp.exitApp();
      } else if (canGoBack) {
        navigate(-1);
      } else {
        navigate('/');
      }
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [navigate, location]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="camping" element={<Camping />} />
        <Route path="account" element={<Account />} />
        <Route path="book/:type/:id" element={<BookingPage />} />
      </Route>
      <Route path="/booking-success" element={<BookingSuccess />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
