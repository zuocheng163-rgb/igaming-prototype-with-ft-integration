import React, { useState } from 'react';
import { useBetSlip } from '@neostrike/sdk';

const QUICK_STAKES = [5, 10, 25, 50];

export const BetSlipDrawer = ({ isOpen, onClose, onOpenCashier }) => {
    const {
        state, legs, stake, setStake, betType, setBetType,
        remove, clear, place, isValid, validationErrors, placedBet, error,
        changedOdds, acceptOddsChange, totalOdds, potentialPayout, STATES
    } = useBetSlip();

    const [activeTab, setActiveTab] = useState('SINGLE');

    if (!isOpen) return null;

    const handlePlace = async () => {
        await place();
    };

    if (state === STATES.PLACED && placedBet) {
        return (
            <div style={drawerStyle}>
                <DrawerHeader title="Bet Placed!" onClose={() => { onClose(); }} />
                <div style={{ padding: '32px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                    <div style={{ color: '#00ff88', fontWeight: '700', fontSize: '18px', marginBottom: '8px' }}>Bet Confirmed!</div>
                    <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>
                        Bet ID: {placedBet.bet?.id?.slice(0, 8)}...
                    </div>
                    <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '10px', padding: '16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: '#aaa' }}>Stake:</span>
                            <span style={{ color: '#fff', fontWeight: '600' }}>€{placedBet.bet?.stake?.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#aaa' }}>Potential Win:</span>
                            <span style={{ color: '#00ff88', fontWeight: '700' }}>€{placedBet.bet?.potential_payout?.toFixed(2)}</span>
                        </div>
                    </div>
                    <button onClick={() => { onClose(); }} style={btnPrimaryStyle}>Done</button>
                </div>
            </div>
        );
    }

    return (
        <div style={drawerStyle}>
            <DrawerHeader title={`BET SLIP (${legs.length})`} onClose={onClose} />

            {/* Bet type tabs */}
            {legs.length > 1 && (
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 16px' }}>
                    {['SINGLE', 'ACCUMULATOR'].map(t => (
                        <button
                            key={t}
                            onClick={() => { setActiveTab(t); setBetType(t); }}
                            style={{
                                padding: '10px 16px', background: 'none', border: 'none',
                                borderBottom: `2px solid ${activeTab === t ? '#00ccff' : 'transparent'}`,
                                color: activeTab === t ? '#00ccff' : '#888',
                                cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {legs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '48px 16px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
                        <div>Add selections to your bet slip</div>
                    </div>
                ) : (
                    <>
                        {/* Legs */}
                        {legs.map(leg => (
                            <div key={leg.selection_id} style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '8px', padding: '12px', marginBottom: '8px'
                            }}>
                                {leg.oddsChanged && (
                                    <div style={{
                                        background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
                                        borderRadius: '6px', padding: '8px 12px', marginBottom: '8px',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <span style={{ color: '#ffd700', fontSize: '12px' }}>Odds changed</span>
                                        <button
                                            onClick={() => acceptOddsChange(leg.selection_id)}
                                            style={{ background: '#ffd700', border: 'none', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', color: '#000', fontSize: '12px', fontWeight: '700' }}
                                        >
                                            Accept
                                        </button>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#fff', marginBottom: '2px' }}>{leg.selection_name}</div>
                                        <div style={{ color: '#888', fontSize: '12px' }}>{leg.event_name}</div>
                                        {leg.market_type && <div style={{ color: '#666', fontSize: '11px' }}>{leg.market_type}</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: leg.oddsChanged ? '#ffd700' : '#00ccff', fontWeight: '700', fontSize: '16px' }}>
                                            {leg.odds?.toFixed(2)}
                                        </span>
                                        <button
                                            onClick={() => remove(leg.selection_id)}
                                            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', padding: '0', lineHeight: 1 }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Accumulator odds display */}
                        {betType === 'ACCUMULATOR' && legs.length > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', color: '#aaa', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                                <span>Total Odds:</span>
                                <span style={{ color: '#00ccff', fontWeight: '700' }}>{totalOdds.toFixed(2)}</span>
                            </div>
                        )}

                        {/* Stake input */}
                        <div style={{ marginTop: '16px' }}>
                            <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Stake (EUR)</label>
                            <input
                                type="number"
                                value={stake}
                                onChange={e => setStake(e.target.value)}
                                placeholder="0.00"
                                min="0.5"
                                step="0.5"
                                style={{
                                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '16px',
                                    boxSizing: 'border-box', outline: 'none'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                {QUICK_STAKES.map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setStake(String(v))}
                                        style={{
                                            flex: 1, padding: '6px', background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                                            color: '#aaa', cursor: 'pointer', fontSize: '12px',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                                    >
                                        €{v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Potential payout */}
                        {stake && parseFloat(stake) > 0 && (
                            <div style={{
                                background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)',
                                borderRadius: '8px', padding: '12px', marginTop: '16px',
                                display: 'flex', justifyContent: 'space-between'
                            }}>
                                <span style={{ color: '#aaa', fontSize: '14px' }}>Potential Win:</span>
                                <span style={{ color: '#00ff88', fontWeight: '700', fontSize: '16px' }}>€{potentialPayout}</span>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div style={{ color: '#ff4444', fontSize: '13px', marginTop: '12px', padding: '10px', background: 'rgba(255,68,68,0.08)', borderRadius: '6px' }}>
                                {error}
                                {error.toLowerCase().includes('balance') && (
                                    <button
                                        onClick={() => { onClose(); onOpenCashier && onOpenCashier(); }}
                                        style={{ display: 'block', marginTop: '8px', background: '#00ccff', border: 'none', borderRadius: '4px', padding: '6px 14px', cursor: 'pointer', color: '#000', fontSize: '12px', fontWeight: '700' }}
                                    >
                                        Deposit
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer actions */}
            {legs.length > 0 && (
                <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        onClick={handlePlace}
                        disabled={!isValid || state === STATES.PLACING}
                        style={{
                            ...btnPrimaryStyle,
                            opacity: !isValid || state === STATES.PLACING ? 0.5 : 1,
                            cursor: !isValid || state === STATES.PLACING ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {state === STATES.PLACING ? 'Placing...' : state === STATES.VALIDATING ? 'Validating...' : 'Place Bet'}
                    </button>
                    {validationErrors.length > 0 && !error && (
                        <div style={{ color: '#888', fontSize: '12px', textAlign: 'center' }}>{validationErrors[0]}</div>
                    )}
                    <button onClick={clear} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '13px' }}>Clear slip</button>
                </div>
            )}
        </div>
    );
};

const drawerStyle = {
    position: 'fixed', top: 0, right: 0, width: '340px', height: '100%',
    background: '#0a0a0f', color: '#fff', zIndex: 1002,
    boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
    borderLeft: '1px solid rgba(255,255,255,0.05)',
    display: 'flex', flexDirection: 'column',
    transition: 'transform 0.3s ease'
};

const btnPrimaryStyle = {
    width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)',
    border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '15px',
    cursor: 'pointer', transition: 'opacity 0.15s'
};

const DrawerHeader = ({ title, onClose }) => (
    <div style={{
        padding: '20px 20px 16px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)'
    }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', letterSpacing: '0.5px' }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
);
