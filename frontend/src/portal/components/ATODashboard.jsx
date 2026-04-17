import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Smartphone, MapPin, Key, CreditCard } from 'lucide-react';

const KPI = ({ label, value, color }) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px 20px', flex: 1 }}>
        <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>{label}</div>
        <div style={{ color: color || '#fff', fontSize: '26px', fontWeight: '700' }}>{value ?? '—'}</div>
    </div>
);

const EVENT_ICONS = { login: Smartphone, geo_jump: MapPin, password_reset: Key, withdrawal: CreditCard, '2fa_disable': ShieldAlert };

const Toast = ({ toasts }) => (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
            <div key={t.id} style={{ padding: '12px 16px', borderRadius: '8px', minWidth: '240px', background: t.type === 'error' ? '#ff444422' : '#00ff8822', border: `1px solid ${t.type === 'error' ? '#ff4444' : '#00ff88'}`, color: t.type === 'error' ? '#ff4444' : '#00ff88', fontSize: '13px' }}>{t.message}</div>
        ))}
    </div>
);

export const ATODashboard = ({ token, user }) => {
    const [data, setData] = useState({ alerts: [], kpis: {} });
    const [loading, setLoading] = useState(true);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/operator/fraud/ato-alerts', { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await res.json();
            setData(d);
        } catch (_) {} finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleRemediation = async (alertId, action) => {
        try {
            const res = await fetch(`/api/operator/fraud/signals/${alertId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'resolved', remediation: action })
            });
            if (!res.ok) throw new Error('Action failed');
            addToast(`${action} applied`);
            setSelectedAlert(null);
            await fetchData();
        } catch (e) { addToast(e.message, 'error'); }
    };

    const kpis = data.kpis || {};
    const alerts = data.alerts || [];

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>ATO Alerts Dashboard</h2>

            {/* KPI Strip */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <KPI label="Open ATO Alerts" value={kpis.open_count ?? alerts.length} color="#ff4444" />
                <KPI label="Accounts Frozen (24h)" value={kpis.frozen_24h ?? 0} color="#ff8800" />
                <KPI label="Avg Resolution Time" value={kpis.avg_resolution_time ? `${kpis.avg_resolution_time}m` : '—'} />
                <KPI label="False Positive Rate" value={kpis.fp_rate != null ? `${(kpis.fp_rate * 100).toFixed(1)}%` : '—'} color="#00ff88" />
            </div>

            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading alerts...</div>
            ) : alerts.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No ATO alerts</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {alerts.map(alert => (
                        <div key={alert.id} style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,68,68,0.15)',
                            borderRadius: '8px', padding: '12px 16px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                            cursor: 'pointer'
                        }}
                            onClick={() => setSelectedAlert(selectedAlert?.id === alert.id ? null : alert)}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                    <ShieldAlert size={14} color="#ff4444" />
                                    <span style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>Player {alert.player_id}</span>
                                    <span style={{ color: '#888', fontSize: '12px' }}>{alert.payload?.device_info || 'Unknown device'}</span>
                                </div>
                                <div style={{ color: '#666', fontSize: '12px' }}>
                                    IP: {alert.payload?.ip || '—'} · {new Date(alert.created_at).toLocaleString()}
                                </div>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', color: '#ff4444', background: 'rgba(255,68,68,0.1)', textTransform: 'uppercase' }}>
                                {alert.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Alert drawer */}
            {selectedAlert && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
                    onClick={() => setSelectedAlert(null)}>
                    <div style={{ width: '520px', height: '100%', background: '#0d0d1a', borderLeft: '1px solid rgba(255,255,255,0.07)', overflow: 'auto', padding: '24px' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>ATO Alert · Player {selectedAlert.player_id}</h3>
                            <button onClick={() => setSelectedAlert(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        </div>

                        {/* 72-hour timeline */}
                        <h4 style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>72-Hour Timeline</h4>
                        <div style={{ position: 'relative', paddingLeft: '24px', marginBottom: '24px' }}>
                            <div style={{ position: 'absolute', left: '8px', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                            {(selectedAlert.payload?.timeline || [
                                { ts: new Date(Date.now() - 3600000).toISOString(), type: 'login', description: 'Login from new device', ip: '185.x.x.x', location: 'Kyiv, UA' },
                                { ts: new Date(Date.now() - 1800000).toISOString(), type: 'password_reset', description: 'Password reset requested' },
                                { ts: new Date(Date.now() - 900000).toISOString(), type: 'withdrawal', description: 'Withdrawal €2,500 requested' },
                            ]).map((event, i) => {
                                const Icon = EVENT_ICONS[event.type] || ShieldAlert;
                                return (
                                    <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '12px', position: 'relative' }}>
                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#1a1a2e', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'absolute', left: '-16px', top: '2px' }}>
                                            <Icon size={8} color="#aaa" />
                                        </div>
                                        <div>
                                            <div style={{ color: '#ddd', fontSize: '13px', fontWeight: '500' }}>{event.description}</div>
                                            <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>
                                                {new Date(event.ts).toLocaleString()}
                                                {event.ip && ` · ${event.ip}`}
                                                {event.location && ` · ${event.location}`}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Remediation */}
                        <h4 style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>One-Click Remediation</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[
                                ['Force Logout', '#ff4444', 'force_logout'],
                                ['Require Password Reset', '#ff8800', 'require_password_reset'],
                                ['Require Re-KYC', '#ffd700', 'require_rekyc'],
                                ['Freeze Withdrawals 24h', '#9b59b6', 'freeze_withdrawals_24h'],
                            ].map(([label, color, action]) => (
                                <button key={action}
                                    onClick={() => handleRemediation(selectedAlert.id, action)}
                                    style={{ padding: '11px', background: `${color}18`, border: `1px solid ${color}44`, borderRadius: '8px', color, cursor: 'pointer', fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ATODashboard;
