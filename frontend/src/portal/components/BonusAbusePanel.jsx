import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Award, Zap } from 'lucide-react';

const PATTERN_COLORS = { 'Clear & Withdraw': '#ff4444', 'Low-contrib farming': '#ff8800', 'Multi-account': '#9b59b6' };

const Toast = ({ toasts }) => (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
            <div key={t.id} style={{ padding: '12px 16px', borderRadius: '8px', minWidth: '240px', background: t.type === 'error' ? '#ff444422' : '#00ff8822', border: `1px solid ${t.type === 'error' ? '#ff4444' : '#00ff88'}`, color: t.type === 'error' ? '#ff4444' : '#00ff88', fontSize: '13px' }}>{t.message}</div>
        ))}
    </div>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ color: '#aaa', fontSize: '12px', margin: '0 0 6px' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color, margin: '2px 0', fontSize: '13px' }}>
                    {p.name}: €{p.value?.toFixed(0)}
                </p>
            ))}
        </div>
    );
};

export const BonusAbusePanel = ({ token, user }) => {
    const [data, setData] = useState({ burn_rate: [], patterns: [], top_campaigns: [] });
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState([]);
    const [simulating, setSimulating] = useState(false);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/operator/fraud/bonus-abuse', { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await res.json();
            setData(d);
        } catch (_) {} finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSimulate = async () => {
        setSimulating(true);
        try {
            const res = await fetch('/api/operator/fraud/simulate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: 'test03' }),
            });
            if (!res.ok) throw new Error('Simulation failed');
            const d = await res.json();
            addToast(`Simulated ${d.inserted} bonus abuse signal(s) for test03`);
            await fetchData();
        } catch (e) {
            addToast(e.message, 'error');
        } finally {
            setSimulating(false);
        }
    };

    const handleAction = async (playerId, action) => {
        try {
            const res = await fetch(`/api/operator/fraud/signals`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: playerId, category: 'bonus_abuse', severity: 'medium', payload: { action, description: action } })
            });
            if (!res.ok) throw new Error('Action failed');
            addToast(`${action} applied to player ${playerId}`);
        } catch (e) { addToast(e.message, 'error'); }
    };

    const CAMPAIGN_COLORS = ['#00ccff', '#ffd700', '#00ff88', '#ff8800', '#9b59b6', '#ff4444'];
    const campaignKeys = data.burn_rate?.[0]
        ? Object.keys(data.burn_rate[0]).filter(k => k !== 'date')
        : ['campaign_a', 'campaign_b', 'campaign_c'];

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0 }}>Bonus Abuse & Burn-Rate</h2>
                <button
                    onClick={handleSimulate}
                    disabled={simulating}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: 'rgba(255,136,0,0.12)', border: '1px solid rgba(255,136,0,0.3)', borderRadius: '7px', color: '#ff8800', cursor: simulating ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', opacity: simulating ? 0.6 : 1 }}
                >
                    <Zap size={14} />
                    {simulating ? 'Simulating…' : 'Simulate Abuse (test03)'}
                </button>
            </div>

            {/* Burn rate chart */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '10px', marginBottom: '24px' }}>
                <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Burn Rate by Campaign (30 days)</h3>
                {loading ? (
                    <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading...</div>
                ) : (
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={data.burn_rate || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                            <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `€${v}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ color: '#aaa', fontSize: '12px' }} />
                            {campaignKeys.map((key, i) => (
                                <Area key={key} type="monotone" dataKey={key} stackId="1"
                                    stroke={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                                    fill={`${CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}33`}
                                    strokeWidth={2} />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Abuse patterns */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Flagged Players</h3>
            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading...</div>
            ) : (data.patterns || []).length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '30px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '24px' }}>No abuse patterns detected</div>
            ) : (
                <div style={{ marginBottom: '24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                {['Player', 'Pattern', 'Amount at Risk', 'Suggested Action'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(data.patterns || []).map((p, i) => {
                                const pcolor = PATTERN_COLORS[p.pattern] || '#888';
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '10px 12px', color: '#00ccff', fontSize: '13px' }}>{p.player_id}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ background: `${pcolor}22`, border: `1px solid ${pcolor}44`, borderRadius: '4px', padding: '2px 8px', color: pcolor, fontSize: '11px', fontWeight: '700' }}>{p.pattern}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: '#ff8800', fontWeight: '600', fontSize: '13px' }}>€{p.amount?.toFixed(0) || 0}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {['Extra wagering', 'Downgrade eligibility', 'Flag for AML'].map(action => (
                                                    <button key={action} onClick={() => handleAction(p.player_id, action)}
                                                        style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#aaa', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                                                    >
                                                        {action}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Top burning campaigns */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                Top Burning Campaigns (30 days)
            </h3>
            {(data.top_campaigns || []).length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>No data</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(data.top_campaigns || []).slice(0, 20).map((c, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '7px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#555', fontSize: '12px', minWidth: '20px' }}>{i + 1}.</span>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '14px' }}>{c.campaign_name || c.campaign_id}</div>
                                    <div style={{ color: '#666', fontSize: '12px' }}>{c.player_count} players</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#ff4444', fontWeight: '700', fontSize: '15px' }}>€{c.total_cost?.toFixed(0) || 0}</div>
                                <div style={{ color: '#888', fontSize: '12px' }}>GGR ratio: {((c.ggr_ratio || 0) * 100).toFixed(1)}%</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BonusAbusePanel;
