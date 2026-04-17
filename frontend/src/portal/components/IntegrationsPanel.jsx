import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, Settings2, RefreshCw, Layers } from 'lucide-react';

const IntegrationsPanel = ({ token }) => {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [configuring, setConfiguring] = useState(null);
    const [editCreds, setEditCreds] = useState({});

    const fetchIntegrations = async () => {
        try {
            const res = await fetch('/api/operator/integrations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            
            // To provide a robust default UI, we ensure at least the core providers are mapped if they don't exist yet
            const defaultProviders = [
                { provider_slug: 'pragmatic', category: 'Game Provider', name: 'Pragmatic Play', is_active: false, credentials: {} },
                { provider_slug: 'evolution', category: 'Game Provider', name: 'Evolution Gaming', is_active: false, credentials: {} },
                { provider_slug: 'netent', category: 'Game Provider', name: 'NetEnt', is_active: false, credentials: {} },
                { provider_slug: 'stripe', category: 'Payment Provider', name: 'Stripe', is_active: false, credentials: {} },
                { provider_slug: 'adyen', category: 'Payment Provider', name: 'Adyen', is_active: false, credentials: {} },
                { provider_slug: 'sumsub', category: 'KYC/AML Provider', name: 'Sumsub', is_active: false, credentials: {} }
            ];

            const merged = defaultProviders.map(dp => {
                const found = Array.isArray(data) ? data.find(p => p.provider_slug === dp.provider_slug) : null;
                return found ? { ...dp, ...found } : dp;
            });

            setProviders(merged);
        } catch (error) {
            console.error('Failed to fetch integrations', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (token) fetchIntegrations();
    }, [token]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchIntegrations();
    };

    const handleToggle = async (slug, currentState) => {
        try {
            const res = await fetch(`/api/operator/integrations/${slug}/toggle`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: !currentState })
            });
            if (res.ok) {
                setProviders(providers.map(p => p.provider_slug === slug ? { ...p, is_active: !currentState } : p));
            }
        } catch (err) {
            console.error('Failed to toggle provider', err);
        }
    };

    const handleConfigure = (provider) => {
        setConfiguring(provider);
        // Default empty fields if configuring without an existing record
        setEditCreds(provider.credentials || {});
    };

    const handleSaveConfig = async () => {
        try {
            const res = await fetch(`/api/operator/integrations/${configuring.provider_slug}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ credentials: editCreds })
            });

            if (res.ok) {
                setProviders(providers.map(p => 
                    p.provider_slug === configuring.provider_slug 
                    ? { ...p, credentials: editCreds } 
                    : p
                ));
                setConfiguring(null);
            } else {
                alert('Failed to save configuration.');
            }
        } catch (err) {
            console.error('Saving config error', err);
        }
    };

    // Grouping for render
    const categorized = providers.reduce((acc, p) => {
        acc[p.category] = acc[p.category] || [];
        acc[p.category].push(p);
        return acc;
    }, {});

    return (
        <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-gold)' }}>Provider Integrations</h3>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
                    <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Syncing...' : 'Refresh'}
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Integrations...</div>
            ) : (
                Object.entries(categorized).map(([cat, list]) => (
                    <div key={cat} style={{ marginBottom: '32px' }}>
                        <h4 style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>{cat}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {list.map(p => (
                                <div key={p.provider_slug} className="glass-panel" style={{ padding: '20px', borderLeft: p.is_active ? '4px solid #00ff88' : '4px solid #ff4d4d' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Layers size={20} color="var(--accent-gold)" />
                                            <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{p.name}</span>
                                        </div>
                                        {p.is_active ? 
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#00ff88' }}><CheckCircle size={14} /> Active</span> :
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#ff4d4d' }}><XCircle size={14} /> Inactive</span>
                                        }
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                                        {Object.keys(p.credentials || {}).length > 0 
                                            ? <span style={{ color: '#00ccff' }}>Configured</span> 
                                            : 'Credentials not set'}
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            className="btn-secondary" 
                                            style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'center', gap: '6px' }}
                                            onClick={() => handleConfigure(p)}
                                        >
                                            <Settings2 size={16} /> Configure
                                        </button>
                                        <button 
                                            className={p.is_active ? "btn-secondary" : "btn-primary"} 
                                            style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                                            onClick={() => handleToggle(p.provider_slug, p.is_active)}
                                        >
                                            {p.is_active ? 'Disable' : 'Enable'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* Config Modal */}
            {configuring && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="glass-panel" style={{ padding: '32px', width: '100%', maxWidth: '500px' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '24px' }}>Configure {configuring.name}</h3>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>API Key / Client ID</label>
                            <input 
                                type="text"
                                className="input-field"
                                style={{ width: '100%', padding: '10px' }}
                                value={editCreds.api_key || ''}
                                onChange={(e) => setEditCreds({...editCreds, api_key: e.target.value})}
                                placeholder="sk_live_..."
                            />
                        </div>
                        
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Secret / App Token</label>
                            <input 
                                type="password" // Masked input since it's a secret
                                className="input-field"
                                style={{ width: '100%', padding: '10px' }}
                                value={editCreds.secret_key || ''}
                                onChange={(e) => setEditCreds({...editCreds, secret_key: e.target.value})}
                                placeholder="Secret key or token"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-secondary" onClick={() => setConfiguring(null)}>Cancel</button>
                            <button className="btn-primary" onClick={handleSaveConfig} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Save size={16} /> Save Credentials
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IntegrationsPanel;
