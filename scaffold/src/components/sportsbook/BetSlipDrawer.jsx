import React, { useState } from 'react';
import { useBetSlip, useBalance, useSession, useNeoStrike } from '@neostrike/sdk';

const QUICK_STAKES = [5, 10, 25, 50];

export const BetSlipDrawer = ({ isOpen, onClose, onOpenCashier, player: playerProp, betSlip }) => {
    const {
        state, legs, stake, setStake, betType, setBetType,
        remove, clear, place, isValid, validationErrors, placedBet, error,
        changedOdds, acceptOddsChange, totalOdds, potentialPayout, STATES
    } = betSlip || useBetSlip();
    
    const { player: sessionPlayer, getToken } = useSession();
    const player = playerProp || sessionPlayer;
    const { balance, bonusBalance, currency, refresh } = useBalance(player?.user_id, { token: getToken() });
    const { client, pollBalance } = useNeoStrike();

    const [simulating, setSimulating] = useState(false);
    const [simResult, setSimResult] = useState(null);
    
    const totalBalance = (balance || 0) + (bonusBalance || 0);

    const [activeTab, setActiveTab] = useState('SINGLE');

    if (!isOpen) return null;

    const handlePlace = async () => {
        setSimResult(null);
        await place();
        refresh();
    };

    const handleSimulateDeposit = async () => {
        if (!player?.user_id) {
            console.error('No player ID for simulation');
            return;
        }
        setSimulating(true);
        try {
            // Direct fetch to backend for maximum reliability in simulation
            const response = await fetch(`${import.meta.env.VITE_NEOSTRIKE_API_URL}/api/credit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                    'x-username': player.username
                },
                body: JSON.stringify({
                    user_id: player.user_id,
                    amount: 100,
                    transaction_id: `sim-dep-${Date.now()}`
                })
            });
            
            if (response.ok) {
                await pollBalance();
                refresh();
            }
        } catch (err) {
            console.error('Deposit simulation failed', err);
        } finally {
            setSimulating(false);
        }
    };

    const handleSimulateWin = async () => {
        setSimulating(true);
        try {
            const winAmount = placedBet?.potential_payout || (parseFloat(stake) * (totalOdds || 2));
            await client.credit(winAmount, `sim-win`);
            setSimResult('WON');
            await pollBalance();
            refresh();
        } catch (err) {
            console.error('Simulation failed', err);
        } finally {
            setSimulating(false);
        }
    };

    const handleSimulateLoss = async () => {
        setSimResult('LOST');
    };

    if ((state === STATES.PLACED && placedBet) || simResult) {
        return (
            <div style={drawerStyle}>
                <DrawerHeader title="Bet Placed!" onClose={() => { onClose(); }} />
                <div style={{ padding: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>{simResult === 'WON' ? '🏆' : simResult === 'LOST' ? '❌' : '✅'}</div>
                    <div style={{ color: simResult === 'WON' ? '#00ff88' : simResult === 'LOST' ? '#ff4444' : '#00ff88', fontWeight: '700', fontSize: '18px', marginBottom: '8px' }}>
                        {simResult === 'WON' ? 'Bet Won!' : simResult === 'LOST' ? 'Bet Lost' : 'Bet Confirmed!'}
                    </div>
                    <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>
                        Bet ID: {placedBet?.bet_id?.slice(0, 8) || 'SIM-' + Math.floor(Math.random()*10000)}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: '#aaa' }}>Stake:</span>
                            <span style={{ color: '#fff', fontWeight: '600' }}>€{(placedBet?.stake || parseFloat(stake || 0)).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#aaa' }}>Potential Win:</span>
                            <span style={{ color: '#00ff88', fontWeight: '700' }}>€{(placedBet?.potential_payout || (parseFloat(stake || 0) * (totalOdds || 2))).toFixed(2)}</span>
                        </div>
                    </div>

                    {!simResult ? (
                        <>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px', fontWeight: '700' }}>Simulation Suite</div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={handleSimulateWin} 
                                    disabled={simulating}
                                    style={{ 
                                        flex: 1, padding: '16px', background: 'rgba(0,255,136,0.1)', 
                                        border: '2px solid #00ff88', borderRadius: '12px', color: '#00ff88', 
                                        fontWeight: '800', cursor: 'pointer', fontSize: '14px',
                                        transition: 'transform 0.1s'
                                    }}
                                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {simulating ? '...' : '🏆 SIMULATE WIN'}
                                </button>
                                <button 
                                    onClick={handleSimulateLoss} 
                                    style={{ 
                                        flex: 1, padding: '16px', background: 'rgba(255,68,68,0.1)', 
                                        border: '2px solid #ff4444', borderRadius: '12px', color: '#ff4444', 
                                        fontWeight: '800', cursor: 'pointer', fontSize: '14px',
                                        transition: 'transform 0.1s'
                                    }}
                                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    ❌ SIMULATE LOSS
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', color: '#888', fontSize: '13px', marginBottom: '20px' }}>
                            Simulation complete. Balance updated.
                        </div>
                    )}

                    <button onClick={() => { clear(); setSimResult(null); onClose(); }} style={{ ...btnPrimaryStyle, marginTop: '20px' }}>Done</button>
                </div>
            </div>
        );
    }

    return (
        <div style={drawerStyle}>
            <DrawerHeader title={`BET SLIP (${legs.length})`} onClose={onClose} />
            
            {/* Premium Balance Card */}
            <div style={{
                padding: '16px', 
                background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', 
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                marginBottom: '4px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Available Balance</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: totalBalance > 0 ? '#00ff88' : '#666', fontFamily: 'Outfit, sans-serif' }}>
                            {currency || 'EUR'} {totalBalance.toFixed(2)}
                        </div>
                    </div>
                    {totalBalance === 0 && (
                        <button 
                            onClick={handleSimulateDeposit} 
                            disabled={simulating} 
                            style={{ 
                                background: 'rgba(0,204,255,0.1)', 
                                border: '1px solid rgba(0,204,255,0.3)', 
                                color: '#00ccff', 
                                fontSize: '11px', 
                                padding: '6px 10px', 
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '700',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,204,255,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,204,255,0.1)'}
                        >
                            {simulating ? 'Processing...' : 'Simulate +€100'}
                        </button>
                    )}
                </div>
                {(bonusBalance || 0) > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '8px' }}>
                        <span>Real: {currency} {balance?.toFixed(2)}</span>
                        <span>•</span>
                        <span style={{ color: '#ffaa00' }}>Bonus: {currency} {bonusBalance?.toFixed(2)}</span>
                    </div>
                )}
            </div>

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
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Your Slip is Empty</div>
                        <div style={{ fontSize: '13px', marginBottom: '24px', lineHeight: '1.5', color: '#aaa' }}>
                            To test the simulation flow, click on any <strong style={{color: '#00ff88'}}>odds</strong> in the sportsbook to add a selection here.
                        </div>
                        <button 
                            onClick={onClose}
                            style={{
                                background: 'rgba(0, 204, 255, 0.1)',
                                border: '1px solid rgba(0, 204, 255, 0.3)',
                                color: '#00ccff',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 204, 255, 0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 204, 255, 0.1)'}
                        >
                            Browse Sportsbook
                        </button>
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
                        disabled={!isValid || state === STATES.PLACING || totalBalance < parseFloat(stake || 0)}
                        style={{
                            ...btnPrimaryStyle,
                            opacity: (!isValid || state === STATES.PLACING || totalBalance < parseFloat(stake || 0)) ? 0.5 : 1,
                            cursor: (!isValid || state === STATES.PLACING || totalBalance < parseFloat(stake || 0)) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {state === STATES.PLACING ? 'Placing...' : `Place Bet (€${parseFloat(stake || 0).toFixed(2)})`}
                    </button>
                    {totalBalance < parseFloat(stake || 0) && stake && (
                        <div style={{ color: '#ff4444', fontSize: '11px', textAlign: 'center' }}>Insufficient funds for this stake</div>
                    )}
                    {validationErrors.length > 0 && !error && (
                        <div style={{ color: '#888', fontSize: '12px', textAlign: 'center' }}>{validationErrors[0]}</div>
                    )}
                    <button onClick={clear} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '13px', marginTop: '4px' }}>Clear slip</button>
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
