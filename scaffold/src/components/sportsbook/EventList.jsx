import React, { useState } from 'react';
import { useEvents } from '@neostrike/sdk';

const OddsButton = ({ label, odds, onClick }) => (
    <button
        onClick={onClick}
        style={{
            background: 'rgba(0,204,255,0.08)', border: '1px solid rgba(0,204,255,0.2)',
            borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', color: '#fff',
            fontSize: '13px', minWidth: '56px', textAlign: 'center', transition: 'all 0.15s',
            display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center'
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,204,255,0.18)'; e.currentTarget.style.borderColor = '#00ccff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,204,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,204,255,0.2)'; }}
    >
        <span style={{ color: '#aaa', fontSize: '10px' }}>{label}</span>
        <span style={{ fontWeight: '700', color: '#00ccff' }}>{odds}</span>
    </button>
);

export const EventList = ({ league, onNavigate, onAddToBetSlip }) => {
    const [activeTab, setActiveTab] = useState('upcoming');
    const { events, isLoading, refresh } = useEvents({ league, status: activeTab === 'all' ? undefined : activeTab });

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {['upcoming', 'live', 'all'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '7px 16px', borderRadius: '6px', cursor: 'pointer',
                            border: activeTab === tab ? '1px solid #00ccff' : '1px solid rgba(255,255,255,0.1)',
                            background: activeTab === tab ? 'rgba(0,204,255,0.15)' : 'transparent',
                            color: activeTab === tab ? '#00ccff' : '#888', fontSize: '13px',
                            textTransform: 'capitalize', transition: 'all 0.15s'
                        }}
                    >
                        {tab === 'live' && <span style={{ color: '#ff4444', marginRight: '4px' }}>●</span>}
                        {tab}
                    </button>
                ))}
                <button onClick={refresh} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }} title="Refresh">↻</button>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading events...</div>
            ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>No events found</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {events.map(event => {
                        const topMarket = event.markets?.[0];
                        const sels = topMarket?.selections || [];
                        return (
                            <div
                                key={event.id}
                                style={{
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '10px', padding: '14px 16px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    gap: '16px', flexWrap: 'wrap'
                                }}
                            >
                                <div
                                    style={{ flex: 1, cursor: 'pointer', minWidth: '160px' }}
                                    onClick={() => onNavigate && onNavigate(`sport-event-${event.id}`)}
                                >
                                    {event.status === 'live' && (
                                        <span style={{ color: '#ff4444', fontSize: '10px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>● LIVE</span>
                                    )}
                                    <div style={{ fontWeight: '600', color: '#fff', fontSize: '14px', marginBottom: '4px' }}>
                                        {event.home_team} vs {event.away_team}
                                    </div>
                                    <div style={{ color: '#888', fontSize: '12px' }}>
                                        {new Date(event.start_ts).toLocaleString()}
                                    </div>
                                </div>
                                {sels.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {sels.slice(0, 3).map(s => (
                                            <OddsButton
                                                key={s.id}
                                                label={s.name}
                                                odds={s.current_odds?.toFixed(2)}
                                                onClick={() => onAddToBetSlip && onAddToBetSlip({
                                                    ...s,
                                                    market_type: topMarket?.type,
                                                    event_name: `${event.home_team} vs ${event.away_team}`
                                                })}
                                            />
                                        ))}
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
