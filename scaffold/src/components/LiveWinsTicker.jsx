import React, { useState, useEffect, useRef } from 'react';

const MOCK_WINS = [
    { id: '1', player_handle: 'player_xk92ls', game_name: 'Gates of Olympus', provider: 'Pragmatic Play', thumbnail_url: '', win_amount: 2450.00, currency: 'EUR' },
    { id: '2', player_handle: 'player_fn44ab', game_name: 'Sweet Bonanza', provider: 'Pragmatic Play', thumbnail_url: '', win_amount: 810.50, currency: 'EUR' },
    { id: '3', player_handle: 'player_zz18rt', game_name: 'Starburst', provider: 'NetEnt', thumbnail_url: '', win_amount: 320.00, currency: 'EUR' },
    { id: '4', player_handle: 'player_qw77pp', game_name: 'Lightning Roulette', provider: 'Evolution', thumbnail_url: '', win_amount: 5200.00, currency: 'EUR' },
    { id: '5', player_handle: 'player_mn09cx', game_name: 'Book of Dead', provider: "Play'n GO", thumbnail_url: '', win_amount: 980.25, currency: 'EUR' },
    { id: '6', player_handle: 'player_hy55do', game_name: 'NeoStrike Demo Slot', provider: 'NeoStrike', thumbnail_url: '', win_amount: 125.00, currency: 'EUR' },
    { id: '7', player_handle: 'player_lt33uv', game_name: "Gonzo's Quest", provider: 'NetEnt', thumbnail_url: '', win_amount: 440.60, currency: 'EUR' },
    { id: '8', player_handle: 'player_ek72bm', game_name: 'Crazy Time', provider: 'Evolution', thumbnail_url: '', win_amount: 8900.00, currency: 'EUR' },
];

const EMOJIS = { 'Pragmatic Play': '🏛️', 'NetEnt': '💎', 'Evolution': '⚡', "Play'n GO": '📖', 'NeoStrike': '🚀', default: '🎮' };

const WinCard = ({ win }) => {
    const emoji = EMOJIS[win.provider] || EMOJIS.default;
    return (
        <div style={{
            width: 170, height: 90, flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
            borderRadius: 'var(--radius-lg)',
            marginRight: 'var(--space-md)',
            display: 'flex', gap: 10,
            padding: '10px 12px', alignItems: 'center',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Crystal shine overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to bottom, rgba(255,255,255,0.06), transparent)', pointerEvents: 'none' }} />
            
            <div style={{ width: 50, height: 50, borderRadius: 'var(--radius-md)', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.05)', zIndex: 1 }}>
                {emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                <div style={{ fontSize: 12, fontFamily: 'DM Sans', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{win.game_name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>{win.provider}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>{win.player_handle}</div>
                <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--color-win-gold)', marginTop: 2, textShadow: '0 0 8px rgba(255, 215, 0, 0.4)' }}>
                    🪙 €{win.win_amount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                </div>
            </div>
        </div>
    );
};

const SkeletonCard = () => (
    <div className="skeleton" style={{ width: 160, height: 90, flexShrink: 0, borderRadius: 'var(--radius-lg)', marginRight: 'var(--space-md)' }} />
);

export const LiveWinsTicker = () => {
    const [period, setPeriod] = useState('D');
    const [wins, setWins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [paused, setPaused] = useState(false);
    const trackRef = useRef(null);

    const fetchWins = async () => {
        const periodMap = { D: 'daily', W: 'weekly', M: 'monthly' };
        try {
            const res = await fetch(`${import.meta.env.VITE_NEOSTRIKE_API_URL}/api/live-wins?period=${periodMap[period]}&limit=10`);
            if (res.ok) {
                const data = await res.json();
                setWins(data.wins || MOCK_WINS);
            } else {
                setWins(MOCK_WINS);
            }
        } catch {
            setWins(MOCK_WINS);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { setLoading(true); fetchWins(); }, [period]);
    useEffect(() => {
        const id = setInterval(fetchWins, 10000);
        return () => clearInterval(id);
    }, [period]);

    const displayWins = loading ? [] : wins;
    const duration = Math.max(displayWins.length * 4, 20); // ~40px/s at 160+12px card width

    return (
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <div style={{ position: 'relative', width: 20, height: 20, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--color-accent)', opacity: 0.4, animation: 'pulse-ring 1.6s ease-out infinite' }} />
                    <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: 'var(--color-accent)' }} />
                </div>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)' }}>Live Wins</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {['M', 'W', 'D'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)} style={{
                            background: 'none',
                            border: 'none',
                            borderBottom: period === p ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: period === p ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            padding: '4px 10px', cursor: 'pointer',
                            fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
                            transition: 'color 150ms ease-out',
                        }}>{p === 'M' ? 'Monthly' : p === 'W' ? 'Weekly' : 'Daily'}</button>
                    ))}
                </div>
            </div>

            {/* Ticker */}
            <div
                style={{ width: '100%', height: 110, overflow: 'hidden', position: 'relative' }}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
            >
                {loading ? (
                    <div style={{ display: 'flex' }}>
                        {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : displayWins.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontFamily: 'DM Sans', fontSize: 14 }}>
                        No wins yet this period
                    </div>
                ) : (
                    <div ref={trackRef} style={{
                        display: 'flex',
                        animation: `ticker-scroll ${duration}s linear infinite`,
                        animationPlayState: paused ? 'paused' : 'running',
                        willChange: 'transform',
                        width: 'max-content',
                    }}>
                        {/* Duplicate for seamless loop */}
                        {[...displayWins, ...displayWins].map((w, i) => <WinCard key={`${w.id}-${i}`} win={w} />)}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes ticker-scroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                @keyframes pulse-ring {
                    0%   { transform: scale(0.8); opacity: 0.6; }
                    80%  { transform: scale(2.2); opacity: 0; }
                    100% { opacity: 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .ticker-track { animation: none !important; }
                }
            `}</style>
        </section>
    );
};
