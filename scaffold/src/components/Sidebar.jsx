import React, { useState, useEffect, useCallback } from 'react';
import { useSession, useFavourites, useBalance } from '@neostrike/sdk';

// ── Icons (inline SVGs) ───────────────────────────────────────────
const Icon = ({ path, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
    </svg>
);

const ICONS = {
    home:       'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
    recent:     'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v6l4 2',
    favourites: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
    tier:       'M6 9H4.5a2.5 2.5 0 010-5H6 M18 9h1.5a2.5 2.5 0 010 5H18 M8 9h8 M8 15h8 M12 3v18',
    refer:      'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 7a4 4 0 100 8 4 4 0 000-8z M22 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
    achievements:'M12 15l-8.5 5 2-9.5L1 5.5l9.5-1L12 1l1.5 3.5 9.5 1-4.5 5 2 9.5z',
    live:       'M2 12h2M20 12h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41 M12 8a4 4 0 100 8 4 4 0 000-8z',
    social:     'M3 3h18v18H3z M3 9h18M3 15h18M9 3v18M15 3v18',
    table:      'M2 3h20M2 9h20M2 15h20M2 21h20',
    providers:  'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    contact:    'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    wheel:      'M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2',
    sports:     'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 0c2.5 5 2.5 15 0 20M2 12c5-2.5 15-2.5 20 0M4.93 4.93c3.5 2 7.64 3.07 7.07 3.07-.57 0 3.57-1.07 7.07-3.07M4.93 19.07c3.5-2 7.64-3.07 7.07-3.07-.57 0 3.57 1.07 7.07 3.07',
    chevronDown:'M6 9l6 6 6-6',
    hamburger:  'M3 12h18M3 6h18M3 18h18',
    close:      'M18 6L6 18M6 6l12 12',
};

// ── Spin & Win Widget ─────────────────────────────────────────────
const SpinWidget = ({ collapsed }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [eligible, setEligible] = useState(false);

    useEffect(() => {
        // Calculate time until midnight reset
        const tick = () => {
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            const diff = Math.floor((midnight - now) / 1000);
            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            setTimeLeft(`${h}h ${m}m ${s}s`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    if (collapsed) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', position: 'relative' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: eligible ? 'var(--color-accent-glow)' : 'var(--color-surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: eligible ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                🎡
            </div>
        </div>
    );

    return (
        <div style={{ margin: '0 12px 8px', padding: '12px 14px', background: eligible ? 'rgba(0,230,118,0.08)' : 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', borderLeft: '3px solid var(--color-accent)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, animation: eligible ? 'spin-slow 4s linear infinite' : 'none' }}>🎡</span>
                <div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13, color: eligible ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                        {eligible ? 'Spin available!' : 'Spin & Win!'}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {eligible ? 'Click to spin now' : `Next: ${timeLeft}`}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Nav Item ──────────────────────────────────────────────────────
const NavItem = ({ icon, label, active, onClick, collapsed, badge }) => (
    <div
        onClick={onClick}
        title={collapsed ? label : undefined}
        style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
            padding: '11px 16px',
            borderLeft: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
            background: active ? 'var(--color-accent-glow)' : 'transparent',
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'background 150ms ease-out, color 150ms ease-out',
            position: 'relative',
            justifyContent: collapsed ? 'center' : 'flex-start',
            whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--color-surface-raised)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = active ? 'var(--color-accent-glow)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'; } }}
    >
        <Icon path={icon} size={18} />
        {!collapsed && <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>{label}</span>}
        {!collapsed && badge && (
            <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: badge }} />
        )}
    </div>
);

// ── Divider ───────────────────────────────────────────────────────
const Divider = () => (
    <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />
);

// ── Auth Section ──────────────────────────────────────────────────
const AuthSection = ({ isCollapsed, isAuthenticated, player, onLogin, onLogout, onOpenWallet, onNavigate }) => {
    const { getToken } = useSession();
    const { balance, bonusBalance, currency } = useBalance(player?.user_id, { token: getToken() });
    
    if (isAuthenticated && player) {
        return (
            <div style={{ padding: isCollapsed ? '12px 0' : '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', alignItems: isCollapsed ? 'center' : 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
                    <div onClick={onOpenWallet} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-primary)', fontWeight: 'bold', fontSize: 16, flexShrink: 0 }} title="Open Dashboard">
                        {player.username?.slice(0, 2).toUpperCase() || '?'}
                    </div>
                    {!isCollapsed && (
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{player.username}</span>
                            <span style={{ fontSize: '13px', color: 'var(--color-accent)', fontWeight: 'bold' }}>{currency || 'EUR'} {((balance || 0) + (bonusBalance || 0)).toFixed(2)}</span>
                        </div>
                    )}
                </div>
                {!isCollapsed && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={onOpenWallet} style={{ flex: 1, padding: '8px 0', background: 'var(--color-accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                            + Deposit
                        </button>
                        <button onClick={onLogout} style={{ padding: '8px', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Logout">
                            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={16} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (isCollapsed) {
        return (
            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'center' }}>
                <div style={{ padding: '8px', background: 'var(--color-accent)', color: '#000', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center' }} title="Login">
                    <Icon path="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4 M10 17l5-5-5-5 M15 12H3" size={16} />
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input name="username" placeholder="Username" defaultValue="test01" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface-overlay)', color: 'var(--color-text-primary)', width: '100%', outline: 'none', fontSize: 13 }} />
                <input name="token" placeholder="Token" defaultValue="token-test01" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface-overlay)', color: 'var(--color-text-primary)', width: '100%', outline: 'none', fontSize: 13 }} />
                <button type="submit" style={{ padding: '10px', background: 'var(--color-accent)', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>Login</button>
            </form>
        </div>
    );
};

// ── Main Sidebar ──────────────────────────────────────────────────
export const Sidebar = ({ activePage = 'home', onNavigate, isOpen, onClose, isAuthenticated, player, onLogin, onLogout, onOpenWallet }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);

    useEffect(() => {
        const check = () => {
            setIsMobile(window.innerWidth < 768);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
            setCollapsed(window.innerWidth >= 768 && window.innerWidth < 1024);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const nav = (page) => { onNavigate?.(page); if (isMobile) onClose?.(); };
    const isCollapsed = collapsed || isTablet;

    const sidebarStyle = {
        position: 'fixed', left: 0, top: 0,
        width: isMobile ? 240 : (isCollapsed ? 64 : 240),
        height: '100vh',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column',
        zIndex: isMobile ? 200 : 100,
        overflowY: 'auto', overflowX: 'hidden',
        transform: isMobile && !isOpen ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 250ms ease-out, width 250ms ease-out',
    };

    return (
        <>
            {/* Mobile backdrop */}
            {isMobile && isOpen && (
                <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 199 }} />
            )}

            <nav style={sidebarStyle}>
                {/* Logo */}
                <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: isCollapsed ? '0' : '0 20px', justifyContent: isCollapsed ? 'center' : 'flex-start', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                    {isCollapsed ? (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--color-base)', cursor: 'pointer' }} onClick={() => nav('home')}>N</div>
                    ) : (
                        <span onClick={() => nav('home')} style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--color-text-primary)', cursor: 'pointer' }}>NeoStrike</span>
                    )}
                </div>

                <AuthSection 
                    isCollapsed={isCollapsed}
                    isAuthenticated={isAuthenticated}
                    player={player}
                    onLogin={onLogin}
                    onLogout={onLogout}
                    onOpenWallet={onOpenWallet}
                    onNavigate={nav}
                />

                {/* Spin & Win */}
                <div style={{ paddingTop: 12, flexShrink: 0 }}>
                    <SpinWidget collapsed={isCollapsed} />
                </div>

                <Divider />

                {/* Primary Nav */}
                <NavItem icon={ICONS.home}        label="Home"        active={activePage==='home'}        onClick={() => nav('home')}        collapsed={isCollapsed} />
                <NavItem icon={ICONS.recent}      label="Recent"      active={activePage==='recent'}      onClick={() => nav('recent')}      collapsed={isCollapsed} />
                <NavItem icon={ICONS.favourites}  label="Favourites"  active={activePage==='favourites'}  onClick={() => nav('favourites')}  collapsed={isCollapsed} />

                <Divider />

                {/* Engagement Nav */}
                <NavItem icon={ICONS.tier}         label="Tier"           active={activePage==='tier'}         onClick={() => nav('tier')}         collapsed={isCollapsed} badge="#FFD700" />
                <NavItem icon={ICONS.refer}        label="Refer a Friend" active={activePage==='refer'}        onClick={() => nav('refer')}        collapsed={isCollapsed} />
                <NavItem icon={ICONS.achievements} label="Achievements"   active={activePage==='achievements'} onClick={() => nav('achievements')} collapsed={isCollapsed} />

                <Divider />

                {/* Game Categories */}
                <NavItem icon={ICONS.live}      label="Live Social Games" active={activePage==='live'}      onClick={() => nav('live')}      collapsed={isCollapsed} />
                <NavItem icon={ICONS.social}    label="Social Games"      active={activePage==='social'}    onClick={() => nav('social')}    collapsed={isCollapsed} />
                <NavItem icon={ICONS.table}     label="Table Games"       active={activePage==='table'}     onClick={() => nav('table')}     collapsed={isCollapsed} />
                <NavItem icon={ICONS.providers} label="Providers"         active={activePage==='providers'} onClick={() => nav('providers')} collapsed={isCollapsed} />
                <NavItem icon={ICONS.sports}    label="Sports"            active={activePage?.startsWith('sport')} onClick={() => nav('sport')} collapsed={isCollapsed} />

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                <Divider />

                {/* Footer */}
                <NavItem icon={ICONS.contact} label="Contact Us" active={false} onClick={() => {}} collapsed={isCollapsed} />
            </nav>

            <style>{`
                @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </>
    );
};
