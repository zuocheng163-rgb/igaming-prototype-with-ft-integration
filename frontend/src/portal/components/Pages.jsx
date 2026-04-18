import React, { useState, useEffect } from 'react';
import DataTable from './DataTable';
import { Save, RefreshCw, Shield, Bell, Lock, Gamepad2, Filter, X, Plus, Trash2, Edit, Users, BarChart2, Settings as SettingsIcon, AlertCircle, CheckCircle, Calendar, ChevronRight, ChevronLeft, Search, Award, History, TrendingUp, DollarSign } from 'lucide-react';
import PlayerDetailsModal from './PlayerDetailsModal';
import AgentTokensPanel from './AgentTokensPanel';
import IntegrationsPanel from './IntegrationsPanel';
import AfaMonitor from './AfaMonitor';

// Shared per-game visual identity used in Game Management cards
const GAME_THEMES = {
    'evolution:lightning-roulette': { emoji: '🎡', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #b8860b 100%)' },
    'evolution:crazy-time': { emoji: '🎪', gradient: 'linear-gradient(135deg, #6a0dad 0%, #c70039 60%, #ff5733 100%)' },
    'pragmatic:gates-of-olympus': { emoji: '🏛️', gradient: 'linear-gradient(135deg, #0f3460 0%, #533483 60%, #e94560 100%)' },
    'pragmatic:sweet-bonanza': { emoji: '🍭', gradient: 'linear-gradient(135deg, #c0392b 0%, #e67e22 60%, #f1c40f 100%)' },
    'pragmatic:wolf-gold': { emoji: '🐺', gradient: 'linear-gradient(135deg, #0d0d0d 0%, #1c1c3a 60%, #b8860b 100%)' },
    'netent:starburst': { emoji: '💎', gradient: 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 60%, #00c6ff 100%)' },
    'netent:gonzos-quest': { emoji: '🌴', gradient: 'linear-gradient(135deg, #134e5e 0%, #11998e 60%, #b8860b 100%)' },
    'netent:divine-fortune': { emoji: '🐴', gradient: 'linear-gradient(135deg, #8B0000 0%, #4b134f 60%, #b8860b 100%)' },
};

export const Players = ({ user, token }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [config, setConfig] = useState(null);

    // Filter states
    const [filters, setFilters] = useState({
        country: '',
        username: '',
        email: '',
        balance: '',
        last_login: ''
    });

    const fetchData = (page = 1, appliedFilters = {}) => {
        setLoading(true);
        fetch('/api/operator/players/filter', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'x-username': user?.username,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...appliedFilters,
                page,
                limit: 10
            })
        })
            .then(res => res.json())
            .then(result => {
                const players = result.players || [];
                const enriched = players.map(p => ({
                    ...p,
                    balance: p.balance || 0,
                    status: 'Active'
                }));
                setData(enriched);
                setPagination({
                    page: result.currentPage || 1,
                    totalPages: result.totalPages || 1,
                    total: result.total || 0
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        // Fetch global config to respect GAMSTOP/Tier toggles on UI
        fetch('/api/operator/config/doc', {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => setConfig(data))
        .catch(() => {});

        // Load persisted filters from sessionStorage
        const savedFilters = sessionStorage.getItem('playerFilters');
        if (savedFilters) {
            const parsed = JSON.parse(savedFilters);
            setFilters(parsed);
            fetchData(1, parsed);
        } else {
            fetchData();
        }
    }, [token]);

    const handleRefresh = async () => {
        setRefreshing(true);
        fetchData(pagination.page, filters);
        setTimeout(() => setRefreshing(false), 500);
    };

    const handleFilter = () => {
        // Save filters to sessionStorage
        sessionStorage.setItem('playerFilters', JSON.stringify(filters));
        fetchData(1, filters);
    };

    const handlePageChange = (newPage) => {
        fetchData(newPage, filters);
    };

    const handleRowDoubleClick = (row) => {
        if (row && row.user_id) {
            setSelectedPlayer(row.user_id);
        }
    };

    const showGamstop = config?.gamstop_enabled === true;
    const showRisk = config?.product_tier === 'ADVANCED';

    const baseColumns = [
        { header: 'Country', accessor: 'country' },
        { header: 'Username', accessor: 'username' },
        { header: 'Email', accessor: 'email' },
        { header: 'Balance', accessor: 'balance', render: row => `€${(row.balance || 0).toFixed(2)}` },
    ];

    if (showGamstop || showRisk) {
        baseColumns.push({
            header: showGamstop && showRisk ? 'GAMSTOP & Risk' : (showGamstop ? 'GAMSTOP Status' : 'Risk Status'),
            accessor: 'risk',
            render: row => {
                const badges = [];
                if (showGamstop && row.gamstop_blocked) badges.push(<span key="g" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', background: 'rgba(255, 68, 68, 0.2)', color: '#ff4444', marginRight: '4px' }}>GAMSTOP EXCLUDED</span>);
                if (showRisk && row.bonus_suppressed) badges.push(<span key="b" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', background: 'rgba(255, 153, 0, 0.2)', color: '#ff9900' }}>BONUS SUPPRESSED</span>);
                
                if (badges.length > 0) return <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{badges}</div>;
                return <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>CLEAR</span>;
            }
        });
    }

    const columns = [
        ...baseColumns,
        {
            header: 'Status', accessor: 'status', render: row => (
                <span style={{
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                    background: row.status === 'Active' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 0, 0.1)',
                    color: row.status === 'Active' ? '#00ff88' : '#ffd700'
                }}>
                    {row.status}
                </span>
            )
        },
        { header: 'Last Login', accessor: 'last_login', render: row => row.last_login ? new Date(row.last_login).toLocaleString() : 'Never' }
    ];

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Player Management</h2>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
                    <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Filter Row */}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Country</label>
                        <input
                            type="text"
                            placeholder="e.g. MT"
                            value={filters.country}
                            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Username</label>
                        <input
                            type="text"
                            placeholder="e.g. john"
                            value={filters.username}
                            onChange={(e) => setFilters({ ...filters, username: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Email</label>
                        <input
                            type="text"
                            placeholder="e.g. @gmail.com"
                            value={filters.email}
                            onChange={(e) => setFilters({ ...filters, email: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Balance</label>
                        <input
                            type="text"
                            placeholder=">= 100"
                            value={filters.balance}
                            onChange={(e) => setFilters({ ...filters, balance: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Last Login</label>
                        <input
                            type="text"
                            placeholder="> 02/15/2026"
                            value={filters.last_login}
                            onChange={(e) => setFilters({ ...filters, last_login: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleFilter}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', height: '38px' }}
                    >
                        <Filter size={16} />
                        Filter
                    </button>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Tip: Use operators like &gt;, &gt;=, =, &lt;, &lt;= for Balance and Last Login (e.g., "&gt;= 100" or "&gt; 02/15/2026")
                </div>
            </div>

            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                pagination={pagination}
                onPageChange={handlePageChange}
                searchPlaceholder="Search players..."
                onRowDoubleClick={handleRowDoubleClick}
            />
            {selectedPlayer && (
                <PlayerDetailsModal
                    userId={selectedPlayer}
                    token={token}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
        </div>
    );
};

export const Wallet = ({ user, token }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

    // Filter states
    const [filters, setFilters] = useState({
        transaction_id: '',
        user: '',
        type: '',
        amount: '',
        date: '',
        status: ''
    });

    const fetchData = (page = 1, appliedFilters = {}) => {
        setLoading(true);
        fetch('/api/operator/transactions/filter', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'x-username': user?.username,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...appliedFilters,
                page,
                limit: 10
            })
        })
            .then(res => res.json())
            .then(result => {
                const txs = result.transactions || [];
                setData(txs.map(tx => ({
                    ...tx,
                    transaction_id: tx.transaction_id,
                    type: tx.type || 'TRANSACTION',
                    amount: tx.amount || 0,
                    status: tx.status || 'Success',
                    date: tx.created_at || tx.timestamp || new Date().toISOString()
                })));
                setPagination({
                    page: result.currentPage || 1,
                    totalPages: result.totalPages || 1,
                    total: result.total || 0
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const defaultFilters = { transaction_id: '', user: '', type: '', amount: '', date: '', status: '' };

    useEffect(() => {
        // Load persisted filters from sessionStorage; always merge with defaults to
        // avoid controlled→uncontrolled warnings when a partial filter object is stored.
        const savedFilters = sessionStorage.getItem('transactionFilters');
        if (savedFilters) {
            try {
                const parsed = JSON.parse(savedFilters);
                // 'GGR' is a derived metric, not a real transaction type — clear it
                // so the wallet page shows all transactions for that date range instead.
                if (parsed.type === 'GGR') parsed.type = '';
                const merged = { ...defaultFilters, ...parsed };
                setFilters(merged);
                fetchData(1, merged);
            } catch (_) {
                fetchData();
            }
        } else {
            fetchData();
        }
    }, [token]);

    const handleRefresh = async () => {
        setRefreshing(true);
        fetchData(pagination.page, filters);
        setTimeout(() => setRefreshing(false), 500);
    };

    const handleFilter = () => {
        // Save filters to sessionStorage
        sessionStorage.setItem('transactionFilters', JSON.stringify(filters));
        fetchData(1, filters);
    };

    const handlePageChange = (newPage) => {
        fetchData(newPage, filters);
    };

    const columns = [
        { header: 'Transaction ID', accessor: 'transaction_id' },
        { header: 'User', accessor: 'user' },
        { header: 'Type', accessor: 'type' },
        {
            header: 'Amount', accessor: 'amount', render: row => (
                <span style={{ color: row.amount > 0 ? '#00ff88' : '#ff4d4d' }}>
                    {row.amount > 0 ? '+' : ''}€{row.amount}
                </span>
            )
        },
        { header: 'Status', accessor: 'status' },
        { header: 'Date', accessor: 'date', render: row => new Date(row.date).toLocaleString() }
    ];

    // Detect if we were navigated here from the GGR KPI card (stored before type was cleared)
    const [isGgrView] = useState(() => {
        try {
            const saved = sessionStorage.getItem('transactionFilters');
            return saved ? JSON.parse(saved)?.type === 'GGR' : false;
        } catch (_) { return false; }
    });

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Wallet Transactions</h2>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
                    <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* GGR context banner — shown when navigated from the dashboard GGR KPI */}
            {isGgrView && (
                <div style={{ background: 'rgba(0,204,255,0.06)', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#aaa', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#00ccff', fontWeight: '600' }}>ℹ GGR note:</span>
                    Dashboard GGR is computed as <em style={{ color: '#fff', marginLeft: 4, marginRight: 4 }}>total debits − total credits</em> from wallet audit logs (all game rounds). The transactions shown here are individual ledger records; their net sum for the selected period equals the GGR figure on the dashboard.
                </div>
            )}

            {/* Filter Row */}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Transaction ID</label>
                        <input
                            type="text"
                            placeholder="e.g. TX123"
                            value={filters.transaction_id}
                            onChange={(e) => setFilters({ ...filters, transaction_id: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>User</label>
                        <input
                            type="text"
                            placeholder="e.g. john"
                            value={filters.user}
                            onChange={(e) => setFilters({ ...filters, user: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Type</label>
                        <input
                            type="text"
                            placeholder="e.g. DEPOSIT"
                            value={filters.type}
                            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Amount</label>
                        <input
                            type="text"
                            placeholder=">= 50"
                            value={filters.amount}
                            onChange={(e) => setFilters({ ...filters, amount: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date</label>
                        <input
                            type="text"
                            placeholder="> 02/15/2026"
                            value={filters.date}
                            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status</label>
                        <input
                            type="text"
                            placeholder="e.g. success"
                            value={filters.status || ''}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleFilter}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', height: '38px' }}
                    >
                        <Filter size={16} />
                        Filter
                    </button>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Tip: Use operators like &gt;, &gt;=, =, &lt;, &lt;= for Amount and Date (e.g., "&gt;= 50" or "&gt; 02/15/2026, 10:00:00")
                </div>
            </div>

            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                pagination={pagination}
                onPageChange={handlePageChange}
                searchPlaceholder="Search transactions..."
            />
        </div >
    );
};

export const Games = ({ token }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = () => {
        setLoading(true);
        fetch('/api/v1/games/admin/catalog', {
            headers: {
                Authorization: `Bearer ${token}`,
                'x-brand-id': '1'
            }
        })
            .then(res => res.json())
            .then(games => {
                setData(games || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (token) fetchData();
    }, [token]);

    const handleToggle = async (gameId, currentState) => {
        try {
            const response = await fetch('/api/v1/games/admin/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'x-brand-id': '1'
                },
                body: JSON.stringify({ game_id: gameId, enabled: !currentState })
            });

            if (response.ok) {
                setData(prev => prev.map(g => g.id === gameId ? { ...g, enabled: !currentState } : g));
            }
        } catch (err) {
            console.error('Failed to toggle game', err);
        }
    };

    const handleSync = async () => {
        setRefreshing(true);
        try {
            await fetch('/api/v1/games/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'x-brand-id': '1' }
            });
            fetchData();
        } catch (err) {
            console.error('Sync failed', err);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Game Management</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleSync} disabled={refreshing} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
                        <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshing ? 'Syncing...' : 'Force Provider Sync'}
                    </button>
                    <button onClick={fetchData} className="btn-secondary" style={{ padding: '8px 16px' }}>Refresh List</button>
                </div>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-muted)' }}>Loading catalog...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                    {data.map(game => (
                        <div key={game.id} className="glass-panel" style={{
                            padding: '20px',
                            textAlign: 'center',
                            border: game.enabled ? '1px solid rgba(0, 204, 255, 0.3)' : '1px solid transparent',
                            opacity: game.enabled ? 1 : 0.6,
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{
                                width: '100%',
                                height: '120px',
                                background: GAME_THEMES[game.id]?.gradient || (game.category === 'live-casino'
                                    ? 'linear-gradient(135deg, #0f3460 0%, #16213e 100%)'
                                    : 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)'),
                                borderRadius: '8px',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '3rem',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {GAME_THEMES[game.id]?.emoji || '🎮'}
                                {game.rtp && (
                                    <span style={{
                                        position: 'absolute', top: '6px', right: '8px',
                                        fontSize: '0.65rem', background: 'rgba(0,0,0,0.5)',
                                        color: '#00ff88', padding: '2px 6px', borderRadius: '10px', fontWeight: 700
                                    }}>
                                        RTP {game.rtp}%
                                    </span>
                                )}
                            </div>
                            <h4 style={{ margin: '0 0 4px 0' }}>{game.name}</h4>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{game.provider}</div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                                <span style={{ fontSize: '0.75rem', color: game.enabled ? '#00ff88' : 'var(--text-muted)', fontWeight: 'bold' }}>
                                    {game.enabled ? 'ACTIVE' : 'DISABLED'}
                                </span>
                                <button
                                    onClick={() => handleToggle(game.id, game.enabled)}
                                    className={game.enabled ? "btn-secondary" : "btn-primary"}
                                    style={{ padding: '6px 12px', fontSize: '0.75rem', width: '80px' }}
                                >
                                    {game.enabled ? 'DISABLE' : 'ENABLE'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const Compliance = ({ user, token }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filters, setFilters] = useState({ id: '' });
    const [selectedAlert, setSelectedAlert] = useState(null);

    const fetchData = (appliedFilters = {}) => {
        setLoading(true);
        // Build query params for filtering
        const params = new URLSearchParams();
        if (appliedFilters.id) params.append('id', appliedFilters.id);
        if (appliedFilters.date) params.append('date', appliedFilters.date);

        fetch(`/api/operator/compliance/alerts?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'x-username': user?.username
            }
        })
            .then(res => res.json())
            .then(alerts => {
                const list = alerts || [];
                // Locally filter by ID if needed, but date is now handled by backend
                const filtered = appliedFilters.id ? list.filter(a => a.id === appliedFilters.id) : list;
                setData(filtered);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (!token) return;

        const loadFilters = () => {
            const savedFilters = sessionStorage.getItem('complianceFilters');
            if (savedFilters) {
                const parsed = JSON.parse(savedFilters);
                setFilters(parsed);
                fetchData(parsed);
            } else {
                setFilters({ id: '' });
                fetchData({});
            }
        };

        // Initial load
        loadFilters();

        // Listen for navigation events (like from Notification Center)
        window.addEventListener('complianceFilterUpdated', loadFilters);
        window.addEventListener('popstate', loadFilters);

        return () => {
            window.removeEventListener('complianceFilterUpdated', loadFilters);
            window.removeEventListener('popstate', loadFilters);
        };
    }, [token]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData(filters);
        setTimeout(() => setRefreshing(false), 500);
    };

    const clearFilters = () => {
        setFilters({ id: '' });
        sessionStorage.removeItem('complianceFilters');
        fetchData({});
        // Notify other windows/components if needed
        window.dispatchEvent(new CustomEvent('complianceFilterUpdated'));
    };

    const columns = [
        { header: 'Alert ID', accessor: 'id' },
        { header: 'User', accessor: 'user' },
        { header: 'Trigger', accessor: 'trigger' },
        {
            header: 'Risk Level', accessor: 'risk', render: row => (
                <span style={{
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                    background: row.risk === 'High' ? 'rgba(255, 77, 77, 0.2)' : row.risk === 'Medium' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255, 215, 0, 0.2)',
                    color: row.risk === 'High' ? '#ff4d4d' : row.risk === 'Medium' ? '#ffa500' : '#ffd700'
                }}>
                    {row.risk}
                </span>
            )
        },
        { header: 'Status', accessor: 'status' },
        { header: 'Date', accessor: 'date', render: row => new Date(row.date).toLocaleString() },
        { header: 'Message', accessor: 'message' }
    ];

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 className="page-title" style={{ margin: 0 }}>Compliance & Risk</h2>
                </div>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
                    <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Filter Row */}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Alert ID</label>
                        <input
                            type="text"
                            placeholder="Search ID..."
                            value={filters.id || ''}
                            onChange={(e) => setFilters({ ...filters, id: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date</label>
                        <input
                            type="text"
                            placeholder="> 02/15/2026"
                            value={filters.date || ''}
                            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => {
                                sessionStorage.setItem('complianceFilters', JSON.stringify(filters));
                                fetchData(filters);
                            }}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', height: '38px' }}
                        >
                            <Filter size={16} />
                            Filter
                        </button>
                        {(filters.id || filters.date) && (
                            <button
                                onClick={clearFilters}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', height: '38px' }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                pagination={{ page: 1, totalPages: 1 }}
                searchPlaceholder="Search alerts..."
                onRowDoubleClick={(row) => setSelectedAlert(row)}
            />

            {selectedAlert && (
                <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-prominent" onClick={() => setSelectedAlert(null)}>
                            <X size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <Bell className={selectedAlert.risk === 'High' ? 'text-danger' : 'text-warning'} size={24} />
                            <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'white' }}>Alert Investigation</h2>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Event Message</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: '500', color: 'white', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedAlert.message}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Timestamp</label>
                                    <div style={{ color: 'white' }}>{new Date(selectedAlert.date || selectedAlert.created_at).toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>User</label>
                                    <div style={{ color: 'white', fontFamily: 'monospace' }}>{selectedAlert.user || 'System'}</div>
                                </div>
                            </div>

                            {selectedAlert.metadata && (
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Metadata / Raw Evidence</label>
                                    <pre style={{
                                        margin: 0,
                                        padding: '12px',
                                        background: '#111',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        color: '#ffd700',
                                        overflow: 'auto',
                                        maxHeight: '200px',
                                        border: '1px solid rgba(255, 215, 0, 0.1)',
                                        whiteSpace: 'pre-wrap !important',
                                        wordBreak: 'break-all !important',
                                        overflowWrap: 'anywhere !important'
                                    }}>
                                        {JSON.stringify(selectedAlert.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button className="btn-primary" style={{ flex: 1 }} onClick={() => setSelectedAlert(null)}>
                                Close Investigation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const Settings = ({ token, productOffering }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [apiKey, setApiKey] = useState('FETCHING...');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [docConfig, setDocConfig] = useState({
        product_tier: 'basic',
        gamstop_enabled: false,
        is_gamstop_key_set: false,
        affordability_threshold: 1000,
        velocity_spike_count: 5,
        rapid_escalation_pct: 100,
        session_limit_minutes: 60
    });

    useEffect(() => {
        if (!token) return;

        // Fetch API Key
        fetch('/api/operator/config', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(config => {
                const key = config?.ft_api_key || config?.config?.operator_api_key;
                if (key) setApiKey(key);
                else setApiKey('NONE SET');
            })
            .catch(err => {
                console.error('Failed to fetch config', err);
                setApiKey('ERROR LOADING');
            });

        // Fetch DoC Config
        fetch('/api/operator/config/doc', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(config => {
                if (config) setDocConfig(config);
            })
            .catch(err => console.error('Failed to fetch DoC config', err));
    }, [token]);

    const handleSaveDoC = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/operator/config/doc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(docConfig)
            });

            if (response.ok) {
                alert('Duty of Care configuration updated successfully');
            } else {
                throw new Error('Failed to update DoC config');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRegenerateKey = async () => {
        setIsRegenerating(true);
        try {
            const newKey = `sk_op_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
            const response = await fetch('/api/operator/config/api-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ api_key: newKey })
            });

            if (response.ok) {
                setApiKey(newKey);
                alert('API Key regenerated successfully. Please update your environment variables if needed.');
            } else {
                throw new Error('Failed to update API key');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setIsRegenerating(false);
        }
    };

    return (
        <div className="page-container" style={{ padding: '24px', maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Platform Settings</h2>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button 
                        onClick={() => setActiveTab('general')}
                        style={{ 
                            padding: '6px 16px', borderRadius: '4px', border: 'none', fontSize: '0.85rem', cursor: 'pointer',
                            background: activeTab === 'general' ? 'rgba(0,204,255,0.2)' : 'transparent',
                            color: activeTab === 'general' ? '#00ccff' : 'var(--text-muted)',
                            fontWeight: activeTab === 'general' ? 600 : 400,
                            transition: 'all 0.2s'
                        }}
                    >
                        General
                    </button>
                    <button 
                        onClick={() => setActiveTab('agents')}
                        style={{ 
                            padding: '6px 16px', borderRadius: '4px', border: 'none', fontSize: '0.85rem', cursor: 'pointer',
                            background: activeTab === 'agents' ? 'rgba(0,204,255,0.2)' : 'transparent',
                            color: activeTab === 'agents' ? '#00ccff' : 'var(--text-muted)',
                            fontWeight: activeTab === 'agents' ? 600 : 400,
                            transition: 'all 0.2s'
                        }}
                    >
                        Agent Tokens
                    </button>
                    <button 
                        onClick={() => setActiveTab('integrations')}
                        style={{ 
                            padding: '6px 16px', borderRadius: '4px', border: 'none', fontSize: '0.85rem', cursor: 'pointer',
                            background: activeTab === 'integrations' ? 'rgba(0,204,255,0.2)' : 'transparent',
                            color: activeTab === 'integrations' ? '#00ccff' : 'var(--text-muted)',
                            fontWeight: activeTab === 'integrations' ? 600 : 400,
                            transition: 'all 0.2s'
                        }}
                    >
                        Integrations
                    </button>
                </div>
            </div>

            {activeTab === 'agents' ? (
                <AgentTokensPanel token={token} />
            ) : activeTab === 'integrations' ? (
                <IntegrationsPanel token={token} />
            ) : (
                <>

            <section className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#00ccff' }}>
                    <Lock size={20} />
                    <h3>Security Policy</h3>
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Session Timeout (minutes)</label>
                    <input type="number" defaultValue={30} className="input-field" style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
                </div>

                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Operator API Key (X-API-Key)</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input
                            type="text"
                            readOnly
                            value={apiKey}
                            style={{ flex: 1, padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#00ff88', fontFamily: 'monospace' }}
                        />
                        <button
                            onClick={handleRegenerateKey}
                            disabled={isRegenerating}
                            className="btn-primary"
                            style={{ padding: '0 15px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                        >
                            {isRegenerating ? 'REGENERATING...' : 'REGENERATE'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#ff4444' }}>
                    <Shield size={20} />
                    <h3>Auto Duty of Care (Rule-Based)</h3>
                </div>

                <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Product Offering Tier</label>
                        <select
                            value={docConfig.product_tier}
                            onChange={(e) => setDocConfig({ ...docConfig, product_tier: e.target.value })}
                            className="input-field"
                            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        >
                            <option value="basic">BASIC (Tier 1 Compliance)</option>
                            {productOffering === 'ADVANCED' && <option value="advanced">ADVANCED (Full Duty of Care)</option>}
                        </select>
                        <div style={{ fontSize: '0.75rem', color: docConfig.product_tier === 'basic' ? '#ffd700' : 'var(--text-muted)', marginTop: '6px' }}>
                            {docConfig.product_tier === 'basic' 
                                ? 'Basic tier focuses on player-controlled limits and statutory exclusions.' 
                                : 'Advanced tier enables behavioral monitoring, risk scoring, and longitudinal analysis.'}
                        </div>
                    </div>

                    {productOffering === 'ADVANCED' && (
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
                                GAMSTOP Integration
                                {docConfig.is_gamstop_mock_mode && (
                                    <span style={{ marginLeft: '8px', padding: '2px 6px', background: 'rgba(0,183,255,0.2)', border: '1px solid rgba(0,183,255,0.3)', borderRadius: '4px', fontSize: '0.65rem', color: '#00b7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Simulator Active
                                    </span>
                                )}
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '42px' }}>
                                <input
                                    type="checkbox"
                                    id="gamstop_enable"
                                    checked={docConfig.gamstop_enabled}
                                    disabled={!docConfig.is_gamstop_key_set && !docConfig.is_gamstop_mock_mode}
                                    onChange={(e) => setDocConfig({ ...docConfig, gamstop_enabled: e.target.checked })}
                                    style={{ width: '20px', height: '20px', cursor: (docConfig.is_gamstop_key_set || docConfig.is_gamstop_mock_mode) ? 'pointer' : 'not-allowed' }}
                                />
                                <label htmlFor="gamstop_enable" style={{ color: (docConfig.is_gamstop_key_set || docConfig.is_gamstop_mock_mode) ? 'white' : 'var(--text-muted)' }}>
                                    Enable UK GAMSTOP Checks
                                </label>
                            </div>
                            {(!docConfig.is_gamstop_key_set && !docConfig.is_gamstop_mock_mode) && (
                                <div style={{ fontSize: '0.7rem', color: '#ff4444', marginTop: '4px' }}>
                                    <AlertCircle size={10} style={{ display: 'inline', marginRight: '4px' }} />
                                    Missing GAMSTOP_API_KEY in backend environment.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Affordability Threshold (EUR)</label>
                        <input
                            type="number"
                            value={docConfig.affordability_threshold}
                            onChange={(e) => setDocConfig({ ...docConfig, affordability_threshold: parseInt(e.target.value) })}
                            className="input-field"
                            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        />
                    </div>
                    <div className="form-group" style={{ opacity: docConfig.product_tier === 'basic' ? 0.4 : 1 }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
                            Velocity Spike (Bets/Min) {docConfig.product_tier === 'basic' && <span style={{fontSize: '0.7rem'}}>(ADVANCED ONLY)</span>}
                        </label>
                        <input
                            type="number"
                            disabled={docConfig.product_tier === 'basic'}
                            value={docConfig.velocity_spike_count}
                            onChange={(e) => setDocConfig({ ...docConfig, velocity_spike_count: parseInt(e.target.value) })}
                            className="input-field"
                            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        />
                    </div>
                    <div className="form-group" style={{ opacity: docConfig.product_tier === 'basic' ? 0.4 : 1 }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
                            Rapid Escalation (% increase) {docConfig.product_tier === 'basic' && <span style={{fontSize: '0.7rem'}}>(ADVANCED ONLY)</span>}
                        </label>
                        <input
                            type="number"
                            disabled={docConfig.product_tier === 'basic'}
                            value={docConfig.rapid_escalation_pct}
                            onChange={(e) => setDocConfig({ ...docConfig, rapid_escalation_pct: parseInt(e.target.value) })}
                            className="input-field"
                            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        />
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Session Limit (Minutes)</label>
                        <input
                            type="number"
                            value={docConfig.session_limit_minutes}
                            onChange={(e) => setDocConfig({ ...docConfig, session_limit_minutes: parseInt(e.target.value) })}
                            className="input-field"
                            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        />
                    </div>
                </div>

                <div style={{ marginTop: '20px', fontSize: '0.85rem', color: 'var(--text-muted)', padding: '12px', background: 'rgba(255,68,68,0.05)', borderRadius: '8px', borderLeft: '3px solid #ff4444' }}>
                    <strong>Regulatory Compliance:</strong> These rules trigger automated interventions (Reality Checks) and notify the CRM immediately upon detection.
                </div>

                <button
                    onClick={handleSaveDoC}
                    disabled={isSaving}
                    className="btn-primary"
                    style={{ marginTop: '20px', padding: '10px 20px', fontSize: '0.9rem' }}
                >
                    {isSaving ? 'SAVING...' : 'SAVE DOC CONFIG'}
                </button>
            </section>

            <section className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#ffd700' }}>
                    <Bell size={20} />
                    <h3>Notification Preferences</h3>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <input type="checkbox" defaultChecked id="email_notif" style={{ width: '16px', height: '16px' }} />
                    <label htmlFor="email_notif" style={{ color: 'var(--text-primary)' }}>Email Alerts for Critical Events</label>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="checkbox" id="slack_notif" style={{ width: '16px', height: '16px' }} />
                    <label htmlFor="slack_notif" style={{ color: 'var(--text-primary)' }}>Slack Integration</label>
                </div>
            </section>

            <button
                onClick={() => alert('Settings saved successfully')}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
            >
                <Save size={18} />
                Save Changes
            </button>
                </>
            )}
        </div>
    );
};

// --- Bonus Management Sub-components ---

const BonusWizard = ({ isOpen, onClose, onSave, token, initialData }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        bonus_code: '',
        type: 'deposit_match',
        description: '',
        max_amount: 100,
        match_percentage: 100,
        wagering_req: 35,
        wagering_type: 'both',
        min_deposit: 10,
        currency: 'EUR',
        expiry_days: 30,
        active: true,
        contribution_rates: { slots: 1.0, live: 0.1, table: 0.1, excluded: [] },
        eligibility_rules: { countries: [], segments: [] }
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    ...formData,
                    ...initialData,
                    contribution_rates: initialData.contribution_rates || { slots: 1.0, live: 0.1, table: 0.1, excluded: [] },
                    eligibility_rules: initialData.eligibility_rules || { countries: [], segments: [] }
                });
            } else {
                setFormData({
                    name: '',
                    bonus_code: '',
                    type: 'deposit_match',
                    description: '',
                    max_amount: 100,
                    match_percentage: 100,
                    wagering_req: 35,
                    wagering_type: 'both',
                    min_deposit: 10,
                    currency: 'EUR',
                    expiry_days: 30,
                    active: true,
                    contribution_rates: { slots: 1.0, live: 0.1, table: 0.1, excluded: [] },
                    eligibility_rules: { countries: [], segments: [] }
                });
            }
            setStep(1);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const nextStep = () => setStep(s => Math.min(6, s + 1));
    const prevStep = () => setStep(s => Math.max(1, s - 1));

    const handleSave = async () => {
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            alert('Failed to save template: ' + err.message);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="wizard-step">
                        <h3>Step 1: Basic Information</h3>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label>Campaign Name</label>
                            <input type="text" className="input-field" placeholder="e.g. Welcome Pack 2026" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label>Bonus Code</label>
                            <input type="text" className="input-field" placeholder="WELCOME100" value={formData.bonus_code} onChange={e => setFormData({ ...formData, bonus_code: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea className="input-field" rows="3" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="wizard-step">
                        <h3>Step 2: Value & Wagering</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>Bonus Type</label>
                                <select className="input-field" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={{ width: '100%', padding: '10px' }}>
                                    <option value="deposit_match">Deposit Match</option>
                                    <option value="no_deposit">No-Deposit</option>
                                    <option value="free_spins">Free Spins</option>
                                    <option value="cashback">Cashback</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Max Amount ({formData.currency})</label>
                                <input type="number" className="input-field" value={formData.max_amount} onChange={e => setFormData({ ...formData, max_amount: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                            </div>
                            <div className="form-group">
                                <label>Wagering Multiplier</label>
                                <input type="number" className="input-field" value={formData.wagering_req} onChange={e => setFormData({ ...formData, wagering_req: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                            </div>
                            <div className="form-group">
                                <label>Wagering Type</label>
                                <select className="input-field" value={formData.wagering_type} onChange={e => setFormData({ ...formData, wagering_type: e.target.value })} style={{ width: '100%', padding: '10px' }}>
                                    <option value="both">Capital + Bonus</option>
                                    <option value="bonus">Bonus Only</option>
                                    <option value="real">Real Only</option>
                                </select>
                            </div>
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="wizard-step">
                        <h3>Step 3: Game Contributions</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Define how much each game category contributes to wagering.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {['slots', 'live', 'table'].map(cat => (
                                <div key={cat} className="form-group">
                                    <label style={{ textTransform: 'capitalize' }}>{cat} (%)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={formData.contribution_rates[cat] * 100}
                                        onChange={e => setFormData({
                                            ...formData,
                                            contribution_rates: { ...formData.contribution_rates, [cat]: Number(e.target.value) / 100 }
                                        })}
                                        style={{ width: '100%', padding: '10px' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="wizard-step">
                        <h3>Step 4: Scheduling & Expiry</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>Bonus Expiry (Days)</label>
                                <input type="number" className="input-field" value={formData.expiry_days} onChange={e => setFormData({ ...formData, expiry_days: e.target.value })} style={{ width: '100%', padding: '10px' }} />
                            </div>
                        </div>
                    </div>
                );
            case 5:
                return (
                    <div className="wizard-step">
                        <h3>Step 5: Eligibility</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Player targeting rules (Optional for PoC)</p>

                        <div style={{ marginTop: '16px' }}>
                            <label>Restricted Countries (ISO 2-letter)</label>
                            <input type="text" className="input-field" placeholder="e.g. US, UK, FR"
                                value={formData.eligibility_rules.countries?.join(', ') || ''}
                                onChange={e => setFormData({ ...formData, eligibility_rules: { ...formData.eligibility_rules, countries: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                                style={{ width: '100%', padding: '10px', marginTop: '4px' }}
                            />
                        </div>

                        <div className="glass-panel" style={{ padding: '12px', marginTop: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Users size={24} style={{ marginBottom: '8px', color: 'var(--accent-gold)' }} />
                            <p>Global availability is active. All segments can claim this bonus if not restricted by country.</p>
                        </div>
                    </div>
                );
            case 6:
                return (
                    <div className="wizard-step">
                        <h3>Step 6: Review & Finalize</h3>
                        <div className="glass-panel" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>Bonus Name</span>
                                <span style={{ color: 'var(--accent-gold)' }}>{formData.name}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>Bonus Code</span>
                                <code style={{ color: '#00ff88' }}>{formData.bonus_code}</code>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>Wagering Requirement</span>
                                <span>{formData.wagering_req}x</span>
                            </div>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
            <div className="modal-content glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '32px', position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                    <X size={24} />
                </button>
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} style={{ flex: 1, height: '4px', background: step >= i ? 'var(--accent-gold)' : 'rgba(255,255,255,0.1)', borderRadius: '2px' }} />
                        ))}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Step {step} of 6</span>
                </div>

                {renderStep()}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
                    <button onClick={prevStep} disabled={step === 1} className="btn-secondary" style={{ padding: '10px 20px' }}>Back</button>
                    {step < 6 ? (
                        <button onClick={nextStep} className="btn-primary" style={{ padding: '10px 20px' }}>Next Step</button>
                    ) : (
                        <button onClick={handleSave} className="btn-primary" style={{ background: '#00ff88', color: '#000', padding: '10px 20px' }}>
                            {initialData ? 'Update Template' : 'Create Template'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const TemplateCard = ({ template, onEdit, onDelete }) => (
    <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{template.name}</h3>
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', background: template.active ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255,255,255,0.1)', color: template.active ? '#00ff88' : 'var(--text-muted)' }}>
                {template.active ? 'ACTIVE' : 'INACTIVE'}
            </span>
        </div>
        <code style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '12px' }}>{template.bonus_code}</code>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', height: '40px', overflow: 'hidden' }}>{template.description || 'No description provided'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
            <div><label style={{ color: 'var(--text-muted)' }}>Wagering</label><br />{template.wagering_req}x</div>
            <div><label style={{ color: 'var(--text-muted)' }}>Max Amt</label><br />{template.max_amount} {template.currency}</div>
            <div><label style={{ color: 'var(--text-muted)' }}>Type</label><br />{template.type}</div>
            <div style={{ display: 'flex', gap: '8px', alignSelf: 'end', justifyContent: 'flex-end' }}>
                <Edit size={16} style={{ cursor: 'pointer', color: 'var(--accent-gold)' }} onClick={() => onEdit(template)} />
                <Trash2 size={16} style={{ cursor: 'pointer', color: '#ff4444' }} onClick={() => onDelete(template.id)} />
            </div>
        </div>
    </div>
);

const ActiveBonusesTable = ({ token }) => {
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/operator/bonuses/instances', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setInstances(data);
                setLoading(false);
            });
    }, [token]);

    const handleForfeit = (id) => {
        if (!window.confirm('Are you sure you want to forfeit this bonus? Player balance will be updated.')) return;
        fetch(`/api/operator/bonuses/instances/${id}/forfeit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
            if (res.ok) {
                // Bug 1 Fix: Remove record from list immediately after forfeit success
                setInstances(instances.filter(i => i.id !== id));
            } else {
                alert('Forfeit failed');
            }
        });
    };

    return (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                    <tr>
                        <th style={{ padding: '12px' }}>Player</th>
                        <th style={{ padding: '12px' }}>Bonus</th>
                        <th style={{ padding: '12px' }}>Progress</th>
                        <th style={{ padding: '12px' }}>Status</th>
                        <th style={{ padding: '12px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {instances.map(ins => (
                        <tr key={ins.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px' }}>
                                <div style={{ fontSize: '0.9rem' }}>{ins.users?.username}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ins.player_id}</div>
                            </td>
                            <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 'bold' }}>{ins.bonus_code}</div>
                                <div style={{ fontSize: '0.8rem' }}>{ins.amount_credited} EUR</div>
                            </td>
                            <td style={{ padding: '12px' }}>
                                <div style={{ width: '100px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
                                    <div style={{ width: `${Math.min(100, (ins.wagering_progress / ins.wagering_required) * 100)}%`, height: '100%', background: 'var(--accent-gold)', borderRadius: '3px' }} />
                                </div>
                                <span style={{ fontSize: '0.7rem' }}>{ins.wagering_progress} / {ins.wagering_required}</span>
                            </td>
                            <td style={{ padding: '12px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', background: ins.state === 'ONGOING' ? 'rgba(0,150,255,0.1)' : 'rgba(255,255,255,0.1)' }}>{ins.state}</span>
                            </td>
                            <td style={{ padding: '12px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleForfeit(ins.id)} disabled={ins.state === 'FORFEITED'} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Forfeit</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ManualIssuanceForm = ({ templates, token }) => {
    const [playerId, setPlayerId] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [amount, setAmount] = useState('');
    const [issuing, setIssuing] = useState(false);

    const handleIssue = async (e) => {
        e.preventDefault();
        setIssuing(true);
        try {
            const res = await fetch('/api/operator/bonuses/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ player_id: playerId, template_id: selectedTemplate, amount: Number(amount) })
            });
            const data = await res.json();
            if (res.ok) alert('Bonus issued successfully');
            else throw new Error(data.error || 'Failed to issue bonus');
        } catch (err) {
            alert(err.message);
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div className="glass-panel" style={{ padding: '24px', maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '20px' }}>Manual Bonus Issuance</h3>
            <form onSubmit={handleIssue}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Player Username / ID</label>
                    <input type="text" className="input-field" required value={playerId} onChange={e => setPlayerId(e.target.value)} style={{ width: '100%', padding: '10px' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Select Template</label>
                    <select className="input-field" required value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: '100%', padding: '10px' }}>
                        <option value="">Select a template...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.bonus_code})</option>)}
                    </select>
                </div>
                <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label>Amount (Override Template Default)</label>
                    <input type="number" className="input-field" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '10px' }} />
                </div>
                <button type="submit" disabled={issuing} className="btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <Award size={18} />
                    {issuing ? 'ISSUING...' : 'ISSUE BONUS'}
                </button>
            </form>
        </div>
    );
};

const BonusAnalytics = ({ token }) => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        fetch('/api/operator/bonuses/analytics', {
            headers: { Authorization: `Bearer ${token}` }
        }).then(res => res.json()).then(setStats);
    }, [token]);

    if (!stats) return <div>Loading reports...</div>;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px' }}>
                <TrendingUp size={20} color="#00ff88" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Awarded</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.total_credited} EUR</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px' }}>
                <Users size={20} color="var(--accent-gold)" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Instances</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.active_count}</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px' }}>
                <CheckCircle size={20} color="#00ccff" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Conversion Rate</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(stats.avg_wagering_completion * 100)}%</div>
            </div>
        </div>
    );
};
export const Bonuses = ({ token }) => {
    const [activeTab, setActiveTab] = useState('templates');
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    const fetchTemplates = () => {
        setLoading(true);
        fetch('/api/operator/bonuses/templates', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                console.log('[Bonuses] Fetched templates from API:', data);
                setTemplates(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (token) fetchTemplates();
    }, [token]);

    const handleSaveTemplate = async (templateData) => {
        try {
            const isEdit = !!templateData.id;
            // Ensure numeric fields are numbers and ONLY include DB-compatible columns
            const payload = {
                name: templateData.name,
                bonus_code: templateData.bonus_code,
                type: templateData.type,
                max_amount: Number(templateData.max_amount),
                wagering_req: Number(templateData.wagering_req),
                min_deposit: Number(templateData.min_deposit),
                expiry_days: Number(templateData.expiry_days),
                currency: templateData.currency || 'EUR',
                contribution_rates: templateData.contribution_rates,
                active: true
            };

            const url = isEdit
                ? `/api/operator/bonuses/templates/${templateData.id}`
                : '/api/operator/bonuses/templates';

            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchTemplates();
                return await res.json();
            } else {
                const errData = await res.json();
                throw new Error(errData.error || `Failed to ${isEdit ? 'update' : 'create'} template`);
            }
        } catch (err) {
            console.error('Failed to save template', err);
            throw err;
        }
    };

    const handleEditClick = (template) => {
        setEditingTemplate(template);
        setIsWizardOpen(true);
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!window.confirm('Are you sure you want to delete this template? This cannot be undone.')) return;

        try {
            const res = await fetch(`/api/operator/bonuses/templates/${templateId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                fetchTemplates();
            } else {
                const errData = await res.json();
                alert('Failed to delete template: ' + errData.error);
            }
        } catch (err) {
            console.error('Delete template failed', err);
            alert('Delete template failed: ' + err.message);
        }
    };

    const tabs = [
        { id: 'templates', label: 'Templates', icon: SettingsIcon },
        { id: 'active', label: 'Active Bonuses', icon: Award },
        { id: 'manual', label: 'Manual Issuance', icon: Users },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    ];

    return (
        <div className="page-container" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Bonus Management</h2>
                {activeTab === 'templates' && (
                    <button onClick={() => setIsWizardOpen(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} />
                        New Template
                    </button>
                )}
            </div>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                            fontWeight: activeTab === tab.id ? '700' : '400',
                            background: activeTab === tab.id ? 'var(--accent-gold, #f59e0b)' : 'rgba(255,255,255,0.06)',
                            color: activeTab === tab.id ? '#000' : 'rgba(255,255,255,0.8)',
                            border: activeTab === tab.id ? '2px solid var(--accent-gold, #f59e0b)' : '1px solid rgba(255,255,255,0.1)',
                            transition: 'all 0.2s ease',
                            fontSize: '0.9rem'
                        }}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'templates' && (
                <div>
                    {loading ? (
                        <div style={{ color: 'var(--text-muted)' }}>Loading templates...</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                            {templates.map(t => (
                                <TemplateCard
                                    key={t.id}
                                    template={t}
                                    onEdit={handleEditClick}
                                    onDelete={handleDeleteTemplate}
                                />
                            ))}
                            {templates.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No templates created yet.</div>}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'active' && <ActiveBonusesTable token={token} />}

            {activeTab === 'manual' && <ManualIssuanceForm templates={templates} token={token} />}

            {activeTab === 'analytics' && <BonusAnalytics token={token} />}

            {/* Creation/Edit Wizard */}
            <BonusWizard
                isOpen={isWizardOpen}
                onClose={() => {
                    setIsWizardOpen(false);
                    setEditingTemplate(null);
                }}
                onSave={handleSaveTemplate}
                initialData={editingTemplate}
                token={token}
            />
        </div>
    );
};


export const Afa = AfaMonitor;

// ── Phase 1: Admin UX Parity ──────────────────────────────────────────────────
export { default as RolesPanel } from './RolesPanel';
export { default as KYCReviewPanel } from './KYCReviewPanel';
export { ExportsPanel } from './ExportsPanel';
export { CountryRulesPanel } from './CountryRulesPanel';

// ── Phase 2: Commercial Modules ───────────────────────────────────────────────
export { default as AffiliatesPanel } from './AffiliatesPanel';
export { CMSPanel } from './CMSPanel';
export { ThemePanel } from './ThemePanel';
export { I18nPanel } from './I18nPanel';

// ── Phase 4: Fraud & Trust Surfacing ─────────────────────────────────────────
export { FraudFeedPanel } from './FraudFeedPanel';
export { CollusionGraph } from './CollusionGraph';
export { ATODashboard } from './ATODashboard';
export { BonusAbusePanel } from './BonusAbusePanel';

