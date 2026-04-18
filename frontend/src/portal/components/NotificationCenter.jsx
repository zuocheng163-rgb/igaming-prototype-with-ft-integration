import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
    Bell, X, CheckCircle, Info, AlertTriangle,
    CreditCard, ShieldCheck, Zap, Settings,
    Filter, Trash2, Check, Clock
} from 'lucide-react';

const fetcher = (url, token) => fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
}).then(res => res.json());

const NotificationCenter = ({ token, username }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const [showPrefs, setShowPrefs] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);

    const { data: notifications, mutate } = useSWR(
        token ? ['/api/operator/notifications', token, username] : null,
        ([url, t, u]) => fetch(url, {
            headers: { 
                Authorization: `Bearer ${t}`,
                ...(u && { 'x-username': u })
            }
        }).then(res => res.json()),
        { refreshInterval: 30000 }
    );

    const filteredNotifications = useMemo(() => {
        if (!notifications || !Array.isArray(notifications)) return [];
        let list = [...notifications];

        // Sorting: Critical first, then by date
        list.sort((a, b) => {
            if (a.severity === 'Critical' && b.severity !== 'Critical') return -1;
            if (a.severity !== 'Critical' && b.severity === 'Critical') return 1;
            const dateA = new Date(a.timestamp || a.created_at);
            const dateB = new Date(b.timestamp || b.created_at);
            return dateB - dateA;
        });

        if (activeFilter === 'unread') return list.filter(n => n.status === 'unread');
        return list;
    }, [notifications, activeFilter]);

    const unreadCount = Array.isArray(notifications) 
        ? notifications.filter(n => n.status === 'unread').length 
        : 0;

    const getIcon = (type, severity) => {
        if (severity === 'Critical') return <AlertTriangle className="text-red-500" size={16} />;

        switch (type?.toLowerCase()) {
            case 'payment': return <CreditCard size={16} />;
            case 'kyc': return <ShieldCheck size={16} />;
            case 'security': return <Zap size={16} />;
            default: return <Info size={16} />;
        }
    };

    const handleResolve = (id) => {
        mutate(notifications.map(n => n.id === id ? { ...n, status: 'read' } : n), false);
    };

    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Unknown';
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="notification-center-container">
            <div className="notification-bell-icon" onClick={() => setIsOpen(!isOpen)}>
                <Bell size={20} />
                {unreadCount > 0 && <span className="pulse-badge"></span>}
            </div>

            {isOpen && (
                <div className="notification-drawer glass-panel">
                    <div className="drawer-header">
                        <div className="header-title">
                            <h3>Operational Alerts</h3>
                            {unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
                        </div>
                        <div className="header-actions">
                            <Settings size={16} className="btn-icon" onClick={() => setShowPrefs(!showPrefs)} />
                            <X size={18} className="btn-icon" onClick={() => setIsOpen(false)} />
                        </div>
                    </div>

                    <div className="drawer-filters">
                        <button
                            className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('all')}
                        >All</button>
                        <button
                            className={`filter-tab ${activeFilter === 'unread' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('unread')}
                        >Unread</button>
                    </div>

                    <div className="notification-list">
                        {filteredNotifications.length > 0 ? filteredNotifications.map(n => (
                            <div
                                key={n.id}
                                className={`notification-item ${n.status} ${n.severity?.toLowerCase()}`}
                                onClick={() => setSelectedNotification(n)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="severity-indicator">
                                    {getIcon(n.type, n.severity)}
                                </div>
                                <div className="notification-content">
                                    <div className="msg-row">
                                        <p className="message">{n.message}</p>
                                        {n.status === 'unread' && (
                                            <button className="resolve-btn" onClick={(e) => { e.stopPropagation(); handleResolve(n.id); }}>
                                                <Check size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="meta">
                                        <span className="type">{n.type || 'System'}</span>
                                        <span className="dot">•</span>
                                        <span className="time"><Clock size={10} style={{ marginRight: '4px' }} /> {formatTimeAgo(n.timestamp || n.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="empty-state">
                                <CheckCircle size={32} className="text-green-500" />
                                <p>All Systems Nominal</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedNotification && (
                <div className="modal-overlay" onClick={() => setSelectedNotification(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-prominent" onClick={() => setSelectedNotification(null)}>
                            <X size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <Bell className={selectedNotification.severity === 'Critical' ? 'text-danger' : 'text-warning'} size={24} />
                            <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'white' }}>Alert Investigation</h2>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Event Message</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: '500', color: 'white', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedNotification.message}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Timestamp</label>
                                    <div style={{ color: 'white' }}>{new Date(selectedNotification.timestamp || selectedNotification.created_at).toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>User ID</label>
                                    <div style={{ color: 'white', fontFamily: 'monospace' }}>{selectedNotification.user_id || 'System'}</div>
                                </div>
                            </div>

                            {selectedNotification.metadata && (
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
                                        {JSON.stringify(selectedNotification.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button className="btn-primary" style={{ flex: 1 }} onClick={() => setSelectedNotification(null)}>
                                Dismiss Alert
                            </button>
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => {
                                const alertId = selectedNotification.id;
                                setSelectedNotification(null);
                                setIsOpen(false);

                                // Set the filter so Compliance page opens this specific alert
                                sessionStorage.setItem('complianceFilters', JSON.stringify({
                                    id: alertId
                                }));

                                window.history.pushState({}, '', '/portal/compliance');
                                window.dispatchEvent(new CustomEvent('complianceFilterUpdated'));
                                window.dispatchEvent(new PopStateEvent('popstate'));
                            }}>
                                View Evidence Console
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
