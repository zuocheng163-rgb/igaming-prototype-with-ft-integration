import React, { useState } from 'react';
import { useBetHistory, useCashOut } from '@neostrike/sdk';

const STATUS_COLORS = { active: '#00ccff', won: '#00ff88', lost: '#ff4444', void: '#888', cashed_out: '#ffd700', pending: '#ff8800' };

const BetCard = ({ bet }) => {
    const { cashOutValue, canCashOut, request, isRequesting } = useCashOut(
        bet.status === 'active' ? bet.id : null
    );

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px', padding: '16px', marginBottom: '10px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#888', fontSize: '12px' }}>#{bet.id?.slice(0, 8)}</span>
                <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px',
                    color: STATUS_COLORS[bet.status] || '#888',
                    background: `${STATUS_COLORS[bet.status]}22` || 'rgba(136,136,136,0.1)',
                    textTransform: 'uppercase'
                }}>
                    {bet.status}
                </span>
            </div>
            <div style={{ marginBottom: '12px' }}>
                {(bet.legs || []).map((leg, i) => (
                    <div key={i} style={{ color: '#ddd', fontSize: '14px', marginBottom: '3px' }}>
                        {leg.selection_name || `Leg ${i + 1}`}
                        <span style={{ color: '#aaa', marginLeft: '6px', fontSize: '13px' }}>@ {leg.odds_at_placement?.toFixed(2)}</span>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                <div>
                    <span style={{ color: '#888' }}>Stake: </span>
                    <span style={{ color: '#fff', fontWeight: '600' }}>€{bet.stake?.toFixed(2)}</span>
                </div>
                <div>
                    <span style={{ color: '#888' }}>Potential: </span>
                    <span style={{ color: '#00ff88', fontWeight: '600' }}>€{bet.potential_payout?.toFixed(2)}</span>
                </div>
            </div>
            {canCashOut && cashOutValue && (
                <button
                    onClick={request}
                    disabled={isRequesting}
                    style={{
                        marginTop: '12px', width: '100%', padding: '10px',
                        background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)',
                        borderRadius: '6px', color: '#ffd700', fontWeight: '700', cursor: isRequesting ? 'not-allowed' : 'pointer',
                        fontSize: '14px', opacity: isRequesting ? 0.7 : 1
                    }}
                >
                    {isRequesting ? 'Processing...' : `Cash Out €${cashOutValue?.toFixed(2)}`}
                </button>
            )}
        </div>
    );
};

export const BetHistory = () => {
    const [activeTab, setActiveTab] = useState('active');
    const { bets, isLoading, refresh } = useBetHistory({ status: activeTab === 'all' ? undefined : activeTab });

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', margin: 0 }}>My Bets</h2>
                <button onClick={refresh} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '20px' }}>↻</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {['active', 'won', 'lost', 'all'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '7px 14px', borderRadius: '6px', cursor: 'pointer',
                            border: activeTab === tab ? `1px solid ${STATUS_COLORS[tab] || '#00ccff'}` : '1px solid rgba(255,255,255,0.1)',
                            background: activeTab === tab ? `${STATUS_COLORS[tab] || '#00ccff'}22` : 'transparent',
                            color: activeTab === tab ? (STATUS_COLORS[tab] || '#00ccff') : '#888',
                            fontSize: '13px', textTransform: 'capitalize', transition: 'all 0.15s'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading bets...</div>
            ) : bets.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>No {activeTab} bets</div>
            ) : (
                bets.map(bet => <BetCard key={bet.id} bet={bet} />)
            )}
        </div>
    );
};
