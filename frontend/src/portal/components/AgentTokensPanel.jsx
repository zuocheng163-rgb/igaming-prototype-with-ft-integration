import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Shield, Copy, Check, Eye, EyeOff, AlertCircle, Clock, Activity, Key, Sliders, LayoutDashboard, ListChecks } from 'lucide-react';
import AgentPolicyPanel from './AgentPolicyPanel';
import AgentApprovalQueue from './AgentApprovalQueue';
import AgentActivityDashboard from './AgentActivityDashboard';

// Scope definitions matching backend SCOPE_TIER_MAP
const SCOPE_DEFINITIONS = [
    { scope: 'metrics:read',                 tier: 'T1', label: 'Read Metrics',                 desc: 'GGR, player, payment, bonus, RG dashboards' },
    { scope: 'alerts:read',                  tier: 'T1', label: 'Read Alerts',                  desc: 'Alert list, detail, risk scores' },
    { scope: 'alerts:subscribe',             tier: 'T1', label: 'Subscribe to Alerts',           desc: 'Webhook & SSE subscription management' },
    { scope: 'audit:read',                   tier: 'T1', label: 'Read Audit',                   desc: 'Agent action history, policy log' },
    { scope: 'player:read',                  tier: 'T1', label: 'Read Players',                 desc: 'View player details, balances, and restrictions' },

    { scope: 'alerts:write:pre-auth',        tier: 'T2', label: 'Update Alert Status',          desc: 'Acknowledge, resolve, escalate alerts' },
    { scope: 'player:restrict:pre-auth',     tier: 'T2', label: 'Restrict Players',             desc: 'Temporary player restriction within policy limits' },
    { scope: 'player:unrestrict:pre-auth',   tier: 'T2', label: 'Unrestrict Players',           desc: 'Remove active player restrictions within limits' },
    { scope: 'player:welfare:pre-auth',      tier: 'T2', label: 'Welfare Tag',                  desc: 'Welfare outreach tagging' },
    { scope: 'bonus:forfeit:pre-auth',       tier: 'T2', label: 'Forfeit Bonuses',              desc: 'Bonus forfeiture within policy bounds' },
    { scope: 'bonus:modify:pre-auth',        tier: 'T2', label: 'Modify Bonuses',               desc: 'Extend bonus expiry within policy bounds' },
    { scope: 'escalation:create',            tier: 'T2', label: 'Create Escalations',           desc: 'Submit pending approvals for T3 review' },

    { scope: 'player:exclude:human-gated',   tier: 'T3', label: 'Propose Exclusion',            desc: 'Propose permanent exclusion (needs approval)' },
    { scope: 'bonus:issue:human-gated',      tier: 'T3', label: 'Propose Bulk Bonus',           desc: 'Propose bulk bonus issuance (needs approval)' },
    { scope: 'bonus:template:forfeit:human-gated', tier: 'T3', label: 'Propose Template Forfeit', desc: 'Propose active template forfeiture (needs approval)' },
    { scope: 'compliance:submit:human-gated',tier: 'T3', label: 'Propose Compliance Report',    desc: 'Submit compliance report (needs approval)' },
];

const TIER_COLORS = {
    T1: { bg: 'rgba(0, 204, 255, 0.1)', border: 'rgba(0, 204, 255, 0.3)', text: '#00ccff' },
    T2: { bg: 'rgba(255, 165, 0, 0.1)',  border: 'rgba(255, 165, 0, 0.3)',  text: '#ffa500' },
    T3: { bg: 'rgba(255, 77, 77, 0.1)',   border: 'rgba(255, 77, 77, 0.3)',   text: '#ff4d4d' },
};

const TTL_PRESETS = [
    { label: '1 hour', hours: 1 },
    { label: '24 hours', hours: 24 },
    { label: '7 days', hours: 168 },
    { label: '30 days', hours: 720 },
    { label: 'Custom', hours: null },
];

const AgentTokensPanel = ({ token }) => {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showIssueForm, setShowIssueForm] = useState(false);
    const [issuedToken, setIssuedToken] = useState(null);
    const [copiedJti, setCopiedJti] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    const [revealedTokens, setRevealedTokens] = useState(new Set());
    const [activeSubTab, setActiveSubTab] = useState('tokens'); // 'tokens' | 'policy' | 'approvals' | 'dashboard'

    // Issue form state
    const [formData, setFormData] = useState({
        agent_id: '',
        policy_scope: ['metrics:read', 'alerts:read'],
        ttl_hours: 168,
        ip_allowlist: '',
    });
    const [ttlPreset, setTtlPreset] = useState('7 days');
    const [isIssuing, setIsIssuing] = useState(false);

    const fetchTokens = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/auth/agent-tokens?include_revoked=true', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTokens(data.tokens || []);
            }
        } catch (err) {
            console.error('[AFA] Failed to fetch tokens', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchActivity = useCallback(async () => {
        if (!token) return;
        try {
            // Try to fetch recent agent activity from audit API
            // This uses the admin auth, not agent auth
            const res = await fetch('/api/v1/auth/agent-tokens', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                // Activity will be populated from token metadata
            }
        } catch (err) {
            console.error('[AFA] Failed to fetch activity', err);
        }
    }, [token]);

    useEffect(() => {
        fetchTokens();
        fetchActivity();
    }, [fetchTokens, fetchActivity]);

    const handleIssue = async () => {
        if (!formData.agent_id.trim()) return;
        setIsIssuing(true);
        try {
            const body = {
                agent_id: formData.agent_id.trim(),
                policy_scope: formData.policy_scope,
                ttl_hours: formData.ttl_hours,
            };
            if (formData.ip_allowlist.trim()) {
                body.ip_allowlist = formData.ip_allowlist.split(',').map(s => s.trim()).filter(Boolean);
            }
            const res = await fetch('/api/v1/auth/agent-tokens', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                setIssuedToken(data);
                setShowIssueForm(false);
                setFormData({ agent_id: '', policy_scope: ['metrics:read', 'alerts:read'], ttl_hours: 168, ip_allowlist: '' });
                fetchTokens();
            } else {
                const err = await res.json();
                alert(`Failed: ${err.error_code || err.error || 'Unknown error'}`);
            }
        } catch (err) {
            alert('Failed to issue token: ' + err.message);
        } finally {
            setIsIssuing(false);
        }
    };

    const handleRevoke = async (jti, agentId) => {
        if (!confirm(`Revoke token for agent "${agentId}"? This action is immediate and irreversible.`)) return;
        try {
            const res = await fetch(`/api/v1/auth/agent-tokens/${jti}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: 'Manual revocation from Agent Tokens panel' }),
            });
            if (res.ok) {
                fetchTokens();
            } else {
                alert('Failed to revoke token');
            }
        } catch (err) {
            alert('Failed to revoke: ' + err.message);
        }
    };

    const copyToClipboard = async (text, jti) => {
        await navigator.clipboard.writeText(text);
        setCopiedJti(jti);
        setTimeout(() => setCopiedJti(null), 2000);
    };

    const toggleScope = (scope) => {
        setFormData(prev => {
            const scopes = prev.policy_scope.includes(scope)
                ? prev.policy_scope.filter(s => s !== scope)
                : [...prev.policy_scope, scope];
            return { ...prev, policy_scope: scopes };
        });
    };

    const deriveTier = (scopes) => {
        if (scopes.some(s => s.includes('human-gated'))) return 'T3';
        if (scopes.some(s => s.includes('pre-auth') || s === 'escalation:create')) return 'T2';
        return 'T1';
    };

    const activeTokens = tokens.filter(t => !t.revoked_at);
    const revokedTokens = tokens.filter(t => t.revoked_at);

    const inputStyle = {
        width: '100%', padding: '10px 14px',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px', color: 'white', fontSize: '0.9rem',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    };

    return (
        <div style={{ marginTop: '0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a855f7' }}>
                        <Key size={20} />
                        <h3 style={{ margin: 0 }}>Agent Gateway (F13-AFA)</h3>
                    </div>
                    
                    {/* Sub-tabs */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <button 
                            onClick={() => setActiveSubTab('tokens')}
                            style={{ 
                                padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                background: activeSubTab === 'tokens' ? 'rgba(168,85,247,0.2)' : 'transparent',
                                color: activeSubTab === 'tokens' ? '#a855f7' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Tokens
                        </button>
                        <button 
                            onClick={() => setActiveSubTab('policy')}
                            style={{ 
                                padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                background: activeSubTab === 'policy' ? 'rgba(255,165,0,0.2)' : 'transparent',
                                color: activeSubTab === 'policy' ? '#ffa500' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Policy Bounds
                        </button>
                        <button 
                            onClick={() => setActiveSubTab('approvals')}
                            style={{ 
                                padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                background: activeSubTab === 'approvals' ? 'rgba(0,204,255,0.2)' : 'transparent',
                                color: activeSubTab === 'approvals' ? '#00ccff' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Approvals
                        </button>
                        <button 
                            onClick={() => setActiveSubTab('dashboard')}
                            style={{ 
                                padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                background: activeSubTab === 'dashboard' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: activeSubTab === 'dashboard' ? 'white' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Dashboard
                        </button>
                    </div>
                </div>
                
                {activeSubTab === 'tokens' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={fetchTokens} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                        </button>
                        <button onClick={() => setShowIssueForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                            <Plus size={14} /> Issue New Token
                        </button>
                    </div>
                )}
            </div>

            {activeSubTab === 'policy' ? (
                <AgentPolicyPanel token={token} />
            ) : activeSubTab === 'approvals' ? (
                <AgentApprovalQueue token={token} />
            ) : activeSubTab === 'dashboard' ? (
                <AgentActivityDashboard token={token} />
            ) : (
                <>
                    {/* Issued Token Banner */}
                    {issuedToken && (
                        <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid #00ff88', background: 'rgba(0,255,136,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 4px', color: '#00ff88' }}>✅ Token Issued Successfully</h4>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Agent: <strong>{issuedToken.agent_id}</strong> · Tier: <strong>{issuedToken.trust_tier}</strong> · Expires: {new Date(issuedToken.expires_at).toLocaleString()}
                                    </div>
                                </div>
                                <button onClick={() => setIssuedToken(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#ffa500', marginBottom: '8px' }}>
                                <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                Copy this JWT now — it will NOT be shown again.
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input readOnly value={issuedToken.token} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem', flex: 1, color: '#00ff88' }} />
                                <button onClick={() => copyToClipboard(issuedToken.token, 'issued')} className="btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                    {copiedJti === 'issued' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy JWT</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Issue Form Modal */}
                    {showIssueForm && (
                        <div className="modal-overlay" onClick={() => setShowIssueForm(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
                                <h3 style={{ margin: '0 0 20px', color: 'white' }}>Issue Agent Token</h3>

                                <div className="modal-inner-scroll">
                                    {/* Agent ID */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Agent Label</label>
                                    <input
                                        type="text" placeholder="e.g. claude-cowork-prod, compliance-bot"
                                        value={formData.agent_id}
                                        onChange={e => setFormData({ ...formData, agent_id: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>

                                {/* TTL */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Token Lifetime</label>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {TTL_PRESETS.map(p => (
                                            <button key={p.label} onClick={() => { setTtlPreset(p.label); if (p.hours) setFormData(prev => ({ ...prev, ttl_hours: p.hours })); }}
                                                style={{
                                                    padding: '6px 14px', fontSize: '0.8rem', borderRadius: '20px', cursor: 'pointer',
                                                    background: ttlPreset === p.label ? 'rgba(0,204,255,0.2)' : 'rgba(255,255,255,0.05)',
                                                    border: `1px solid ${ttlPreset === p.label ? 'rgba(0,204,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                                    color: ttlPreset === p.label ? '#00ccff' : 'var(--text-muted)',
                                                    transition: 'all 0.2s',
                                                }}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                    {ttlPreset === 'Custom' && (
                                        <input type="number" min="1" placeholder="Hours" value={formData.ttl_hours}
                                            onChange={e => setFormData({ ...formData, ttl_hours: parseInt(e.target.value) || 1 })}
                                            style={{ ...inputStyle, marginTop: '8px', width: '160px' }}
                                        />
                                    )}
                                </div>

                                {/* Scope Selection */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Policy Scope
                                        <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', ...TIER_COLORS[deriveTier(formData.policy_scope)], border: `1px solid ${TIER_COLORS[deriveTier(formData.policy_scope)].border}` }}>
                                            {deriveTier(formData.policy_scope)}
                                        </span>
                                    </label>
                                    <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '8px' }}>
                                        {['T1', 'T2', 'T3'].map(tier => (
                                            <div key={tier} style={{ marginBottom: '12px' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: TIER_COLORS[tier].text, letterSpacing: '0.05em', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                    {tier} — {tier === 'T1' ? 'Observe & Report' : tier === 'T2' ? 'Pre-authorised' : 'Human-gated'}
                                                </div>
                                                {SCOPE_DEFINITIONS.filter(s => s.tier === tier).map(s => (
                                                    <label key={s.scope} style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 12px', marginBottom: '4px',
                                                        background: formData.policy_scope.includes(s.scope) ? TIER_COLORS[tier].bg : 'transparent',
                                                        borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
                                                        border: `1px solid ${formData.policy_scope.includes(s.scope) ? TIER_COLORS[tier].border : 'transparent'}`
                                                    }}>
                                                        <input type="checkbox" checked={formData.policy_scope.includes(s.scope)} onChange={() => toggleScope(s.scope)}
                                                            style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px', accentColor: TIER_COLORS[tier].text }} />
                                                        <div>
                                                            <div style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>{s.label}</div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.desc}</div>
                                                            <code style={{ fontSize: '0.65rem', color: TIER_COLORS[tier].text, marginTop: '2px', display: 'inline-block' }}>{s.scope}</code>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* IP Allowlist */}
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>IP Allowlist (optional)</label>
                                    <input type="text" placeholder="e.g. 203.0.113.10, 198.51.100.0" value={formData.ip_allowlist}
                                        onChange={e => setFormData({ ...formData, ip_allowlist: e.target.value })}
                                        style={inputStyle} />
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Comma-separated IPs. Leave empty to allow all.</div>
                                </div>

                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                        <button onClick={() => setShowIssueForm(false)} className="btn-secondary" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>
                                            Cancel
                                        </button>
                                        <button onClick={handleIssue} disabled={!formData.agent_id.trim() || formData.policy_scope.length === 0 || isIssuing}
                                            className="btn-primary" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: (!formData.agent_id.trim() || formData.policy_scope.length === 0) ? 0.5 : 1 }}>
                                            <Key size={14} /> {isIssuing ? 'Generating...' : 'Generate Token'}
                                        </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Tokens Table */}
                    <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 16px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Shield size={16} style={{ color: '#00ff88' }} /> Active Tokens ({activeTokens.length})
                        </h4>
                        {loading ? (
                            <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>Loading tokens...</div>
                        ) : activeTokens.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', padding: '30px 0', textAlign: 'center', fontSize: '0.9rem' }}>
                                No active agent tokens. Issue one to enable AI agent access.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            {['Agent ID', 'Tier', 'Scopes', 'Issued By', 'Last Used', 'Requests', 'Expires', ''].map(h => (
                                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeTokens.map(t => {
                                            const isExpired = new Date(t.expires_at) < new Date();
                                            return (
                                                <tr key={t.jti} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: isExpired ? 0.5 : 1 }}>
                                                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 600, color: 'white' }}>{t.agent_id}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700, ...TIER_COLORS[t.trust_tier], border: `1px solid ${TIER_COLORS[t.trust_tier].border}` }}>{t.trust_tier}</span>
                                                    </td>
                                                    <td style={{ padding: '12px', maxWidth: '200px' }}>
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {(t.policy_scope || []).slice(0, 3).map(s => (
                                                                <span key={s} style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                                                    {s.split(':')[0]}
                                                                </span>
                                                            ))}
                                                            {(t.policy_scope || []).length > 3 && (
                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+{t.policy_scope.length - 3}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{t.issued_by}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        {t.last_used_at ? (
                                                            <span style={{ color: '#00ff88', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Activity size={12} /> {new Date(t.last_used_at).toLocaleDateString()}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Never</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.request_count || 0}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{ color: isExpired ? '#ff4d4d' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={12} /> {isExpired ? 'Expired' : new Date(t.expires_at).toLocaleDateString()}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <button onClick={() => handleRevoke(t.jti, t.agent_id)}
                                                            style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#ff4d4d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', transition: 'all 0.2s' }}>
                                                            <Trash2 size={12} /> Revoke
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Revoked Tokens (collapsed) */}
                    {revokedTokens.length > 0 && (
                        <details className="glass-panel" style={{ padding: '16px 20px' }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, userSelect: 'none' }}>
                                Revoked Tokens ({revokedTokens.length})
                            </summary>
                            <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', opacity: 0.6 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            {['Agent ID', 'Tier', 'Revoked By', 'Reason', 'Revoked At'].map(h => (
                                                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {revokedTokens.map(t => (
                                            <tr key={t.jti} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{t.agent_id}</td>
                                                <td style={{ padding: '8px 12px' }}><span style={{ ...TIER_COLORS[t.trust_tier], padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem' }}>{t.trust_tier}</span></td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{t.revoked_by || '-'}</td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.revocation_reason || '-'}</td>
                                                <td style={{ padding: '8px 12px', color: '#ff4d4d' }}>{new Date(t.revoked_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}

                    {/* Discovery Info */}
                    <div className="glass-panel" style={{ padding: '16px 20px', marginTop: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#a855f7' }}>
                            <Activity size={16} />
                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Agent Discovery Endpoints</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
                            <div>
                                <span style={{ color: 'var(--text-muted)' }}>Capability Manifest:</span>
                                <code style={{ display: 'block', marginTop: '4px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', color: '#00ccff', fontSize: '0.75rem' }}>
                                    GET /.well-known/agent.json
                                </code>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)' }}>OpenAPI Schema:</span>
                                <code style={{ display: 'block', marginTop: '4px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', color: '#00ccff', fontSize: '0.75rem' }}>
                                    GET /api/v1/ops/openapi.json
                                </code>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AgentTokensPanel;
