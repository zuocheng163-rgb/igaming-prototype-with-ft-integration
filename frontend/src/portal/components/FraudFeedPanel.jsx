import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ShieldAlert, Users, Award, FileQuestion, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';

const CATEGORY_META = {
    velocity:      { icon: TrendingUp,    color: '#ff8800', label: 'Velocity' },
    ato:           { icon: ShieldAlert,   color: '#ff4444', label: 'Account Takeover' },
    collusion:     { icon: Users,         color: '#9b59b6', label: 'Collusion' },
    bonus_abuse:   { icon: Award,         color: '#ffd700', label: 'Bonus Abuse' },
    kyc_anomaly:   { icon: FileQuestion,  color: '#00ccff', label: 'KYC Anomaly' },
    payment_fraud: { icon: CreditCard,    color: '#ff4444', label: 'Payment Fraud' },
};

const SEVERITY_COLORS = { low: '#00ff88', medium: '#ff8800', high: '#ff4444', critical: '#ff0000' };

const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
};

const Toast = ({ toasts }) => (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
            <div key={t.id} style={{ padding: '12px 16px', borderRadius: '8px', minWidth: '240px', background: t.type === 'error' ? '#ff444422' : '#00ff8822', border: `1px solid ${t.type === 'error' ? '#ff4444' : '#00ff88'}`, color: t.type === 'error' ? '#ff4444' : '#00ff88', fontSize: '13px' }}>{t.message}</div>
        ))}
    </div>
);

export const FraudFeedPanel = ({ token, user }) => {
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ category: '', severity: '', status: 'open' });
    const [expanded, setExpanded] = useState(null);
    const [suppressForm, setSuppressForm] = useState(null);
    const [suppressData, setSuppressData] = useState({ pattern: '', ttl_days: 30 });
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.category) params.set('category', filters.category);
            if (filters.severity) params.set('severity', filters.severity);
            if (filters.status) params.set('status', filters.status);
            const res = await fetch(`/api/operator/fraud/signals?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setSignals(data.signals || []);
        } catch (_) {} finally { setLoading(false); }
    }, [token, filters]);

    useEffect(() => { fetchSignals(); }, [fetchSignals]);

    // Poll for new signals every 5s
    useEffect(() => {
        const interval = setInterval(fetchSignals, 5000);
        return () => clearInterval(interval);
    }, [fetchSignals]);

    const updateSignal = async (id, update) => {
        try {
            const res = await fetch(`/api/operator/fraud/signals/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(update)
            });
            if (!res.ok) throw new Error('Update failed');
            addToast('Signal updated');
            await fetchSignals();
        } catch (e) { addToast(e.message, 'error'); }
    };

    const handleSuppress = async (id) => {
        await updateSignal(id, { status: 'suppressed', suppression_rule: suppressData });
        setSuppressForm(null);
        setSuppressData({ pattern: '', ttl_days: 30 });
    };

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '6px' }}>Fraud Signals Feed</h2>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>Real-time aggregated signals from risk engine and AFA alerts.</p>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                    style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '8px 12px', color: '#fff', fontSize: '13px' }}>
                    <option value="">All Categories</option>
                    {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
                    style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '8px 12px', color: '#fff', fontSize: '13px' }}>
                    <option value="">All Severities</option>
                    {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s} style={{ color: SEVERITY_COLORS[s] }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                    style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '8px 12px', color: '#fff', fontSize: '13px' }}>
                    <option value="">All Statuses</option>
                    {['open', 'acknowledged', 'escalated', 'suppressed', 'resolved'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {loading && signals.length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading signals...</div>
            ) : signals.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No signals found</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {signals.map(signal => {
                        const meta = CATEGORY_META[signal.category] || { icon: ShieldAlert, color: '#888', label: signal.category };
                        const Icon = meta.icon;
                        const isExpanded = expanded === signal.id;
                        return (
                            <div key={signal.id} style={{
                                background: 'rgba(255,255,255,0.03)', border: `1px solid ${signal.status === 'open' ? `${meta.color}33` : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: '10px', overflow: 'hidden',
                                opacity: signal.status === 'suppressed' || signal.status === 'resolved' ? 0.6 : 1
                            }}>
                                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={17} color={meta.color} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ color: meta.color, fontSize: '12px', fontWeight: '700' }}>{meta.label}</span>
                                                <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 7px', borderRadius: '4px', color: SEVERITY_COLORS[signal.severity], background: `${SEVERITY_COLORS[signal.severity]}22`, textTransform: 'uppercase' }}>
                                                    {signal.severity}
                                                </span>
                                                <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', color: '#888', background: 'rgba(255,255,255,0.05)', textTransform: 'uppercase' }}>
                                                    {signal.status}
                                                </span>
                                            </div>
                                            <span style={{ color: '#555', fontSize: '12px', flexShrink: 0 }}>{timeAgo(signal.created_at)}</span>
                                        </div>
                                        {signal.player_id && (
                                            <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '4px' }}>
                                                Player: <span style={{ color: '#00ccff' }}>{signal.player_id}</span>
                                            </div>
                                        )}
                                        <div style={{ color: '#888', fontSize: '13px', wordBreak: 'break-word' }}>
                                            {signal.payload?.description || JSON.stringify(signal.payload || {}).slice(0, 120)}
                                        </div>
                                    </div>
                                    <button onClick={() => setExpanded(isExpanded ? null : signal.id)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', flexShrink: 0 }}>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                </div>

                                {/* Expanded actions */}
                                {isExpanded && (
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px 14px', background: 'rgba(0,0,0,0.2)' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#888', marginBottom: '12px', background: '#0a0a0f', padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
                                            {JSON.stringify(signal.payload, null, 2)}
                                        </div>
                                        {signal.status === 'open' && (
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <button onClick={() => updateSignal(signal.id, { status: 'acknowledged' })}
                                                    style={{ padding: '6px 14px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '6px', color: '#00ff88', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                    Acknowledge
                                                </button>
                                                <button onClick={() => updateSignal(signal.id, { status: 'escalated' })}
                                                    style={{ padding: '6px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '6px', color: '#ff4444', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                    Escalate
                                                </button>
                                                <button onClick={() => setSuppressForm(signal.id)}
                                                    style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '12px' }}>
                                                    Suppress
                                                </button>
                                            </div>
                                        )}
                                        {suppressForm === signal.id && (
                                            <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', padding: '12px' }}>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <input value={suppressData.pattern} onChange={e => setSuppressData(d => ({ ...d, pattern: e.target.value }))}
                                                        placeholder="Pattern description (e.g. 'known IP rotation bot')"
                                                        style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '7px', color: '#fff', fontSize: '12px' }} />
                                                    <input type="number" value={suppressData.ttl_days} onChange={e => setSuppressData(d => ({ ...d, ttl_days: parseInt(e.target.value) }))}
                                                        style={{ width: '70px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '7px', color: '#fff', fontSize: '12px' }}
                                                        title="TTL in days" />
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button onClick={() => handleSuppress(signal.id)} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Confirm Suppress</button>
                                                    <button onClick={() => setSuppressForm(null)} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '5px', color: '#666', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default FraudFeedPanel;
