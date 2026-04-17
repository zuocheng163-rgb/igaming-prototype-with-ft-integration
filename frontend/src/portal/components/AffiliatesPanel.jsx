import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Users, DollarSign, TrendingUp, Link, Copy, Check, ChevronDown, ChevronUp, X, CheckCircle, XCircle, CreditCard } from 'lucide-react';

const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', color: 'white', fontSize: '0.9rem',
    boxSizing: 'border-box',
};

const STATUS_COLORS = {
    active: { bg: 'rgba(0,200,81,0.15)', border: 'rgba(0,200,81,0.4)', text: '#00c851' },
    paused: { bg: 'rgba(255,165,0,0.15)', border: 'rgba(255,165,0,0.4)', text: '#ffa500' },
    suspended: { bg: 'rgba(255,77,77,0.15)', border: 'rgba(255,77,77,0.4)', text: '#ff4d4d' },
    pending: { bg: 'rgba(0,204,255,0.15)', border: 'rgba(0,204,255,0.4)', text: '#00ccff' },
    approved: { bg: 'rgba(0,200,81,0.15)', border: 'rgba(0,200,81,0.4)', text: '#00c851' },
    rejected: { bg: 'rgba(255,77,77,0.15)', border: 'rgba(255,77,77,0.4)', text: '#ff4d4d' },
    paid: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)', text: '#a855f7' },
};

const StatusBadge = ({ status }) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
    return (
        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
            background: c.bg, border: `1px solid ${c.border}`, color: c.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {status}
        </span>
    );
};

const MOCK_AFFILIATES = [
    { id: 'aff_001', name: 'BetMaster Pro', email: 'contact@betmaster.io', tier: 'Gold', status: 'active', clicks: 12450, conversions: 187, ftds: 142, balance: 4820.50, model: 'REVSHARE', revenue: 28400 },
    { id: 'aff_002', name: 'Casino Kings', email: 'info@casinokings.com', tier: 'Silver', status: 'active', clicks: 7830, conversions: 98, ftds: 76, balance: 2310.00, model: 'CPA', revenue: 15600 },
    { id: 'aff_003', name: 'Lucky Clicks', email: 'lucky@luckyclicks.net', tier: 'Bronze', status: 'paused', clicks: 3210, conversions: 34, ftds: 21, balance: 870.25, model: 'CPA', revenue: 5200 },
    { id: 'aff_004', name: 'VIP Partners', email: 'vip@vippartners.eu', tier: 'Platinum', status: 'active', clicks: 31200, conversions: 512, ftds: 389, balance: 18750.00, model: 'REVSHARE', revenue: 92300 },
    { id: 'aff_005', name: 'Spin Network', email: 'admin@spinnetwork.co', tier: 'Silver', status: 'suspended', clicks: 890, conversions: 12, ftds: 8, balance: 120.00, model: 'CPL', revenue: 960 },
];

const MOCK_PAYOUTS = [
    { id: 'pay_001', affiliate: 'BetMaster Pro', period: 'Mar 2026', amount: 4820.50, status: 'pending', currency: 'EUR' },
    { id: 'pay_002', affiliate: 'Casino Kings', period: 'Mar 2026', amount: 2310.00, status: 'approved', currency: 'EUR' },
    { id: 'pay_003', affiliate: 'VIP Partners', period: 'Mar 2026', amount: 18750.00, status: 'pending', currency: 'EUR' },
    { id: 'pay_004', affiliate: 'VIP Partners', period: 'Feb 2026', amount: 16200.00, status: 'paid', currency: 'EUR' },
    { id: 'pay_005', affiliate: 'BetMaster Pro', period: 'Feb 2026', amount: 4100.00, status: 'paid', currency: 'EUR' },
];

const MOCK_TIERS = [
    { id: 'tier_bronze', name: 'Bronze', model: 'CPA', cpa_rate: 40, min_ftds: 0, max_ftds: 50 },
    { id: 'tier_silver', name: 'Silver', model: 'CPA', cpa_rate: 60, min_ftds: 51, max_ftds: 150 },
    { id: 'tier_gold', name: 'Gold', model: 'REVSHARE', revshare_pct: 25, min_ftds: 151, max_ftds: 400 },
    { id: 'tier_platinum', name: 'Platinum', model: 'REVSHARE', revshare_pct: 35, min_ftds: 401, max_ftds: null },
];

const MOCK_LINKS = (affId) => [
    { id: `lnk_${affId}_1`, label: 'Homepage Banner', utm_source: affId, utm_medium: 'banner', utm_campaign: 'homepage', url: `https://casino.example.com?ref=${affId}&utm_medium=banner` },
    { id: `lnk_${affId}_2`, label: 'Slots Landing', utm_source: affId, utm_medium: 'email', utm_campaign: 'slots_promo', url: `https://casino.example.com/slots?ref=${affId}&utm_medium=email` },
];

const MOCK_CONVERSIONS = (affId) => [
    { id: `cnv_${affId}_1`, player: 'PLY_8821', type: 'FTD', amount: 200, commission: 60, status: 'approved', ts: '2026-03-28T14:22:00Z' },
    { id: `cnv_${affId}_2`, player: 'PLY_8822', type: 'SIGNUP', amount: 0, commission: 5, status: 'pending', ts: '2026-03-29T09:10:00Z' },
    { id: `cnv_${affId}_3`, player: 'PLY_8830', type: 'FTD', amount: 500, commission: 150, status: 'approved', ts: '2026-04-01T11:05:00Z' },
];

const AffiliatesPanel = ({ token, user }) => {
    const [activeTab, setActiveTab] = useState('affiliates');
    const [affiliates, setAffiliates] = useState(MOCK_AFFILIATES);
    const [payouts, setPayouts] = useState(MOCK_PAYOUTS);
    const [tiers, setTiers] = useState(MOCK_TIERS);
    const [loading, setLoading] = useState(false);
    const [selectedAffiliate, setSelectedAffiliate] = useState(null);
    const [affDrawerTab, setAffDrawerTab] = useState('stats');
    const [showNewAffForm, setShowNewAffForm] = useState(false);
    const [showNewTierForm, setShowNewTierForm] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [toast, setToast] = useState(null);

    const [newAff, setNewAff] = useState({ name: '', email: '', tier: 'Bronze', model: 'CPA', cpa_rate: 40, revshare_pct: 25 });
    const [newTier, setNewTier] = useState({ name: '', model: 'CPA', cpa_rate: 40, revshare_pct: 25 });

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchAffiliates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/operator/affiliates', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setAffiliates(data.affiliates || MOCK_AFFILIATES); }
        } catch { /* use mock */ } finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchAffiliates(); }, [fetchAffiliates]);

    const copyToClipboard = async (text, id) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handlePayoutAction = (payoutId, action) => {
        setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'paid' } : p));
        showToast(`Payout ${action}d successfully`);
    };

    const handleCreateAffiliate = async () => {
        const aff = { id: `aff_${Date.now()}`, ...newAff, clicks: 0, conversions: 0, ftds: 0, balance: 0, revenue: 0, status: 'active' };
        setAffiliates(prev => [...prev, aff]);
        setShowNewAffForm(false);
        setNewAff({ name: '', email: '', tier: 'Bronze', model: 'CPA', cpa_rate: 40, revshare_pct: 25 });
        showToast('Affiliate created successfully');
    };

    const handleCreateTier = () => {
        const tier = { id: `tier_${Date.now()}`, ...newTier };
        setTiers(prev => [...prev, tier]);
        setShowNewTierForm(false);
        setNewTier({ name: '', model: 'CPA', cpa_rate: 40, revshare_pct: 25 });
        showToast('Tier created successfully');
    };

    const TAB_STYLE = (active) => ({
        padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
        background: active ? 'rgba(255,215,0,0.15)' : 'transparent',
        color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
        transition: 'all 0.2s',
    });

    const links = selectedAffiliate ? MOCK_LINKS(selectedAffiliate.id) : [];
    const conversions = selectedAffiliate ? MOCK_CONVERSIONS(selectedAffiliate.id) : [];

    return (
        <div style={{ marginTop: 0 }}>
            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                    padding: '12px 20px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                    background: toast.type === 'success' ? 'rgba(0,200,81,0.9)' : 'rgba(255,77,77,0.9)',
                    color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Users size={20} style={{ color: 'var(--accent-gold)' }} />
                    <h3 style={{ margin: 0, color: 'white' }}>Affiliates & Referral (F15-01)</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={fetchAffiliates} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    {activeTab === 'affiliates' && (
                        <button onClick={() => setShowNewAffForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                            <Plus size={14} /> New Affiliate
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.06)' }}>
                {['affiliates', 'payouts', 'tiers'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={TAB_STYLE(activeTab === t)}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {/* ── Tab: Affiliates ── */}
            {activeTab === 'affiliates' && (
                <div className="glass-panel" style={{ padding: '20px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Loading affiliates...</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        {['Name', 'Tier', 'Status', 'Clicks', 'Conversions', 'Balance', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {affiliates.map(aff => (
                                        <tr key={aff.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ fontWeight: 600, color: 'white' }}>{aff.name}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{aff.email}</div>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600,
                                                    background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: 'var(--accent-gold)' }}>
                                                    {aff.tier}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px' }}><StatusBadge status={aff.status} /></td>
                                            <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{aff.clicks.toLocaleString()}</td>
                                            <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{aff.conversions}</td>
                                            <td style={{ padding: '12px', color: '#00c851', fontWeight: 600 }}>€{aff.balance.toFixed(2)}</td>
                                            <td style={{ padding: '12px' }}>
                                                <button onClick={() => { setSelectedAffiliate(aff); setAffDrawerTab('stats'); }}
                                                    style={{ padding: '5px 12px', borderRadius: '6px', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)',
                                                        color: '#00ccff', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Payouts ── */}
            {activeTab === 'payouts' && (
                <div className="glass-panel" style={{ padding: '20px' }}>
                    <h4 style={{ margin: '0 0 16px', color: 'white' }}>Payout Batches</h4>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    {['Affiliate', 'Period', 'Amount', 'Status', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {payouts.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '12px', color: 'white', fontWeight: 600 }}>{p.affiliate}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{p.period}</td>
                                        <td style={{ padding: '12px', color: '#00c851', fontWeight: 600 }}>€{p.amount.toFixed(2)}</td>
                                        <td style={{ padding: '12px' }}><StatusBadge status={p.status} /></td>
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {p.status === 'pending' && <>
                                                    <button onClick={() => handlePayoutAction(p.id, 'approve')}
                                                        style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(0,200,81,0.1)', border: '1px solid rgba(0,200,81,0.3)', color: '#00c851', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle size={11} /> Approve
                                                    </button>
                                                    <button onClick={() => handlePayoutAction(p.id, 'reject')}
                                                        style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)', color: '#ff4d4d', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <XCircle size={11} /> Reject
                                                    </button>
                                                </>}
                                                {p.status === 'approved' && (
                                                    <button onClick={() => handlePayoutAction(p.id, 'mark-paid')}
                                                        style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CreditCard size={11} /> Mark Paid
                                                    </button>
                                                )}
                                                {(p.status === 'paid' || p.status === 'rejected') && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Tab: Tiers ── */}
            {activeTab === 'tiers' && (
                <div>
                    <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 16px', color: 'white' }}>Commission Tiers</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                            {tiers.map(t => (
                                <div key={t.id} className="glass-panel" style={{ padding: '16px', border: '1px solid rgba(255,215,0,0.15)' }}>
                                    <div style={{ fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '8px', fontSize: '1rem' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Model: <span style={{ color: 'white' }}>{t.model}</span></div>
                                    {t.model === 'CPA' && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>CPA Rate: <span style={{ color: '#00c851', fontWeight: 600 }}>€{t.cpa_rate}</span></div>}
                                    {t.model === 'REVSHARE' && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>RevShare: <span style={{ color: '#00c851', fontWeight: 600 }}>{t.revshare_pct}%</span></div>}
                                    {t.min_ftds !== undefined && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                            FTDs: {t.min_ftds} – {t.max_ftds ?? '∞'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {!showNewTierForm ? (
                        <button onClick={() => setShowNewTierForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.8rem' }}>
                            <Plus size={14} /> New Tier
                        </button>
                    ) : (
                        <div className="glass-panel" style={{ padding: '20px', maxWidth: '440px' }}>
                            <h4 style={{ margin: '0 0 16px', color: 'white' }}>Create New Tier</h4>
                            {[['name', 'Tier Name'], ['model', 'Model (CPA/REVSHARE/CPL)']].map(([k, l]) => (
                                <div key={k} style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l}</label>
                                    <input value={newTier[k]} onChange={e => setNewTier(p => ({ ...p, [k]: e.target.value }))} style={inputStyle} />
                                </div>
                            ))}
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>CPA Rate (€)</label>
                                <input type="number" value={newTier.cpa_rate} onChange={e => setNewTier(p => ({ ...p, cpa_rate: Number(e.target.value) }))} style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                <button onClick={() => setShowNewTierForm(false)} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>Cancel</button>
                                <button onClick={handleCreateTier} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>Create Tier</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── New Affiliate Modal ── */}
            {showNewAffForm && (
                <div className="modal-overlay" onClick={() => setShowNewAffForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <h3 style={{ margin: '0 0 20px', color: 'white' }}>New Affiliate</h3>
                        <div className="modal-inner-scroll">
                            {[['name', 'Name', 'text'], ['email', 'Email', 'email']].map(([k, l, t]) => (
                                <div key={k} style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{l}</label>
                                    <input type={t} value={newAff[k]} onChange={e => setNewAff(p => ({ ...p, [k]: e.target.value }))} style={inputStyle} />
                                </div>
                            ))}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Tier</label>
                                <select value={newAff.tier} onChange={e => setNewAff(p => ({ ...p, tier: e.target.value }))}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    {tiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Commission Model</label>
                                <select value={newAff.model} onChange={e => setNewAff(p => ({ ...p, model: e.target.value }))}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    {['REVSHARE', 'CPA', 'CPL'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            {newAff.model === 'CPA' && (
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>CPA Rate (€)</label>
                                    <input type="number" value={newAff.cpa_rate} onChange={e => setNewAff(p => ({ ...p, cpa_rate: Number(e.target.value) }))} style={inputStyle} />
                                </div>
                            )}
                            {newAff.model === 'REVSHARE' && (
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>RevShare %</label>
                                    <input type="number" value={newAff.revshare_pct} onChange={e => setNewAff(p => ({ ...p, revshare_pct: Number(e.target.value) }))} style={inputStyle} />
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button onClick={() => setShowNewAffForm(false)} className="btn-secondary" style={{ padding: '9px 20px' }}>Cancel</button>
                            <button onClick={handleCreateAffiliate} className="btn-primary" style={{ padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Plus size={14} /> Create Affiliate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Affiliate Detail Drawer ── */}
            {selectedAffiliate && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setSelectedAffiliate(null)}>
                    <div style={{ width: '560px', height: '100%', background: 'var(--bg-secondary)', borderLeft: '1px solid rgba(255,255,255,0.1)', overflowY: 'auto', padding: '28px' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ margin: '0 0 4px', color: 'white' }}>{selectedAffiliate.name}</h3>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedAffiliate.email}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <StatusBadge status={selectedAffiliate.status} />
                                <button onClick={() => setSelectedAffiliate(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Drawer Tabs */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {['stats', 'links', 'conversions'].map(t => (
                                <button key={t} onClick={() => setAffDrawerTab(t)}
                                    style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                        background: affDrawerTab === t ? 'rgba(255,215,0,0.15)' : 'transparent',
                                        color: affDrawerTab === t ? 'var(--accent-gold)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Stats Tab */}
                        {affDrawerTab === 'stats' && (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                    {[
                                        { label: 'Total Clicks', value: selectedAffiliate.clicks.toLocaleString(), icon: <TrendingUp size={16} color="#00ccff" /> },
                                        { label: 'Signups', value: selectedAffiliate.conversions, icon: <Users size={16} color="#a855f7" /> },
                                        { label: 'FTDs', value: selectedAffiliate.ftds, icon: <DollarSign size={16} color="#00c851" /> },
                                        { label: 'Revenue', value: `€${selectedAffiliate.revenue.toLocaleString()}`, icon: <DollarSign size={16} color="var(--accent-gold)" /> },
                                        { label: 'Commission Balance', value: `€${selectedAffiliate.balance.toFixed(2)}`, icon: <CreditCard size={16} color="#ffa500" /> },
                                        { label: 'Model', value: selectedAffiliate.model, icon: <TrendingUp size={16} color="#00ccff" /> },
                                    ].map(({ label, value, icon }) => (
                                        <div key={label} className="glass-panel" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {icon}
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
                                                <div style={{ fontWeight: 700, color: 'white' }}>{value}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Links Tab */}
                        {affDrawerTab === 'links' && (
                            <div>
                                {links.map(lnk => (
                                    <div key={lnk.id} className="glass-panel" style={{ padding: '14px', marginBottom: '10px' }}>
                                        <div style={{ fontWeight: 600, color: 'white', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Link size={14} color="var(--accent-gold)" /> {lnk.label}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                            medium: {lnk.utm_medium} · campaign: {lnk.utm_campaign}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <code style={{ flex: 1, fontSize: '0.7rem', color: '#00ccff', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {lnk.url}
                                            </code>
                                            <button onClick={() => copyToClipboard(lnk.url, lnk.id)}
                                                style={{ padding: '5px 10px', borderRadius: '6px', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)', color: '#00ccff', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                {copiedId === lnk.id ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '0.78rem', marginTop: '4px' }}>
                                    <Plus size={12} /> New Link
                                </button>
                            </div>
                        )}

                        {/* Conversions Tab */}
                        {affDrawerTab === 'conversions' && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            {['Player', 'Type', 'Amount', 'Commission', 'Status'].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conversions.map(c => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#00ccff' }}>{c.player}</td>
                                                <td style={{ padding: '8px 10px', color: 'white' }}>{c.type}</td>
                                                <td style={{ padding: '8px 10px', color: '#00c851' }}>€{c.amount}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--accent-gold)' }}>€{c.commission}</td>
                                                <td style={{ padding: '8px 10px' }}><StatusBadge status={c.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AffiliatesPanel;
