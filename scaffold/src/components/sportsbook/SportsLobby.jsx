import React from 'react';
import { useSportsCatalogue, useEvents } from '@neostrike/sdk';

const SPORT_EMOJIS = {
    football: '⚽', basketball: '🏀', tennis: '🎾', esports: '🎮',
    cricket: '🏏', rugby: '🏉', baseball: '⚾', hockey: '🏒',
};

export const SportsLobby = ({ onNavigate }) => {
    const { sports, isLoading } = useSportsCatalogue();
    const { events: featured } = useEvents({ status: 'upcoming' });

    if (isLoading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                Loading sports...
            </div>
        );
    }

    return (
        <div style={{ padding: '24px' }}>
            <h2 style={{ color: '#fff', marginBottom: '8px', fontSize: '22px', fontWeight: '700' }}>Sports</h2>
            <p style={{ color: '#888', marginBottom: '32px', fontSize: '14px' }}>Browse all sports and events</p>

            {/* Sports grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
                {sports.map(sport => (
                    <button
                        key={sport.id}
                        onClick={() => onNavigate && onNavigate(`sport-leagues-${sport.slug}`)}
                        style={{
                            background: 'linear-gradient(135deg, #1a1a2e 0%, #12122a 100%)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '12px', padding: '24px 16px',
                            cursor: 'pointer', textAlign: 'center', color: '#fff',
                            transition: 'all 0.2s', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: '10px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,204,255,0.4)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                    >
                        <span style={{ fontSize: '36px' }}>{SPORT_EMOJIS[sport.slug] || '🏆'}</span>
                        <span style={{ fontWeight: '600', fontSize: '14px' }}>{sport.name}</span>
                        <span style={{ color: '#888', fontSize: '12px' }}>
                            {sport.live_count > 0 && <span style={{ color: '#ff4444' }}>{sport.live_count} LIVE · </span>}
                            {sport.upcoming_count || 0} upcoming
                        </span>
                    </button>
                ))}

                {sports.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: '40px' }}>
                        No sports available
                    </div>
                )}
            </div>

            {/* Featured events */}
            {featured.length > 0 && (
                <>
                    <h3 style={{ color: '#fff', marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                        Featured Events
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {featured.slice(0, 5).map(event => (
                            <button
                                key={event.id}
                                onClick={() => onNavigate && onNavigate(`sport-event-${event.id}`)}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '8px', padding: '14px 16px',
                                    cursor: 'pointer', textAlign: 'left', color: '#fff',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            >
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                                        {event.home_team} vs {event.away_team}
                                    </div>
                                    <div style={{ color: '#888', fontSize: '12px' }}>
                                        {new Date(event.start_ts).toLocaleString()}
                                    </div>
                                </div>
                                <span style={{ color: '#00ccff', fontSize: '20px' }}>›</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
