import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, deleteField } from 'firebase/firestore';
import { getRooms, getCampingSpots } from '../data/rooms';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Trash2, Save, Calendar, Tag, ChevronDown, Edit2 } from 'lucide-react';

const AdminPricing = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [roomData, setRoomData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Pricing rules editor state
    const [editRules, setEditRules] = useState([]);

    // Override editor state
    const [overrideMonth, setOverrideMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [overrides, setOverrides] = useState({});
    const [editDay, setEditDay] = useState('');
    const [editDayPrice, setEditDayPrice] = useState('');

    // Check admin claim
    useEffect(() => {
        const checkAdmin = async () => {
            if (!user) {
                navigate('/');
                return;
            }
            const token = await user.getIdTokenResult();
            if (!token.claims.admin) {
                navigate('/');
                return;
            }
        };
        checkAdmin();
    }, [user, navigate]);

    // Load rooms and camping spots
    useEffect(() => {
        const load = async () => {
            const [r, c] = await Promise.all([getRooms(), getCampingSpots()]);
            setRooms([...r, ...c]);
            setLoading(false);
        };
        load();
    }, []);

    // Load room data + overrides when selection changes
    useEffect(() => {
        if (!selectedRoom) {
            setRoomData(null);
            setEditRules([]);
            setOverrides({});
            return;
        }

        const loadRoom = async () => {
            const snap = await getDoc(doc(db, 'rooms', selectedRoom));
            if (snap.exists()) {
                const data = snap.data();
                setRoomData(data);
                setEditRules(data.pricingRules || []);
            }
        };

        loadRoom();
    }, [selectedRoom]);

    // Load overrides when month changes
    useEffect(() => {
        if (!selectedRoom || !overrideMonth) return;

        const loadOverrides = async () => {
            const snap = await getDoc(doc(db, 'rooms', selectedRoom, 'pricing', overrideMonth));
            setOverrides(snap.exists() ? snap.data() : {});
        };

        loadOverrides();
    }, [selectedRoom, overrideMonth]);

    // ── Pricing Rules CRUD ──────────────────────────────────────────────

    const addRule = () => {
        setEditRules(prev => [...prev, { from: '', to: '', price: 0, label: '' }]);
    };

    const updateRule = (index, field, value) => {
        setEditRules(prev => prev.map((r, i) =>
            i === index ? { ...r, [field]: field === 'price' ? Number(value) : value } : r
        ));
    };

    const removeRule = (index) => {
        setEditRules(prev => prev.filter((_, i) => i !== index));
    };

    const saveRules = async () => {
        if (!selectedRoom) return;
        setSaving(true);
        try {
            // Clean rules: remove empty labels
            const cleaned = editRules.map(r => {
                const rule = { from: r.from, to: r.to, price: r.price };
                if (r.label) rule.label = r.label;
                return rule;
            });
            await updateDoc(doc(db, 'rooms', selectedRoom), { pricingRules: cleaned });
            alert('Regulile de preț au fost salvate!');
        } catch (err) {
            console.error(err);
            alert('Eroare la salvare: ' + err.message);
        }
        setSaving(false);
    };

    // ── Day Overrides CRUD ──────────────────────────────────────────────

    const addOverride = async () => {
        if (!editDay || !editDayPrice || !selectedRoom) return;
        const dayKey = String(parseInt(editDay, 10)).padStart(2, '0');
        const price = Number(editDayPrice);
        if (isNaN(price) || price <= 0) return;

        setSaving(true);
        try {
            const ref = doc(db, 'rooms', selectedRoom, 'pricing', overrideMonth);
            await setDoc(ref, { [dayKey]: price }, { merge: true });
            setOverrides(prev => ({ ...prev, [dayKey]: price }));
            setEditDay('');
            setEditDayPrice('');
        } catch (err) {
            alert('Eroare: ' + err.message);
        }
        setSaving(false);
    };

    const removeOverride = async (dayKey) => {
        if (!selectedRoom) return;
        setSaving(true);
        try {
            const ref = doc(db, 'rooms', selectedRoom, 'pricing', overrideMonth);
            await updateDoc(ref, { [dayKey]: deleteField() });
            setOverrides(prev => {
                const next = { ...prev };
                delete next[dayKey];
                return next;
            });
        } catch (err) {
            alert('Eroare: ' + err.message);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-dark pb-safe">
            {/* Header */}
            <div className="admin-header">
                <button onClick={() => navigate(-1)} className="glass-button w-10 h-10 rounded-full flex items-center justify-center">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Admin Pricing</h1>
                <div className="w-10"></div>
            </div>

            <div className="px-5 py-6 flex flex-col gap-6">
                {/* Room Selector */}
                <div className="modern-card p-6">
                    <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                        <Edit2 size={18} className="text-primary" />
                        Selectează Unitate
                    </h2>
                    <div className="relative">
                        <select
                            value={selectedRoom || ''}
                            onChange={(e) => setSelectedRoom(e.target.value || null)}
                            className="modern-select"
                        >
                            <option value="">Alege o cameră / loc de camping...</option>
                            {rooms.map(r => (
                                <option key={r.id} value={r.id}>{r.title} ({r.type})</option>
                            ))}
                        </select>
                        <div className="select-arrow"><ChevronDown size={20} /></div>
                    </div>
                </div>

                {selectedRoom && (
                    <>
                        {/* Base Price Display */}
                        {roomData && (
                            <div className="modern-card p-6">
                                <h2 className="font-bold text-lg text-gray-900 mb-2">Preț de Bază</h2>
                                <p className="text-2xl font-bold text-primary">
                                    {roomData.basePrice ?? parseInt(String(roomData.price).replace(/[^0-9]/g, ''), 10)} RON
                                    <span className="text-sm text-gray-500 font-normal"> / noapte</span>
                                </p>
                            </div>
                        )}

                        {/* Pricing Rules */}
                        <div className="modern-card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    <Calendar size={18} className="text-primary" />
                                    Reguli Sezoniere
                                </h2>
                                <button onClick={addRule} className="admin-add-btn">
                                    <Plus size={16} /> Adaugă
                                </button>
                            </div>

                            {editRules.length === 0 && (
                                <p className="text-gray-500 text-sm italic">Nu există reguli sezoniere.</p>
                            )}

                            <div className="flex flex-col gap-4">
                                {editRules.map((rule, i) => (
                                    <div key={i} className="admin-rule-card">
                                        <div className="admin-rule-row">
                                            <input
                                                type="date"
                                                value={rule.from}
                                                onChange={(e) => updateRule(i, 'from', e.target.value)}
                                                className="admin-date-input"
                                                placeholder="De la"
                                            />
                                            <span className="text-gray-400">→</span>
                                            <input
                                                type="date"
                                                value={rule.to}
                                                onChange={(e) => updateRule(i, 'to', e.target.value)}
                                                className="admin-date-input"
                                                placeholder="Până la"
                                            />
                                        </div>
                                        <div className="admin-rule-row">
                                            <input
                                                type="number"
                                                value={rule.price}
                                                onChange={(e) => updateRule(i, 'price', e.target.value)}
                                                className="admin-price-input"
                                                placeholder="Preț (RON)"
                                            />
                                            <input
                                                type="text"
                                                value={rule.label || ''}
                                                onChange={(e) => updateRule(i, 'label', e.target.value)}
                                                className="admin-label-input"
                                                placeholder="Etichetă (opțional)"
                                            />
                                            <button onClick={() => removeRule(i)} className="admin-delete-btn">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {editRules.length > 0 && (
                                <button onClick={saveRules} disabled={saving} className="admin-save-btn mt-4">
                                    <Save size={16} />
                                    {saving ? 'Se salvează...' : 'Salvează Regulile'}
                                </button>
                            )}
                        </div>

                        {/* Day Overrides */}
                        <div className="modern-card p-6">
                            <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                                <Tag size={18} className="text-primary" />
                                Prețuri Per Zi
                            </h2>

                            {/* Month selector */}
                            <input
                                type="month"
                                value={overrideMonth}
                                onChange={(e) => setOverrideMonth(e.target.value)}
                                className="admin-month-input mb-4"
                            />

                            {/* Current overrides list */}
                            {Object.keys(overrides).length > 0 ? (
                                <div className="flex flex-col gap-2 mb-4">
                                    {Object.entries(overrides)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([day, price]) => (
                                            <div key={day} className="admin-override-row">
                                                <span className="font-medium">{overrideMonth}-{day}</span>
                                                <span className="text-primary font-bold">{price} RON</span>
                                                <button onClick={() => removeOverride(day)} className="admin-delete-btn">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))
                                    }
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm italic mb-4">Nu există prețuri speciale pentru {overrideMonth}.</p>
                            )}

                            {/* Add new override */}
                            <div className="admin-add-override-row">
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editDay}
                                    onChange={(e) => setEditDay(e.target.value)}
                                    className="admin-day-input"
                                    placeholder="Zi"
                                />
                                <input
                                    type="number"
                                    value={editDayPrice}
                                    onChange={(e) => setEditDayPrice(e.target.value)}
                                    className="admin-price-input"
                                    placeholder="Preț (RON)"
                                />
                                <button onClick={addOverride} disabled={saving} className="admin-add-btn">
                                    <Plus size={16} /> Adaugă
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminPricing;
