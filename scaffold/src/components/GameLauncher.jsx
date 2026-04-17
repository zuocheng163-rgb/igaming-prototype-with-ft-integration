import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSeamlessWalletBridge, useSession, useFavourites, useNeoStrike } from '@neostrike/sdk';
import { logSDKEvent } from '@neostrike/sdk/src/utils';
import theme from '../../theme.config';

// ─── useRelatedGames local fallback (until SDK hook exists) ─────────────────
const useRelatedGames = (gameId) => {
    const RELATED = [
        { name: 'Gates of Olympus', emoji: '🏛️', provider: 'Pragmatic Play' },
        { name: 'Sweet Bonanza', emoji: '🍬', provider: 'Pragmatic Play' },
        { name: 'Starburst', emoji: '💎', provider: 'NetEnt' },
        { name: 'Gonzo\'s Quest', emoji: '🎭', provider: 'NetEnt' },
        { name: 'Book of Dead', emoji: '📖', provider: 'Play\'n GO' },
        { name: 'Lightning Roulette', emoji: '⚡', provider: 'Evolution' },
    ];
    return { games: RELATED, isLoading: false };
};

// ─── MockGame (fallback for non-iframe games) ────────────────────────────────
const MockGame = ({ game, onClose }) => {
    const { balance, bonusBalance, client, pollBalance } = useNeoStrike();
    const [lastWin, setLastWin] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [sessionNet, setSessionNet] = useState(0);

    const BET_AMOUNT = 10;
    const totalBalance = (balance || 0) + (bonusBalance || 0);
    const isLoggedIn = client?.isAuthenticated();

    const handleSpin = async () => {
        if (!isLoggedIn) {
            setStatusMsg('⚠ Please log in to play with real money.');
            return;
        }
        if (totalBalance < BET_AMOUNT) {
            setStatusMsg('⚠ Insufficient funds. Please make a deposit.');
            return;
        }

        setIsSpinning(true);
        setLastWin(0);
        setStatusMsg('');

        try {
            // Debit the bet — backend consumes bonus balance first, then real money
            await client.debit(BET_AMOUNT, game?.id);
            setSessionNet(prev => prev - BET_AMOUNT);
            logSDKEvent('WALLET', `Bet placed: -${BET_AMOUNT} EUR`, { gameId: game?.id });

            await new Promise(r => setTimeout(r, 800)); // Spin delay

            const win = Math.random() > 0.7 ? Math.floor(Math.random() * 50) + 10 : 0;
            if (win > 0) {
                setLastWin(win);
                setSessionNet(prev => prev + win);
                await client.credit(win, game?.id);
                logSDKEvent('WALLET', `Win credited: +${win} EUR`, { gameId: game?.id });
                setStatusMsg(`🎉 You won €${win.toFixed(2)}!`);
            } else {
                setStatusMsg('No win this round. Try again!');
            }

            // Refresh wallet display
            await pollBalance();
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || 'Transaction failed';
            setStatusMsg(`❌ ${msg}`);
            logSDKEvent('ERROR', `Game transaction failed: ${msg}`);
        } finally {
            setIsSpinning(false);
        }
    };

    const triggerAlert = () => {
        logSDKEvent('INTERVENTION', 'Simulating Responsible Gaming Alert');
        window.dispatchEvent(new CustomEvent('neostrike-simulate-alert', {
            detail: { title: 'Play Break Reminder', message: 'You have been playing for 60 minutes. Would you like to take a short break?', severity: 'info' }
        }));
    };

    return (
        <div style={{ flex: 1, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative' }}>
            <div style={{ padding: '40px', borderRadius: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', width: '420px' }}>
                <div style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>NEOSTRIKE SIMULATION ENGINE</div>
                <h2 style={{ fontSize: '32px', margin: '0 0 20px 0' }}>{game?.name}</h2>

                {/* Balance display */}
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: '#555', letterSpacing: '1px', marginBottom: '4px' }}>REAL BALANCE</div>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: theme.colors.primary }}>
                                €{(balance || 0).toFixed(2)}
                            </div>
                        </div>
                        {(bonusBalance || 0) > 0 && (
                            <div>
                                <div style={{ fontSize: '10px', color: '#555', letterSpacing: '1px', marginBottom: '4px' }}>BONUS (used first)</div>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffaa00' }}>
                                    €{(bonusBalance || 0).toFixed(2)}
                                </div>
                            </div>
                        )}
                    </div>
                    {sessionNet !== 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: sessionNet >= 0 ? '#00ff88' : '#ff6464', fontWeight: '700' }}>
                            Session P&L: {sessionNet >= 0 ? '+' : ''}€{sessionNet.toFixed(2)}
                        </div>
                    )}
                </div>

                {lastWin > 0 && (
                    <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '24px', marginBottom: '16px' }}>
                        BIG WIN: +€{lastWin.toFixed(2)}! 🎉
                    </div>
                )}

                {statusMsg && (
                    <div style={{ padding: '10px', marginBottom: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: '13px' }}>
                        {statusMsg}
                    </div>
                )}

                <button
                    onClick={handleSpin}
                    disabled={isSpinning || !isLoggedIn || totalBalance < BET_AMOUNT}
                    style={{ padding: '20px 60px', borderRadius: '40px', background: (!isLoggedIn || totalBalance < BET_AMOUNT) ? '#333' : theme.colors.primary, color: '#fff', border: 'none', fontSize: '24px', fontWeight: 'bold', cursor: (isSpinning || !isLoggedIn || totalBalance < BET_AMOUNT) ? 'not-allowed' : 'pointer', opacity: isSpinning ? 0.7 : 1 }}
                >
                    {isSpinning ? 'SPINNING...' : `SPIN (€${BET_AMOUNT})`}
                </button>

                {!isLoggedIn && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#ffaa00' }}>
                        Log in to bet using your real wallet
                    </div>
                )}

                <div style={{ marginTop: '32px' }}>
                    <button onClick={triggerAlert} style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#ccc', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '12px' }}>
                        Simulate RG Alert
                    </button>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: '20px', color: '#555', fontSize: '11px' }}>Bonus balance is consumed first before real money.</div>
        </div>
    );
};

// ─── Main GameLauncher ────────────────────────────────────────────────────────
export const GameLauncher = ({ game, launchUrl, onClose, currentMode = 'demo' }) => {
    const iframeRef = useRef(null);
    const [mode, setMode] = useState(currentMode);
    const [activeTab, setActiveTab] = useState('info');
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [iframeLoadTimeout, setIframeLoadTimeout] = useState(false);
    const [tournamentDismissed, setTournamentDismissed] = useState(false);
    const [sessionNet, setSessionNet] = useState(0);

    const { timePlayed } = useSession();
    const { toggleFavourite, isFavourite } = useFavourites();
    const { games: relatedGames } = useRelatedGames(game?.id);

    // Use the mode-aware launch URL
    const activeUrl = launchUrl
        ? launchUrl.replace(/mode=(real|demo)/, `mode=${mode}`)
        : null;

    useSeamlessWalletBridge(iframeRef, mode);

    // Listen for demo slot balance updates to track session net P&L
    useEffect(() => {
        const handleMsg = (e) => {
            if (e.data?.type === 'BALANCE_UPDATE') {
                setSessionNet(prev => prev + (e.data.win || 0) - (e.data.real || 0));
            }
        };
        window.addEventListener('message', handleMsg);
        return () => window.removeEventListener('message', handleMsg);
    }, []);

    // 3-second iframe load timeout
    useEffect(() => {
        if (!activeUrl) return;
        setIframeLoaded(false);
        setIframeLoadTimeout(false);
        const timer = setTimeout(() => setIframeLoadTimeout(true), 3000);
        return () => clearTimeout(timer);
    }, [activeUrl]);

    const handleModeToggle = useCallback(() => {
        const newMode = mode === 'real' ? 'demo' : 'real';
        setMode(newMode);
        setIframeLoaded(false);
        logSDKEvent('SDK', `Mode switched to ${newMode}`);
    }, [mode]);

    if (!game) return null;

    const formatTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // RG session bar colour: green → amber (75%) → red (90%)
    const SESSION_LIMIT = 3600; // 1 hour default
    const sessionPct = Math.min((timePlayed / SESSION_LIMIT) * 100, 100);
    const rgColour = sessionPct >= 90 ? '#ff4444' : sessionPct >= 75 ? '#ffaa00' : '#00ff88';

    const fav = game?.id ? isFavourite(game.id) : false;

    // Demo mode — DEMO watermark border style
    const demoWatermark = mode === 'demo' ? {
        outline: '2px dashed rgba(255,170,0,0.4)',
        outlineOffset: '-2px',
    } : {};

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0a0a0f', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>

            {/* ── C-03a Top Bar ── */}
            <div style={{ padding: '0 20px', height: '52px', background: 'linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                {/* Left: Navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onClose} id="game-close-btn" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ← LOBBY
                    </button>
                    <button onClick={() => { window.location.href = '/'; }} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', borderRadius: '6px' }} title="Home">🏠</button>
                    <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.08)' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>{game.name}</span>
                        <span style={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{game.provider?.split(':')[0]}</span>
                        {/* Favourite Toggle */}
                        <button
                            onClick={() => game?.id && toggleFavourite(game.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', transition: 'transform 0.15s' }}
                            title={fav ? 'Remove from favourites' : 'Add to favourites'}
                        >
                            {fav ? '❤️' : '🤍'}
                        </button>
                    </div>
                </div>

                {/* Right: Mode toggle + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* Demo / Wallet Simulation Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px 4px 4px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: mode === 'demo' ? '#ffaa00' : '#555', letterSpacing: '0.5px' }}>FREE PLAY</span>
                        <div
                            id="mode-toggle"
                            onClick={handleModeToggle}
                            style={{ width: '32px', height: '18px', background: mode === 'real' ? '#00ff88' : '#333', borderRadius: '9px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}
                        >
                            <div style={{ width: '14px', height: '14px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: mode === 'real' ? '16px' : '2px', transition: 'left 0.3s' }}></div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: mode === 'real' ? '#00ff88' : '#555', marginRight: '8px', letterSpacing: '0.5px' }}>WALLET SIM</span>
                    </div>

                    <div style={{ color: mode === 'real' ? '#00ff88' : '#ffaa00', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', padding: '5px 12px', background: 'rgba(0,0,0,0.4)', borderRadius: '20px', border: `1px solid ${mode === 'real' ? '#00ff8833' : '#ffaa0033'}` }}>
                        {mode === 'real' ? '● WALLET SIM ACTIVE' : '○ FREE PLAY'}
                    </div>
                </div>
            </div>

            {/* ── C-03b Tournament Banner ── */}
            {!tournamentDismissed && (
                <div style={{ background: 'linear-gradient(90deg, #1a0a2e, #0a1a2e)', borderBottom: '1px solid rgba(0,136,255,0.2)', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0088ff', boxShadow: '0 0 8px #0088ff', animation: 'pulse 1.5s infinite' }}></div>
                        <span style={{ color: '#fff', fontWeight: '700', fontSize: '12px' }}>LIVE TOURNAMENT</span>
                        <span style={{ color: '#888', fontSize: '12px' }}>NeoStrike Grand Prix — Prize Pool</span>
                        <span style={{ color: '#0088ff', fontWeight: '700', fontSize: '12px' }}>€10,000</span>
                    </div>
                    <button onClick={() => setTournamentDismissed(true)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                </div>
            )}

            {/* ── Main Content Area ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Game Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', minWidth: 0 }}>

                    {/* ── C-03c Iframe Container ── */}
                    <div style={{ flex: 1, position: 'relative', ...demoWatermark }}>
                        {activeUrl ? (
                            <>
                                {/* Loading spinner */}
                                {!iframeLoaded && !iframeLoadTimeout && (
                                    <div style={{ position: 'absolute', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                                        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: theme.colors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }}></div>
                                        <div style={{ color: '#888', fontSize: '13px' }}>Loading {game.name}…</div>
                                    </div>
                                )}
                                {/* DEMO watermark label */}
                                {mode === 'demo' && (
                                    <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.4)', color: '#ffaa00', fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '4px', letterSpacing: '2px', zIndex: 5, pointerEvents: 'none' }}>
                                        FREE PLAY — NO WALLET DEBIT
                                    </div>
                                )}
                                <iframe
                                    ref={iframeRef}
                                    key={`${game.id}-${mode}`}
                                    src={activeUrl}
                                    title={game.name}
                                    onLoad={() => setIframeLoaded(true)}
                                    style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
                                    allowFullScreen
                                />
                            </>
                        ) : (
                            <MockGame game={game} onClose={onClose} />
                        )}
                    </div>

                    {/* ── C-03d RG Session Bar ── */}
                    <div style={{ height: '42px', background: '#0a0a0f', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 20px', flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', color: '#555', fontWeight: '700', letterSpacing: '1px', whiteSpace: 'nowrap' }}>SESSION</span>
                        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${sessionPct}%`, height: '100%', background: rgColour, boxShadow: `0 0 8px ${rgColour}`, transition: 'width 1s linear, background 0.5s' }}></div>
                        </div>
                        <span style={{ color: sessionPct >= 90 ? '#ff4444' : '#fff', fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', whiteSpace: 'nowrap' }}>
                            {formatTime(timePlayed)}
                        </span>
                        {sessionPct === 0 && (
                            <span style={{ fontSize: '10px', color: '#555' }}>No limit set</span>
                        )}
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('neostrike-open-dashboard', { detail: { tab: 'rg' } }))}
                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#888', fontSize: '10px', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                            EDIT LIMITS
                        </button>
                    </div>
                </div>

                {/* ── Right Sidebar ── */}
                <div style={{ width: '290px', background: '#13131e', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    {/* Tab Navigation */}
                    <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                        {['info', 'related'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{ flex: 1, padding: '13px 8px', background: 'none', border: 'none', color: activeTab === tab ? '#fff' : '#555', borderBottom: activeTab === tab ? `2px solid ${theme.colors.primary}` : '2px solid transparent', fontWeight: '700', cursor: 'pointer', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', transition: 'color 0.2s' }}
                            >
                                {tab === 'info' ? 'GAME INFO' : 'RELATED'}
                            </button>
                        ))}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'info' ? (
                            <div style={{ padding: '16px' }}>
                                {/* ── C-03e Game Info Panel ── */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                        {[
                                            { label: 'RTP', value: `${game.rtp || '96.00'}%` },
                                            { label: 'Volatility', value: game.volatility || 'High' },
                                            { label: 'Max Win', value: '500×' },
                                            { label: 'Bet Range', value: '€0.20–€5' },
                                        ].map(({ label, value }) => (
                                            <div key={label}>
                                                <div style={{ fontSize: '9px', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                                                <div style={{ color: '#fff', fontSize: '13px', fontWeight: '700' }}>{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {['DEMO', 'SEAMLESS WALLET', 'HTML5'].map(tag => (
                                            <span key={tag} style={{ fontSize: '9px', background: 'rgba(0,136,255,0.1)', color: '#0088ff', border: '1px solid rgba(0,136,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>{tag}</span>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Rank Card ── */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                                    <div style={{ fontSize: '9px', color: '#555', fontWeight: '700', letterSpacing: '1px', marginBottom: '10px' }}>LOYALTY RANK</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #FFD700, #FDB931)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>💎</div>
                                        <div>
                                            <div style={{ color: '#FFD700', fontWeight: '700', fontSize: '14px' }}>Gold Tier</div>
                                            <div style={{ color: '#666', fontSize: '11px' }}>2,450 XP</div>
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.5)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: '75%', height: '100%', background: 'linear-gradient(90deg, #FFD700, #FDB931)' }}></div>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#555', marginTop: '6px', textAlign: 'right' }}>550 XP to Platinum</div>
                                </div>

                                {/* ── Recent Sessions ── */}
                                <div style={{ fontSize: '9px', color: '#555', fontWeight: '700', letterSpacing: '1px', marginBottom: '10px' }}>RECENT SESSIONS</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {/* Live session row */}
                                    <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)', padding: '10px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#00ff88', fontSize: '11px', fontWeight: '700' }}>NOW — ACTIVE</div>
                                            <div style={{ color: '#666', fontSize: '10px' }}>{game.name}</div>
                                        </div>
                                        <div style={{ color: sessionNet >= 0 ? '#00ff88' : '#ff4444', fontSize: '12px', fontWeight: '700' }}>
                                            {sessionNet >= 0 ? '+' : ''}€{Math.abs(sessionNet).toFixed(2)}
                                        </div>
                                    </div>
                                    {[{ date: 'Yesterday, 18:42', net: -3.20 }, { date: 'Mar 21, 14:15', net: 12.50 }, { date: 'Mar 20, 20:01', net: -5.00 }].map((s, i) => (
                                        <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ color: '#777', fontSize: '10px' }}>{s.date}</div>
                                            <div style={{ color: s.net >= 0 ? '#00ff88' : '#ff4444', fontSize: '11px', fontWeight: '700' }}>
                                                {s.net >= 0 ? '+' : ''}€{Math.abs(s.net).toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* ── C-03f Related Games Tab ── */
                            <div style={{ padding: '16px' }}>
                                <div style={{ fontSize: '9px', color: '#555', fontWeight: '700', letterSpacing: '1px', marginBottom: '12px' }}>SIMILAR GAMES</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {relatedGames.map((g, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                        >
                                            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `hsl(${i * 40 + 220}, 50%, 20%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{g.emoji}</div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                                                <div style={{ color: '#fff', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                                                <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>{g.provider}</div>
                                            </div>
                                            <div style={{ color: '#333', fontSize: '14px', alignSelf: 'center' }}>›</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
            `}</style>
        </div>
    );
};
