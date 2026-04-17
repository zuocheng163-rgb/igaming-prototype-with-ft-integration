import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldAlert, TrendingUp, AlertCircle, CheckCircle, RefreshCw, Zap } from 'lucide-react';

const AfaMonitor = ({ token }) => {
    const [events, setEvents] = useState([]);
    const [status, setStatus] = useState('connecting');
    const [heartbeatCount, setHeartbeatCount] = useState(0);
    const [lastHeartbeat, setLastHeartbeat] = useState(null);
    const [error, setError] = useState(null);
    const eventSourceRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        const connectStream = () => {
            // AFA SSE stream requires the agent JWT
            // In a real environment, we'd pass it in headers, but SSE standard doesn't support headers via EventSource.
            // AFA implementation in backend supports ?token= query param for SSE auth.
            const url = `${window.location.origin}/api/v1/ops/events/stream?token=${token}`;
            
            setStatus('connecting');
            const es = new EventSource(url);
            eventSourceRef.current = es;

            es.onopen = () => {
                setStatus('connected');
                setError(null);
            };

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Heartbeat / connection lifecycle -- don't add to timeline
                    if (data.type === 'heartbeat' || data.type === 'connected' || data.event_type === 'heartbeat') {
                        if (data.type === 'heartbeat') {
                            setHeartbeatCount(prev => prev + 1);
                            setLastHeartbeat(new Date().toISOString());
                        }
                        return;
                    }

                    // Bump heartbeat counter for any non-connection message (shows stream is alive)
                    setHeartbeatCount(prev => prev + 1);
                    setLastHeartbeat(new Date().toISOString());

                    // Real platform event — add to timeline
                    setEvents(prev => [{
                        id: data.event_id || Date.now(),
                        type: data.event_type || data.type || 'event',
                        payload: data.data || data,
                        localTime: new Date().toLocaleTimeString(),
                        brand_id: data.brand_id,
                    }, ...prev].slice(0, 100));
                } catch (e) {
                    console.error('[AFA Monitor] Failed to parse event', e);
                }
            };

            es.onerror = (e) => {
                console.error('[AFA Monitor] SSE Error', e);
                setStatus('disconnected');
                setError('Connection lost. Retrying...');
                es.close();
                // Auto-retry in 5s
                setTimeout(connectStream, 5000);
            };
        };

        connectStream();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, [token]);

    const getEventColor = (type) => {
        if (type?.includes('error') || type?.includes('flag')) return '#ff4d4d';
        if (type?.includes('alert')) return '#ffa500';
        if (type?.includes('balance')) return '#00ff88';
        if (type?.includes('bonus')) return '#7928ca';
        return 'var(--accent-gold)';
    };

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className={`status-orb ${status === 'connected' ? 'pulsing' : 'offline'}`} 
                         style={{ 
                             width: '12px', 
                             height: '12px', 
                             borderRadius: '50%',
                             backgroundColor: status === 'connected' ? '#00ff88' : '#ff4d4d',
                             boxShadow: status === 'connected' ? '0 0 10px #00ff88' : 'none'
                         }}></div>
                    <h2 style={{ margin: 0 }}>AFA Real-time Monitor</h2>
                </div>
                
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Activity size={16} color="var(--accent-gold)" />
                        <div style={{ fontSize: '0.85rem' }}>
                            <span style={{ opacity: 0.6 }}>Heartbeats: </span>
                            <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>{heartbeatCount}</span>
                        </div>
                    </div>
                    {lastHeartbeat && (
                        <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={16} color="#00ff88" />
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                Last Signal: {new Date(lastHeartbeat).toLocaleTimeString()}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="error-banner" style={{ marginBottom: '20px', background: 'rgba(255, 77, 77, 0.1)', color: '#ff4d4d', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 77, 77, 0.2)' }}>
                    {error}
                </div>
            )}

            <div className="events-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {events.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
                        <Activity size={48} style={{ marginBottom: '16px', margin: '0 auto' }} />
                        <p>Waiting for events from the NeoStrike platform...</p>
                        <p style={{ fontSize: '0.8rem' }}>Trigger a login, deposit, or bet to see AFA capturing it in real-time.</p>
                    </div>
                ) : (
                    events.map(event => (
                        <div key={event.id} className="event-card glass-panel" style={{ 
                            padding: '16px', 
                            display: 'grid', 
                            gridTemplateColumns: 'auto 1fr auto',
                            gap: '20px',
                            borderLeft: `4px solid ${getEventColor(event.type)}`,
                            animation: 'slideIn 0.3s ease-out'
                        }}>
                            <div style={{ color: getEventColor(event.type), display: 'flex', alignItems: 'center' }}>
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', textTransform: 'uppercase' }}>
                                        {event.type}
                                    </span>
                                    {event.payload?.type && (
                                        <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', color: 'var(--accent-gold)' }}>
                                            {event.payload.type}
                                        </span>
                                    )}
                                    {event.brand_id && (
                                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.07)', padding: '2px 6px', borderRadius: '4px', opacity: 0.5 }}>
                                            Brand {event.brand_id}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {event.payload?.message || event.payload?.player_id ? (
                                        <span>
                                            {event.payload.message}
                                            {event.payload.player_id && <span style={{ opacity: 0.6, marginLeft: '8px' }}>Player: {event.payload.player_id}</span>}
                                        </span>
                                    ) : JSON.stringify(event.payload || {}).slice(0, 120)}
                                </div>
                                {event.payload?.amount !== undefined && (
                                    <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#00ff88', fontWeight: 600 }}>
                                        {event.payload.currency || 'EUR'} {parseFloat(event.payload.amount).toFixed(2)}
                                        {event.payload.balance_after !== undefined && (
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                                                → Balance: {parseFloat(event.payload.balance_after).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', opacity: 0.6, whiteSpace: 'nowrap' }}>
                                <div>{event.localTime}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .pulsing {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.6; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .status-orb.offline {
                    opacity: 0.5;
                }
            `}} />
        </div>
    );
};

export default AfaMonitor;
