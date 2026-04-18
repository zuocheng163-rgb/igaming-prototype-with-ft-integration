import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Wifi, WifiOff, Trash2, Zap, ChevronDown, ChevronRight } from 'lucide-react';

const EVENT_COLORS = {
    SPORTSBOOK:            '#00ccff',
    CASINO:                '#ffd700',
    PAYMENT:               '#00ff88',
    LOGIN_V2:              '#9b59b6',
    LOGOUT:                '#95a5a6',
    USER_CREATE_V2:        '#3498db',
    USER_UPDATE_V2:        '#1abc9c',
    USER_BALANCES_UPDATE:  '#e67e22',
    BONUS:                 '#f39c12',
    USER_BLOCK_V2:         '#e74c3c',
    USER_CONSENTS_V2:      '#27ae60',
    fraud_signal_ato:      '#ff4444',
    fraud_signal_bonus_abuse: '#ff8800',
    rg_alert_created:      '#ff4444',
    rg_alert_escalated:    '#ff6600',
};

const DEFAULT_COLOR = '#888';

const getColor = (eventType) => {
    if (!eventType) return DEFAULT_COLOR;
    // Direct match (handles FT message type keys like SPORTSBOOK, CASINO etc.)
    if (EVENT_COLORS[eventType]) return EVENT_COLORS[eventType];
    // Case-insensitive prefix match for lower-snake_case variants
    const upper = eventType.toUpperCase();
    const key = Object.keys(EVENT_COLORS).find(k => upper.includes(k) || k.includes(upper));
    return key ? EVENT_COLORS[key] : DEFAULT_COLOR;
};

const LABELS = {
    SPORTSBOOK:            'Sportsbook',
    CASINO:                'Casino',
    PAYMENT:               'Payment',
    LOGIN_V2:              'Login',
    LOGOUT:                'Logout',
    USER_CREATE_V2:        'Registration',
    USER_UPDATE_V2:        'User Update',
    USER_BALANCES_UPDATE:  'Balance Update',
    BONUS:                 'Bonus',
    USER_BLOCK_V2:         'Block',
    USER_CONSENTS_V2:      'Consent',
    fraud_signal_ato:      'ATO Alert',
    fraud_signal_bonus_abuse: 'Bonus Abuse',
    rg_alert_created:      'RG Alert',
    rg_alert_escalated:    'RG Escalation',
};

function EventRow({ event }) {
    const [expanded, setExpanded] = useState(false);
    const color = getColor(event.event_type);
    const label = LABELS[event.event_type] || event.event_type || 'Event';
    const d = event.data || {};

    // Pull the most useful summary fields out of the payload
    const summary = [
        d.user_id && `player: ${d.user_id}`,
        d.type && `type: ${d.type}`,
        d.amount !== undefined && `amount: ${d.currency || ''} ${d.amount}`,
        d.status && `status: ${d.status}`,
        d.bet_type && `bet: ${d.bet_type}`,
    ].filter(Boolean).join('  ·  ');

    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Row header — always visible, clickable to expand */}
            <div
                onClick={() => setExpanded(e => !e)}
                style={{
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 14px', cursor: 'pointer',
                    background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                    transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
            >
                {/* Colour dot */}
                <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                    background: color, boxShadow: `0 0 6px ${color}`,
                }} />

                {/* Type badge */}
                <span style={{
                    fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                    letterSpacing: '0.4px', color, minWidth: '120px',
                }}>
                    {label}
                </span>

                {/* Summary */}
                <span style={{ flex: 1, color: '#666', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {summary}
                </span>

                {/* Brand + time */}
                {event.brand_id && (
                    <span style={{ color: '#444', fontSize: '11px', marginRight: '6px' }}>brand:{event.brand_id}</span>
                )}
                <span style={{ color: '#444', fontSize: '11px', marginRight: '6px', whiteSpace: 'nowrap' }}>
                    {event.occurred_at ? new Date(event.occurred_at).toLocaleTimeString() : ''}
                </span>

                {/* Chevron */}
                <span style={{ color: '#555', flexShrink: 0 }}>
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
            </div>

            {/* Expanded payload */}
            {expanded && (
                <div style={{
                    padding: '0 14px 12px 30px',
                    background: 'rgba(0,0,0,0.2)',
                    borderLeft: `2px solid ${color}`,
                    marginLeft: '14px',
                }}>
                    <pre style={{
                        color: '#aaa', fontSize: '11px', lineHeight: '1.6',
                        margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        maxHeight: '400px', overflowY: 'auto',
                    }}>
                        {JSON.stringify(event.data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// Colour legend derived from EVENT_COLORS
const LEGEND = Object.entries(EVENT_COLORS).map(([key, color]) => ({
    color,
    label: LABELS[key] || key,
}));

export const AfaMonitor = ({ token }) => {
    const [events, setEvents] = useState([]);
    const [status, setStatus] = useState('connecting');
    const [heartbeats, setHeartbeats] = useState(0);
    const esRef = useRef(null);
    const retryRef = useRef(null);

    const connect = useCallback(() => {
        if (esRef.current) { esRef.current.close(); esRef.current = null; }
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
        setStatus('connecting');

        const url = `/api/operator/events/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => setStatus('connected');

        es.onmessage = (e) => {
            try {
                const parsed = JSON.parse(e.data);
                if (parsed.type === 'connected') { setStatus('connected'); return; }
                setEvents(prev => [parsed, ...prev].slice(0, 300));
            } catch (_) {}
        };

        es.onerror = () => {
            es.close(); esRef.current = null;
            setStatus('disconnected');
            retryRef.current = setTimeout(connect, 5000);
        };
    }, [token]);

    useEffect(() => {
        connect();
        return () => {
            if (esRef.current) esRef.current.close();
            if (retryRef.current) clearTimeout(retryRef.current);
        };
    }, [connect]);

    useEffect(() => {
        if (status !== 'connected') return;
        const interval = setInterval(() => setHeartbeats(h => h + 1), 25000);
        return () => clearInterval(interval);
    }, [status]);

    return (
        <div style={{ padding: '24px' }}>
            <style>{`
                @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={20} color="#00ccff" />
                    AFA Real-time Monitor
                </h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: status === 'connected' ? '#00ff88' : status === 'connecting' ? '#ffd700' : '#ff4444' }}>
                        {status === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Disconnected — retrying in 5s'}
                    </div>
                    <span style={{ fontSize: '12px', color: '#555' }}>Heartbeats: {heartbeats}</span>
                    <button onClick={() => setEvents([])} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}>
                        <Trash2 size={12} /> Clear
                    </button>
                    <button onClick={connect} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.25)', borderRadius: '6px', color: '#00ccff', cursor: 'pointer', fontSize: '12px' }}>
                        <Zap size={12} /> Reconnect
                    </button>
                </div>
            </div>

            {/* Colour legend */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {LEGEND.map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#666' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
                        {label}
                    </div>
                ))}
            </div>

            {/* Event feed */}
            <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden', minHeight: '300px' }}>
                {events.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#555', padding: '60px 20px' }}>
                        <Activity size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <div style={{ fontSize: '14px' }}>
                            {status === 'connected'
                                ? 'Listening for events… Place a bet, make a deposit, or trigger a simulation.'
                                : 'Waiting for connection…'}
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555' }}>
                            <span>EVENT TYPE · SUMMARY</span>
                            <span>{events.length} events · click to expand</span>
                        </div>
                        {events.map((ev, i) => (
                            <EventRow key={i} event={ev} />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default AfaMonitor;
