import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

const LoginPage = () => {
    const navigate = useNavigate();
    const { loginWithEmail, registerWithEmail, loginWithGoogle, authError, setAuthError } = useAuth();

    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [form, setForm] = useState({
        displayName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
        if (authError) setAuthError(null);
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isRegister) {
                if (form.password !== form.confirmPassword) {
                    setAuthError('Parolele nu coincid.');
                    setLoading(false);
                    return;
                }
                if (!form.displayName.trim()) {
                    setAuthError('Te rugăm să introduci numele tău.');
                    setLoading(false);
                    return;
                }
                await registerWithEmail(form.email, form.password, form.displayName);
            } else {
                await loginWithEmail(form.email, form.password);
            }
            navigate(-1);
        } catch {
            // Error already set in AuthContext
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setGoogleLoading(true);
        try {
            await loginWithGoogle();
            navigate(-1);
        } catch {
            // Error already set in AuthContext
        } finally {
            setGoogleLoading(false);
        }
    };

    const toggleMode = () => {
        setIsRegister(!isRegister);
        setAuthError(null);
        setForm({ displayName: '', email: '', password: '', confirmPassword: '' });
    };

    return (
        <div className="min-h-screen bg-gradient-dark flex flex-col">
            {/* Header */}
            <div className="login-hero">
                <div className="login-hero-bg"></div>
                <div className="login-hero-content">
                    <div className="login-logo-glow"></div>
                    <h1 className="login-title">
                        {isRegister ? 'Creează Cont' : 'Bine ai revenit'}
                    </h1>
                    <p className="login-subtitle">
                        {isRegister
                            ? 'Înregistrează-te pentru a-ți gestiona rezervările'
                            : 'Conectează-te la contul tău Marina Park'
                        }
                    </p>
                </div>
            </div>

            <div className="login-content">
                {/* Error Banner */}
                {authError && (
                    <div className="login-error animate-slide-up">
                        <AlertCircle size={18} />
                        <span>{authError}</span>
                    </div>
                )}

                {/* Email/Password Form */}
                <div className="modern-card p-6 animate-slide-up">
                    <form onSubmit={handleEmailSubmit} className="flex flex-col gap-5">
                        {isRegister && (
                            <div className="input-group">
                                <label htmlFor="displayName" className="input-label">Nume Complet</label>
                                <div className="input-wrapper">
                                    <User size={18} className="input-icon" />
                                    <input
                                        id="displayName"
                                        type="text"
                                        name="displayName"
                                        autoComplete="name"
                                        placeholder="Numele tău"
                                        value={form.displayName}
                                        onChange={handleChange}
                                        className="modern-input"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="input-group">
                            <label htmlFor="loginEmail" className="input-label">Email</label>
                            <div className="input-wrapper">
                                <Mail size={18} className="input-icon" />
                                <input
                                    id="loginEmail"
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    placeholder="email@exemplu.com"
                                    value={form.email}
                                    onChange={handleChange}
                                    required
                                    className="modern-input"
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label htmlFor="loginPassword" className="input-label">Parolă</label>
                            <div className="input-wrapper">
                                <Lock size={18} className="input-icon" />
                                <input
                                    id="loginPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={handleChange}
                                    required
                                    minLength={6}
                                    className="modern-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="password-toggle"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {isRegister && (
                            <div className="input-group">
                                <label htmlFor="confirmPassword" className="input-label">Confirmă Parola</label>
                                <div className="input-wrapper">
                                    <Lock size={18} className="input-icon" />
                                    <input
                                        id="confirmPassword"
                                        type={showPassword ? 'text' : 'password'}
                                        name="confirmPassword"
                                        autoComplete="new-password"
                                        placeholder="••••••••"
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                        required
                                        minLength={6}
                                        className="modern-input"
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="login-submit-btn tap-highlight"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="button-spinner"></div>
                                    Se încarcă...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    {isRegister ? 'Creează Cont' : 'Conectare'}
                                    <ArrowRight size={18} />
                                </span>
                            )}
                        </button>
                    </form>
                </div>

                {/* Divider */}
                <div className="login-divider">
                    <span>sau</span>
                </div>

                {/* Google Sign In */}
                <button
                    onClick={handleGoogle}
                    className="google-signin-btn tap-highlight animate-slide-up"
                    disabled={googleLoading}
                    style={{ animationDelay: '0.1s' }}
                >
                    {googleLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <div className="button-spinner"></div>
                            Se încarcă...
                        </span>
                    ) : (
                        <>
                            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Continuă cu Google
                        </>
                    )}
                </button>

                {/* Toggle Register/Login */}
                <div className="login-toggle animate-slide-up" style={{ animationDelay: '0.2s' }}>
                    <p>
                        {isRegister ? 'Ai deja un cont?' : 'Nu ai un cont?'}
                        <button onClick={toggleMode} className="login-toggle-btn">
                            {isRegister ? 'Conectare' : 'Înregistrare'}
                        </button>
                    </p>
                </div>

                {/* Guest Mode */}
                <button
                    onClick={() => navigate('/')}
                    className="guest-mode-btn tap-highlight animate-slide-up"
                    style={{ animationDelay: '0.3s' }}
                >
                    <Sparkles size={16} />
                    Continuă fără cont
                </button>
            </div>
        </div>
    );
};

export default LoginPage;
