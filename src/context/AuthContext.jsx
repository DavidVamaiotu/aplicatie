import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithCredential,
    GoogleAuthProvider,
    updateProfile as fbUpdateProfile,
    signOut
} from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from '../firebase';
import { saveUserProfile } from '../services/userService';

const AuthContext = createContext(undefined);

// Cache key for instant-load on cold start
const USER_CACHE_KEY = 'marina_park_user_cache';

const getCachedUser = () => {
    try {
        const cached = localStorage.getItem(USER_CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
    } catch {
        return null;
    }
};

const setCachedUser = (user) => {
    try {
        if (user) {
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            }));
        } else {
            localStorage.removeItem(USER_CACHE_KEY);
        }
    } catch {
        // localStorage unavailable
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => getCachedUser());
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    // Listen to Firebase auth state
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userData = {
                    uid: firebaseUser.uid,
                    displayName: firebaseUser.displayName,
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL
                };
                setUser(userData);
                setCachedUser(userData);

                // Ensure user profile exists in Firestore
                try {
                    await saveUserProfile(firebaseUser.uid, {
                        displayName: firebaseUser.displayName || '',
                        email: firebaseUser.email || '',
                        photoURL: firebaseUser.photoURL || '',
                        lastLogin: new Date().toISOString()
                    });
                } catch (err) {
                    console.error('Failed to save user profile:', err);
                }
            } else {
                setUser(null);
                setCachedUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Email/Password sign in
    const loginWithEmail = async (email, password) => {
        setAuthError(null);
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            return result.user;
        } catch (error) {
            setAuthError(getErrorMessage(error.code));
            throw error;
        }
    };

    // Email/Password registration
    const registerWithEmail = async (email, password, displayName) => {
        setAuthError(null);
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            // Set display name
            if (displayName) {
                await fbUpdateProfile(result.user, { displayName });
            }
            return result.user;
        } catch (error) {
            setAuthError(getErrorMessage(error.code));
            throw error;
        }
    };

    // Google sign in — uses native Capacitor plugin
    // The plugin opens the native Google Sign-In dialog (no WebView popup)
    // and returns an ID token, which we pass to Firebase Auth
    const loginWithGoogle = async () => {
        setAuthError(null);
        try {
            // 1. Native Google sign-in via Capacitor plugin
            const result = await FirebaseAuthentication.signInWithGoogle();

            // 2. Get the ID token from the native result
            const idToken = result.credential?.idToken;
            if (!idToken) {
                throw new Error('No ID token received from Google Sign-In');
            }

            // 3. Create a Firebase credential and sign in
            const credential = GoogleAuthProvider.credential(idToken);
            const firebaseResult = await signInWithCredential(auth, credential);
            return firebaseResult.user;
        } catch (error) {
            const message = error.code
                ? getErrorMessage(error.code)
                : (error.message || 'Autentificarea Google a eșuat.');
            setAuthError(message);
            throw error;
        }
    };

    // Update user profile
    const updateUserProfile = async (data) => {
        if (!auth.currentUser) return;
        try {
            await fbUpdateProfile(auth.currentUser, data);
            const updatedUser = {
                ...user,
                displayName: data.displayName || user.displayName,
                photoURL: data.photoURL || user.photoURL
            };
            setUser(updatedUser);
            setCachedUser(updatedUser);
        } catch (error) {
            console.error('Failed to update profile:', error);
            throw error;
        }
    };

    // Sign out
    const logout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setCachedUser(null);
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    };

    const value = {
        user,
        loading,
        authError,
        setAuthError,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        updateUserProfile,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Map Firebase error codes to Romanian-friendly messages
function getErrorMessage(code) {
    switch (code) {
        case 'auth/invalid-email':
            return 'Adresa de email nu este validă.';
        case 'auth/user-disabled':
            return 'Acest cont a fost dezactivat.';
        case 'auth/user-not-found':
            return 'Nu există un cont cu acest email.';
        case 'auth/wrong-password':
            return 'Parola este incorectă.';
        case 'auth/invalid-credential':
            return 'Email sau parolă incorectă.';
        case 'auth/email-already-in-use':
            return 'Există deja un cont cu acest email.';
        case 'auth/weak-password':
            return 'Parola trebuie să aibă cel puțin 6 caractere.';
        case 'auth/too-many-requests':
            return 'Prea multe încercări. Încearcă din nou mai târziu.';
        case 'auth/network-request-failed':
            return 'Eroare de rețea. Verifică conexiunea la internet.';
        case 'auth/popup-closed-by-user':
            return 'Autentificarea a fost anulată.';
        default:
            return 'A apărut o eroare. Încearcă din nou.';
    }
}
