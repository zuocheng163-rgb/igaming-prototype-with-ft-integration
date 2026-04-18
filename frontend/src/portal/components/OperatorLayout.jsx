import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Users,
    Wallet,
    Gamepad2,
    ShieldAlert,
    Settings,
    Bell,
    Search,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Command,
    Activity,
    Download,
    Globe,
    Megaphone,
    FileText,
    Network,
    Award,
    Trophy
} from 'lucide-react';
import SearchOverlay from './SearchOverlay';
import NotificationCenter from './NotificationCenter';
import PlayerDetailsModal from './PlayerDetailsModal';

const OperatorLayout = ({ children, user, token, onLogout, dateRange, setDateRange, productOffering }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const navItems = [
        { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
        { icon: Users, label: 'Players', id: 'players' },
        { icon: Wallet, label: 'Wallet', id: 'wallet' },
        { icon: Bell, label: 'Bonuses', id: 'bonuses', isAdvanced: true },
        { icon: Gamepad2, label: 'Games', id: 'games', isAdvanced: true },
        { icon: Trophy, label: 'Sports', id: 'sportsbook', path: '/portal/sportsbook' },
        { icon: ShieldAlert, label: 'Compliance', id: 'compliance' },
        // Phase 1
        { icon: Download, label: 'Reports', id: 'reports', path: '/portal/reports' },
        // Phase 2
        { icon: Megaphone, label: 'Affiliates', id: 'affiliates', path: '/portal/marketing/affiliates' },
        { icon: FileText, label: 'CMS', id: 'cms', path: '/portal/marketing/cms' },
        // Phase 4
        { icon: Network, label: 'Fraud Feed', id: 'fraud-feed', path: '/portal/fraud/feed' },
        { icon: ShieldAlert, label: 'ATO Alerts', id: 'ato', path: '/portal/fraud/ato' },
        { icon: Award, label: 'Bonus Abuse', id: 'bonus-abuse', path: '/portal/fraud/bonus-abuse' },
        { icon: Activity, label: 'AFA Monitor', id: 'afa', path: '/portal/afa' },
        { icon: Activity, label: 'Operational Stream', id: 'operational-stream' },
        { icon: Activity, label: 'AFA Monitor', id: 'afa' },
        { icon: Settings, label: 'Settings', id: 'settings' },
    ];

    const filteredNavItems = navItems.filter(item =>
        !item.isAdvanced || productOffering === 'ADVANCED'
    );

    const handleNavigation = (path) => {
        window.history.pushState({}, '', path);
        const navEvent = new PopStateEvent('popstate');
        window.dispatchEvent(navEvent);
        if (window.innerWidth < 1024) {
            setIsSidebarCollapsed(true);
        }
    };

    return (
        <div className="operator-portal-root">
            {/* Floating Global Header */}
            <header className="portal-header glass-panel floating">
                <div className="header-left">
                    <div className="omnisearch-wrapper" onClick={() => setIsSearchOpen(true)}>
                        <Search className="search-icon" size={18} />
                        <span className="search-placeholder">Quick Search...</span>
                        <div className="shortcut">
                            <Command size={10} />
                            <span>K</span>
                        </div>
                    </div>
                </div>

                <div className="header-right">
                    <div className="date-selector-container">
                        <div className="date-selector glass-panel" onClick={(e) => { e.stopPropagation(); setIsDateSelectorOpen(!isDateSelectorOpen); }}>
                            <Calendar size={16} />
                            <span>{dateRange}</span>
                        </div>
                        {isDateSelectorOpen && (
                            <div className="date-dropdown glass-panel">
                                {['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'This Month'].map(range => (
                                    <div
                                        key={range}
                                        className={`date-item ${dateRange === range ? 'active' : ''}`}
                                        onClick={() => { setDateRange(range); setIsDateSelectorOpen(false); }}
                                    >
                                        {range}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <NotificationCenter token={token} username={user?.username} />

                    <div className="user-profile" onClick={onLogout}>
                        <div className="user-info">
                            <span className="user-name">{user?.username || 'Operator'}</span>
                            <span className="user-role">Administrator</span>
                        </div>
                        <div className="avatar">OP</div>
                    </div>
                </div>
            </header>

            <SearchOverlay
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                token={token}
                onPlayerSelect={(id) => {
                    setSelectedPlayerId(id);
                    setIsSearchOpen(false);
                }}
            />

            <div className="portal-container">
                {/* Persistent Left Sidebar */}
                <aside className={`portal-sidebar glass-panel ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                    <div className="sidebar-header">
                        <h1 className="logo-text">NS.<span>Portal</span></h1>
                        <button
                            className="collapse-btn"
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        >
                            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                        </button>
                    </div>

                    <nav className="sidebar-nav">
                        {filteredNavItems.map((item) => {
                            const itemPath = item.path || (item.id === 'dashboard' ? '/portal' : `/portal/${item.id}`);
                            const isActive = window.location.pathname === itemPath || window.location.pathname.startsWith(itemPath + '/');
                            return (
                                <div
                                    key={item.id}
                                    className={`nav-item ${isActive ? 'active' : ''}`}
                                    onClick={() => handleNavigation(itemPath)}
                                >
                                    <item.icon className="nav-icon" size={20} style={{ color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)' }} />
                                    {!isSidebarCollapsed && <span className="nav-label" style={{ color: isActive ? 'white' : 'var(--text-muted)' }}>{item.label}</span>}
                                </div>
                            );
                        })}
                    </nav>

                    <div className="sidebar-footer">
                        {!isSidebarCollapsed && (
                            <div className="system-status">
                                <div className="status-dot online"></div>
                                <span>System Online</span>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="portal-main">
                    <div className="content-breadcrumbs">
                        <span>{filteredNavItems.find(i => window.location.pathname.includes(i.id))?.label || 'Dashboard'}</span>
                    </div>
                    {children}
                </main>
            </div>

            {selectedPlayerId && (
                <PlayerDetailsModal
                    userId={selectedPlayerId}
                    token={token}
                    onClose={() => setSelectedPlayerId(null)}
                />
            )}
        </div>
    );
};

export default OperatorLayout;
