import React from 'react';
import { useLeagues } from '@neostrike/sdk';

export const LeagueBrowser = ({ sportSlug, onNavigate }) => {
    const { leagues, isLoading } = useLeagues(sportSlug);

    return (
        <div style={{ padding: '24px' }}>
            <button
                onClick={() => onNavigate && onNavigate('sport')}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginBottom: '20px', fontSize: '14px' }}
            >
                ← Back to Sports
            </button>
            <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', marginBottom: '20px', textTransform: 'capitalize' }}>
                {sportSlug?.replace('-', ' ')} Leagues
            </h2>

            {isLoading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading leagues...</div>
            ) : leagues.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No leagues found</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {leagues.map(league => (
                        <button
                            key={league.id}
                            onClick={() => onNavigate && onNavigate(`sport-events-${league.slug}`)}
                            style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '10px', padding: '16px 20px', cursor: 'pointer',
                                textAlign: 'left', color: '#fff', display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,204,255,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                        >
                            <div>
                                <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '3px' }}>{league.name}</div>
                                <div style={{ color: '#888', fontSize: '12px' }}>{league.country_code} · {league.season}</div>
                            </div>
                            <span style={{ color: '#00ccff', fontSize: '20px' }}>›</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
