import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';

import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { initPushNotifications } from './services/pushNotificationService';

const Home = lazy(() => import('./pages/Home'));
const Camping = lazy(() => import('./pages/Camping'));
const Account = lazy(() => import('./pages/Account'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const CampingBookingPage = lazy(() => import('./pages/CampingBookingPage'));
const BookingSuccess = lazy(() => import('./pages/BookingSuccess'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
      <div className="loading-spinner"></div>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (user?.uid) {
      initPushNotifications(user.uid);
    }
  }, [user?.uid]);

  useEffect(() => {
    // Configure Status Bar - white text on green to match header
    const configureStatusBar = async () => {
      try {
        await StatusBar.show();
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#15803d' });
      } catch (err) {
        console.log('StatusBar configuration failed', err);
      }
    };

    configureStatusBar();
  }, []);

  useEffect(() => {
    // Enable :active styles on mobile
    const noop = () => { };
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  useEffect(() => {
    // Handle back button
    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const pathname = pathnameRef.current;
      if (pathname === '/') {
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
  }, [navigate]);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="camping" element={<Camping />} />
          <Route path="account" element={<Account />} />
          <Route path="book/:type/:id" element={<BookingPage />} />
          <Route path="book-camping/:id" element={<CampingBookingPage />} />
        </Route>
        <Route path="/booking-success" element={<BookingSuccess />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
