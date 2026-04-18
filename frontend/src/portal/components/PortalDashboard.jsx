import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import OperatorLayout from './OperatorLayout';
import GGRTrendChart from './GGRTrendChart';
import KPICard from './KPICard';
import { Users, TrendingUp, CheckCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import {
    Players, Wallet, Games, Compliance, Settings, Bonuses, Afa,
    RolesPanel, KYCReviewPanel, ExportsPanel, CountryRulesPanel,
    AffiliatesPanel, CMSPanel, ThemePanel, I18nPanel,
    FraudFeedPanel, CollusionGraph, ATODashboard, BonusAbusePanel
} from './Pages';

import OperationalStream from './OperationalStream';
import FastTrackStatusWidget from './FastTrackStatusWidget';
import ActiveProvidersWidget from './ActiveProvidersWidget';

const fetcher = (url, token) => fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
}).then(res => res.json());

const getDateFilterValue = (period) => {
    const now = new Date();
    const start = new Date();

    switch (period) {
        case 'Today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'Yesterday':
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'Last 7 Days':
            start.setDate(now.getDate() - 6);
            start.setHours(0, 0, 0, 0);
            break;
        case 'This Month':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'Last 30 Days':
        default:
            start.setDate(now.getDate() - 29);
            start.setHours(0, 0, 0, 0);
            break;
    }

    const day = String(start.getDate()).padStart(2, '0');
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const year = start.getFullYear();
    return `>= ${day}/${month}/${year}`;
};

const PortalDashboard = ({ user, token, productOffering, onLogout }) => {
    const [dateRange, setDateRange] = useState('Last 30 Days');
    const { data: stats, mutate } = useSWR(
        token ? [`/api/operator/stats?period=${dateRange}`, token, user?.username] : null,
        ([url, t, u]) => fetch(url, {
            headers: { 
                Authorization: `Bearer ${t}`,
                ...(u && { 'x-username': u })
            }
        }).then(res => res.json()),
        { refreshInterval: 60000 }
    );

    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await mutate();
        setTimeout(() => setRefreshing(false), 500);
    };

    const [currentPath, setCurrentPath] = useState(window.location.pathname);

    useEffect(() => {
        const handleLocationChange = () => {
            setCurrentPath(window.location.pathname);
        };

        window.addEventListener('popstate', handleLocationChange);
        return () => window.removeEventListener('popstate', handleLocationChange);
    }, []);

    const m = stats?.metrics;

    const kpiConfig = [
        { label: 'Active Players', metric: m?.active_players, icon: Users, color: '#00ccff' },
        { label: 'Total GGR', metric: m?.ggr, icon: TrendingUp, color: '#ffd700', prefix: '€' },
        { label: 'Approval Rate', metric: m?.approval_rate, icon: CheckCircle, color: '#00ff88', suffix: '%' },
        { label: 'Compliance Alerts', metric: m?.compliance_alerts, icon: ShieldAlert, color: '#ff4d4d' },
    ];

    const handleNavigate = (path, filterFn) => {
        // Simple client-side navigation since Pages.jsx handles routing via currentPath state
        window.history.pushState({}, '', path);

        // Trigger generic popstate event to notify components
        const navEvent = new PopStateEvent('popstate');
        window.dispatchEvent(navEvent);

        // Persist filter if provided
        if (filterFn) filterFn();
    };

    const renderContent = () => {
        if (currentPath.includes('/portal/players')) return <Players user={user} token={token} />;
        if (currentPath.includes('/portal/wallet')) return <Wallet user={user} token={token} />;
        if (currentPath.includes('/portal/games')) return <Games user={user} token={token} />;
        if (currentPath.includes('/portal/compliance/kyc')) return <KYCReviewPanel token={token} user={user} />;
        if (currentPath.includes('/portal/compliance')) return <Compliance user={user} token={token} />;
        if (currentPath.includes('/portal/bonuses')) return <Bonuses token={token} />;
        if (currentPath.includes('/portal/settings/roles')) return <RolesPanel token={token} user={user} />;
        if (currentPath.includes('/portal/settings/countries')) return <CountryRulesPanel token={token} user={user} />;
        if (currentPath.includes('/portal/settings/theme')) return <ThemePanel token={token} user={user} />;
        if (currentPath.includes('/portal/settings/i18n')) return <I18nPanel token={token} user={user} />;
        if (currentPath.includes('/portal/settings')) return <Settings user={user} token={token} productOffering={productOffering} />;
        if (currentPath.includes('/portal/reports')) return <ExportsPanel token={token} user={user} />;
        if (currentPath.includes('/portal/marketing/affiliates')) return <AffiliatesPanel token={token} user={user} />;
        if (currentPath.includes('/portal/marketing/cms')) return <CMSPanel token={token} user={user} />;
        if (currentPath.includes('/portal/fraud/feed')) return <FraudFeedPanel token={token} user={user} />;
        if (currentPath.includes('/portal/fraud/collusion')) return <CollusionGraph token={token} user={user} />;
        if (currentPath.includes('/portal/fraud/ato')) return <ATODashboard token={token} user={user} />;
        if (currentPath.includes('/portal/fraud/bonus-abuse')) return <BonusAbusePanel token={token} user={user} />;
        if (currentPath.includes('/portal/operational-stream')) return <OperationalStream user={user} token={token} />;
        if (currentPath.includes('/portal/afa')) return <Afa user={user} token={token} />;

        return (
            <div className="dashboard-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0 }}>Dashboard Overview <span style={{ fontSize: '0.9rem', opacity: 0.7, color: 'var(--accent-gold)' }}>({dateRange})</span></h2>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                    >
                        <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
                <div className="kpi-strip">
                    {kpiConfig.map((kpi, i) => (
                        <KPICard
                            key={i}
                            label={kpi.label}
                            value={`${kpi.prefix || ''}${kpi.metric?.value?.toLocaleString() || 0}${kpi.suffix || ''}`}
                            trend={kpi.metric?.trend || 0}
                            sparkline={kpi.metric?.sparkline || []}
                            icon={kpi.icon}
                            color={kpi.color}
                            delay={`${i * 0.1}s`}
                            onClick={() => {
                                if (kpi.label === 'Active Players') {
                                    handleNavigate('/portal/players', () => {
                                        sessionStorage.setItem('playerFilters', JSON.stringify({
                                            last_login: getDateFilterValue(dateRange)
                                        }));
                                    });
                                } else if (kpi.label === 'Total GGR') {
                                    handleNavigate('/portal/wallet', () => {
                                        sessionStorage.setItem('transactionFilters', JSON.stringify({
                                            type: 'GGR',
                                            status: 'success',
                                            date: getDateFilterValue(dateRange)
                                        }));
                                    });
                                } else if (kpi.label === 'Approval Rate') {
                                    handleNavigate('/portal/wallet', () => {
                                        sessionStorage.setItem('transactionFilters', JSON.stringify({
                                            date: getDateFilterValue(dateRange)
                                        }));
                                    });
                                } else if (kpi.label === 'Compliance Alerts') {
                                    handleNavigate('/portal/compliance', () => {
                                        sessionStorage.setItem('complianceFilters', JSON.stringify({
                                            date: getDateFilterValue(dateRange)
                                        }));
                                    });
                                }
                            }}
                        />
                    ))}
                </div>

                <div className="charts-grid">
                    <GGRTrendChart data={stats?.ggr_history || []} dateRangeLabel={dateRange} />

                    <div className="side-panels" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <FastTrackStatusWidget
                            token={token}
                            stats={stats}
                            periodLabel={dateRange === 'Today' ? '24h' : dateRange}
                            onClick={() => {
                                handleNavigate('/portal/operational-stream', () => {
                                    sessionStorage.setItem('operationalStreamFilters', JSON.stringify({
                                        type: 'outbound',
                                        date: getDateFilterValue(dateRange)
                                    }));
                                });
                            }}
                        />
                        {productOffering === 'ADVANCED' && <ActiveProvidersWidget />}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <OperatorLayout
            token={token}
            onLogout={onLogout}
            user={stats?.user}
            dateRange={dateRange}
            setDateRange={setDateRange}
            productOffering={productOffering}
        >
            {renderContent()}
        </OperatorLayout>
    );
};

export default PortalDashboard;
