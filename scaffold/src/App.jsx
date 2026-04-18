import React, { useState, useMemo } from 'react';
import { useSession, useBetSlip, NeoStrikeProvider } from '@neostrike/sdk';
import { GameLobby } from './components/GameLobby';
import { WalletDrawer } from './components/WalletDrawer';
import { Sidebar } from './components/Sidebar';
import { HeaderBar } from './components/HeaderBar';
import { FastTrackFeed } from './components/FastTrackFeed';
import { AlertModal } from './components/AlertModal';
import { SDKConsole } from './components/SDKConsole';
import { OfflineState, InstallPrompt } from '@neostrike/sdk';
import { SportsLobby, LeagueBrowser, EventList, EventPage, BetSlipDrawer, BetHistory } from './components/sportsbook';

function AppInner({ onLoginSuccess, onLogoutSuccess }) {
    const { player, login, isAuthenticated, logout } = useSession();
    const betSlip = useBetSlip();
    const { add } = betSlip;
    const [isWalletOpen, setWalletOpen] = useState(false);
    const [isBetSlipOpen, setBetSlipOpen] = useState(false);
    const [activePage, setActivePage] = useState('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    React.useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        const u = e.target.username.value;
        const t = e.target.token.value;
        try {
            await login(u, t);
            localStorage.setItem('ns_session_token', t);
            localStorage.setItem('ns_username', u);
            if (onLoginSuccess) onLoginSuccess(u, t);
        } catch (err) {
            console.error('Login failed', err);
        }
    };

    const handleLogout = () => {
        logout();
        localStorage.removeItem('ns_session_token');
        localStorage.removeItem('ns_username');
        if (onLogoutSuccess) onLogoutSuccess();
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-base)' }}>
            <OfflineState />
            <InstallPrompt />

            {/* Fixed Left Sidebar (F12-B) */}
            <Sidebar
                activePage={activePage}
                onNavigate={setActivePage}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                isAuthenticated={isAuthenticated}
                player={player}
                onLogin={handleLogin}
                onLogout={handleLogout}
                onOpenWallet={() => setWalletOpen(true)}
            />

            {/* Main Content Area */}
            <div className="f12-main" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Header Bar (F12-B) */}
                <HeaderBar
                    onOpenWallet={() => setWalletOpen(true)}
                    onLogin={handleLogin}
                    onLogout={handleLogout}
                    isMobile={isMobile}
                    onHamburger={() => setSidebarOpen(true)}
                    player={player}
                    isAuthenticated={isAuthenticated}
                />

                {/* Page Content */}
                <main style={{ flex: 1, padding: 'var(--space-xl)' }}>
                    {activePage === 'sport' && <SportsLobby onNavigate={setActivePage} />}
                    {activePage?.startsWith('sport-leagues-') && (
                        <LeagueBrowser sportSlug={activePage.replace('sport-leagues-', '')} onNavigate={setActivePage} />
                    )}
                    {activePage?.startsWith('sport-events-') && (
                        <EventList league={activePage.replace('sport-events-', '')} onNavigate={setActivePage}
                            onAddToBetSlip={(sel) => { add(sel); setBetSlipOpen(true); }} />
                    )}
                    {activePage?.startsWith('sport-event-') && (
                        <EventPage eventId={parseInt(activePage.replace('sport-event-', ''))} onNavigate={setActivePage}
                            onAddToBetSlip={(sel) => { add(sel); setBetSlipOpen(true); }} />
                    )}
                    {activePage === 'sport-my-bets' && <BetHistory />}
                    {!activePage?.startsWith('sport') && (
                        <GameLobby activePage={activePage} onNavigate={setActivePage} />
                    )}
                </main>
            </div>

            <WalletDrawer isOpen={isWalletOpen} onClose={() => setWalletOpen(false)} player={player} />
            <BetSlipDrawer isOpen={isBetSlipOpen} onClose={() => setBetSlipOpen(false)} onOpenCashier={() => setWalletOpen(true)} player={player} betSlip={betSlip} />
            <AlertModal />
            <SDKConsole />
            <FastTrackFeed />
        </div>
    );
}

function App() {
    const [token, setToken] = useState(localStorage.getItem('ns_session_token') || '');
    const [username, setUsername] = useState(localStorage.getItem('ns_username') || '');

    const config = useMemo(() => ({
        apiUrl: import.meta.env.VITE_NEOSTRIKE_API_URL,
        token,
        username,
        brandId: '1'
    }), [token, username]);

    return (
        <NeoStrikeProvider config={config}>
            <AppInner 
                onLoginSuccess={(u, t) => { setUsername(u); setToken(t); }} 
                onLogoutSuccess={() => { setUsername(''); setToken(''); }} 
            />
        </NeoStrikeProvider>
    );
}

export default App;
