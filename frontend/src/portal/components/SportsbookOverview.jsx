import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Calendar, TrendingUp, Zap, RefreshCw } from 'lucide-react';

const KPI = ({ label, value, color, icon: Icon }) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px 20px', flex: 1, minWidth: '140px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            {Icon && <Icon size={16} color={color || '#555'} />}
        </div>
        <div style={{ color: color || '#fff', fontSize: '26px', fontWeight: '700' }}>{value ?? '—'}</div>
    </div>
);

const StatusBadge = ({ status }) => {
    const colors = { live: '#00ff88', upcoming: '#00ccff', completed: '#666', suspended: '#ff8800' };
    const color = colors[status] || '#888';
    return (
        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: `${color}22`, border: `1px solid ${color}44`, color, textTransform: 'uppercase' }}>
            {status}
        </span>
    );
};

export const SportsbookOverview = ({ token, user }) => {
    const [sports, setSports] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const [sRes, eRes] = await Promise.all([
                fetch('/api/v1/sports', { headers }),
                fetch('/api/v1/events?limit=50', { headers }),
            ]);
            const sData = await sRes.json();
            const eData = await eRes.json();
            setSports(sData.sports || []);
            setEvents(eData.events || []);
        } catch (_) {} finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const liveEvents   = events.filter(e => e.status === 'live');
    const totalBets    = events.reduce((sum, e) => sum + (e.bet_count || 0), 0);
    const totalWager   = events.reduce((sum, e) => sum + (e.total_wager || 0), 0);

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Trophy size={20} color="#ffd700" />
                    Sportsbook Overview
                </h2>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#aaa', cursor: 'pointer', fontSize: '13px' }}
                >
                    <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <KPI label="Sports Available" value={sports.length} color="#00ccff" icon={Trophy} />
                <KPI label="Live Events"      value={liveEvents.length} color="#00ff88" icon={Zap} />
                <KPI label="Total Events"     value={events.length} color="#ffd700" icon={Calendar} />
                <KPI label="Total Wager (EUR)" value={`€${totalWager.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="#ff8800" icon={TrendingUp} />
                <KPI label="Bets Placed"      value={totalBets.toLocaleString()} />
            </div>

            {/* Sports List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginBottom: '28px' }}>
                {loading ? (
                    <div style={{ color: '#888', padding: '40px', gridColumn: '1/-1', textAlign: 'center' }}>Loading sports…</div>
                ) : sports.map(sport => (
                    <div key={sport.slug} className="glass-panel" style={{ padding: '14px 18px', borderRadius: '9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>{sport.name}</div>
                            <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>{sport.event_count ?? 0} events</div>
                        </div>
                        <div style={{ fontSize: '22px' }}>{sport.emoji || '🏆'}</div>
                    </div>
                ))}
            </div>

            {/* Recent Events */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                Recent Events
            </h3>
            <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading…</div>
                ) : events.length === 0 ? (
                    <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No events found</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                {['Event', 'League', 'Sport', 'Status', 'Starts', 'Bets'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: '#888', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {events.slice(0, 30).map(ev => (
                                <tr key={ev.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '10px 14px', color: '#fff', fontSize: '13px' }}>
                                        {ev.home_team} <span style={{ color: '#555' }}>vs</span> {ev.away_team}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#888', fontSize: '12px' }}>{ev.league_name || ev.league || '—'}</td>
                                    <td style={{ padding: '10px 14px', color: '#888', fontSize: '12px' }}>{ev.sport || '—'}</td>
                                    <td style={{ padding: '10px 14px' }}><StatusBadge status={ev.status} /></td>
                                    <td style={{ padding: '10px 14px', color: '#666', fontSize: '12px' }}>
                                        {ev.start_ts ? new Date(ev.start_ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: '#aaa', fontSize: '13px' }}>{ev.bet_count ?? 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default SportsbookOverview;
