import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Wifi, WifiOff, Trash2, Zap } from 'lucide-react';

const EVENT_COLORS = {
    sportsbook:        '#00ccff',
    casino:            '#ffd700',
    payment:           '#00ff88',
    login:             '#9b59b6',
    registration:      '#3498db',
    logout:            '#95a5a6',
    fraud_signal_ato:       '#ff4444',
    fraud_signal_bonus_abuse: '#ff8800',
    rg_alert_created:  '#ff4444',
    rg_alert_escalated: '#ff6600',
    default:           '#aaa',
};

const getColor = (eventType) =>
    EVENT_COLORS[eventType] || EVENT_COLORS.default;

const EventRow = ({ event }) => {
    const color = getColor(event.event_type);
    return (
        <div style={{
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
            animation: 'fadeInDown 0.3s ease',
        }}>
            <div style={{ marginTop: '3px', width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color, fontWeight: '600', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {event.event_type}
                    </span>
                    {event.brand_id && (
                        <span style={{ color: '#555', fontSize: '11px' }}>brand:{event.brand_id}</span>
                    )}
                    <span style={{ color: '#444', fontSize: '11px', marginLeft: 'auto' }}>
                        {event.occurred_at ? new Date(event.occurred_at).toLocaleTimeString() : ''}
                    </span>
                </div>
                {event.data && (
                    <pre style={{ color: '#777', fontSize: '11px', margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: '1.5' }}>
                        {JSON.stringify(event.data, null, 2).slice(0, 400)}
                    </pre>
                )}
            </div>
        </div>
    );
};

export const AfaMonitor = ({ token }) => {
    const [events, setEvents] = useState([]);
    const [status, setStatus] = useState('connecting'); // connecting | connected | disconnected
    const [heartbeats, setHeartbeats] = useState(0);
    const esRef = useRef(null);
    const retryRef = useRef(null);

    const connect = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
        if (retryRef.current) {
            clearTimeout(retryRef.current);
            retryRef.current = null;
        }

        setStatus('connecting');

        // EventSource cannot set custom headers, so we pass the JWT as a query param.
        // The backend authenticateRequest middleware reads req.query.token as a fallback.
        const url = `/api/operator/events/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => {
            setStatus('connected');
        };

        es.onmessage = (e) => {
            try {
                const parsed = JSON.parse(e.data);
                if (parsed.type === 'connected') {
                    setStatus('connected');
                    return;
                }
                // Heartbeats are SSE comments (": heartbeat") — they don't fire onmessage
                setEvents(prev => [parsed, ...prev].slice(0, 200));
            } catch (_) {}
        };

        es.onerror = () => {
            es.close();
            esRef.current = null;
            setStatus('disconnected');
            retryRef.current = setTimeout(() => connect(), 5000);
        };
    }, [token]);

    useEffect(() => {
        connect();
        return () => {
            if (esRef.current) esRef.current.close();
            if (retryRef.current) clearTimeout(retryRef.current);
        };
    }, [connect]);

    // Increment heartbeat counter every 25s while connected (mirrors backend ping interval)
    useEffect(() => {
        if (status !== 'connected') return;
        const interval = setInterval(() => setHeartbeats(h => h + 1), 25000);
        return () => clearInterval(interval);
    }, [status]);

    return (
        <div style={{ padding: '24px' }}>
            <style>{`@keyframes fadeInDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={20} color="#00ccff" />
                    AFA Real-time Monitor
                </h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: status === 'connected' ? '#00ff88' : status === 'connecting' ? '#ffd700' : '#ff4444' }}>
                        {status === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Disconnected — retrying in 5s'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                        Heartbeats: {heartbeats}
                    </div>
                    <button
                        onClick={() => setEvents([])}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}
                    >
                        <Trash2 size={12} /> Clear
                    </button>
                    <button
                        onClick={connect}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.25)', borderRadius: '6px', color: '#00ccff', cursor: 'pointer', fontSize: '12px' }}
                    >
                        <Zap size={12} /> Reconnect
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {Object.entries(EVENT_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#666' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                        {type}
                    </div>
                ))}
            </div>

            {/* Event Feed */}
            <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden', minHeight: '300px' }}>
                {events.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#555', padding: '60px 20px' }}>
                        <Activity size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <div style={{ fontSize: '14px' }}>
                            {status === 'connected' ? 'Listening for events… Place a bet, make a deposit, or trigger a simulation.' : 'Waiting for connection…'}
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555' }}>
                            <span>EVENT TYPE</span>
                            <span>{events.length} events</span>
                        </div>
                        {events.map((ev, i) => (
                            <EventRow key={i} event={ev} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AfaMonitor;
