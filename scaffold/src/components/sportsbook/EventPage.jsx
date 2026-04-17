import React, { useEffect } from 'react';
import { useEvent } from '@neostrike/sdk';

export const EventPage = ({ eventId, onAddToBetSlip, onNavigate }) => {
    const { event, odds, isLoading, subscribe, unsubscribe } = useEvent(eventId);

    useEffect(() => {
        subscribe();
        return () => unsubscribe();
    }, [subscribe, unsubscribe]);

    if (isLoading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading event...</div>;
    }
    if (!event) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Event not found</div>;
    }

    return (
        <div style={{ padding: '24px' }}>
            <button
                onClick={() => onNavigate && onNavigate('sport')}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginBottom: '20px', fontSize: '14px' }}
            >
                ← Back to Sports
            </button>

            <div style={{ marginBottom: '24px' }}>
                {event.status === 'live' && (
                    <span style={{ color: '#ff4444', fontSize: '12px', fontWeight: '700', marginBottom: '6px', display: 'block' }}>● LIVE</span>
                )}
                <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 6px' }}>
                    {event.home_team} vs {event.away_team}
                </h2>
                <div style={{ color: '#888', fontSize: '14px' }}>
                    {new Date(event.start_ts).toLocaleString()}
                </div>
            </div>

            {(event.markets || []).map(market => (
                <div
                    key={market.id}
                    style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px', padding: '16px', marginBottom: '12px'
                    }}
                >
                    <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {market.type}
                        {market.status === 'suspended' && (
                            <span style={{ color: '#ff8800', marginLeft: '8px', fontSize: '11px' }}>SUSPENDED</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {(market.selections || []).map(sel => {
                            const currentOdds = odds[sel.id] || sel.current_odds;
                            const changed = sel.previous_odds && Math.abs(currentOdds - sel.previous_odds) > 0.01;
                            return (
                                <button
                                    key={sel.id}
                                    disabled={sel.status === 'suspended' || market.status === 'suspended'}
                                    onClick={() => onAddToBetSlip && onAddToBetSlip({
                                        ...sel,
                                        current_odds: currentOdds,
                                        market_type: market.type,
                                        event_name: `${event.home_team} vs ${event.away_team}`
                                    })}
                                    style={{
                                        background: sel.status === 'suspended' ? 'rgba(255,255,255,0.03)' : 'rgba(0,204,255,0.08)',
                                        border: `1px solid ${changed ? '#ffd700' : 'rgba(0,204,255,0.2)'}`,
                                        borderRadius: '8px', padding: '10px 16px', cursor: sel.status === 'suspended' ? 'not-allowed' : 'pointer',
                                        color: sel.status === 'suspended' ? '#555' : '#fff',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '80px',
                                        transition: 'all 0.15s', opacity: sel.status === 'suspended' ? 0.5 : 1
                                    }}
                                >
                                    <span style={{ fontSize: '12px', color: '#aaa' }}>{sel.name}</span>
                                    <span style={{ fontWeight: '700', fontSize: '16px', color: changed ? '#ffd700' : '#00ccff' }}>
                                        {currentOdds?.toFixed(2)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};
