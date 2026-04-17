import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, User, AlertCircle, Eye, RefreshCw, MessageSquare } from 'lucide-react';

const AgentApprovalQueue = ({ token }) => {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [resolvingId, setResolvingId] = useState(null);
    const [resolutionNote, setResolutionNote] = useState('');

    const fetchQueue = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/auth/agent-tokens?view=approvals&_t=${Date.now()}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                setApprovals(data.approvals || []);
            }
        } catch (err) {
            console.error('[AFA Queue] Fetch failed', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const handleResolve = async (id, resolution) => {
        setResolvingId(id);
        try {
            const res = await fetch(`/api/v1/auth/approvals/${id}/resolve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    resolution,
                    reason: resolutionNote
                })
            });

            if (res.ok) {
                alert(`Action successfully ${resolution}!`);
                setResolutionNote('');
                fetchQueue();
            } else {
                const err = await res.json();
                alert(`Resolution failed: ${err.message || 'Unknown error'}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setResolvingId(null);
        }
    };

    const formatPayload = (actionType, payload) => {
        if (!payload) return 'No data';
        switch (actionType) {
            case 'player:restrict:pre-auth':
                return `Restrict Player ${payload.player_id} (${payload.type}) for ${payload.duration}m`;
            case 'bonus:forfeit:pre-auth':
                return `Forfeit Bonus ${payload.bonus_id} for Player ${payload.player_id}`;
            case 'player:welfare:pre-auth':
                return `Welfare Tag "${payload.tag}" for Player ${payload.player_id}`;
            case 'bonus:template:forfeit:human-gated':
                return `Bulk Forfeit Template "${payload.template_id}" (Affects ${payload.affected_features || 'all'} players)`;
            default:
                return JSON.stringify(payload);
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#00ccff' }}>
                    <Clock size={20} />
                    <h3 style={{ margin: 0 }}>T3 Approval Queue (Human-Gated)</h3>
                </div>
                <button onClick={fetchQueue} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Agents with T3 scopes cannot execute these actions autonomously. They appear here for manual verification and one-click resolution.
            </p>

            {loading && approvals.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading pending requests...
                </div>
            ) : approvals.length === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>
                    <CheckCircle size={32} style={{ marginBottom: '12px', color: '#00ff88', opacity: 0.5 }} />
                    <p>Approval queue is empty. All agent escalations are resolved.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {approvals.map(req => (
                        <div key={req.id} className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #00ccff', display: 'grid', gridTemplateColumns: '1fr 200px', gap: '20px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(0,204,255,0.1)', color: '#00ccff', fontWeight: 600 }}>
                                        {req.action_type}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Requested {new Date(req.created_at).toLocaleString()}
                                    </span>
                                </div>
                                
                                <h4 style={{ margin: '0 0 10px', color: 'white' }}>{formatPayload(req.action_type, req.payload)}</h4>
                                
                                <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                                        <User size={14} /> Agent: <strong style={{ color: '#a855f7' }}>{req.agent_id}</strong>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                                        <AlertCircle size={14} /> ID: <code style={{ fontSize: '0.7rem' }}>{req.id}</code>
                                    </div>
                                </div>

                                {req.agent_message && (
                                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                                        <MessageSquare size={12} style={{ display: 'inline', marginRight: '6px', color: 'var(--text-muted)' }} />
                                        <span style={{ color: 'var(--text-muted)' }}>Agent context:</span> {req.agent_message}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                                <textarea 
                                    placeholder="Resolution note (optional)"
                                    value={resolvingId === req.id ? resolutionNote : ''}
                                    onChange={(e) => { setResolvingId(req.id); setResolutionNote(e.target.value); }}
                                    style={{
                                        width: '100%', height: '60px', padding: '8px',
                                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '6px', fontSize: '0.75rem', color: 'white', resize: 'none'
                                    }}
                                />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <button 
                                        onClick={() => handleResolve(req.id, 'approved')}
                                        disabled={resolvingId === req.id && resolvingId !== null}
                                        className="btn-primary" 
                                        style={{ fontSize: '0.75rem', padding: '8px', background: '#00ff88', color: '#002010' }}
                                    >
                                        Approve
                                    </button>
                                    <button 
                                        onClick={() => handleResolve(req.id, 'rejected')}
                                        disabled={resolvingId === req.id && resolvingId !== null}
                                        style={{ 
                                            fontSize: '0.75rem', padding: '8px', background: 'rgba(255,77,77,0.1)', 
                                            border: '1px solid #ff4d4d', color: '#ff4d4d', borderRadius: '8px', cursor: 'pointer'
                                        }}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AgentApprovalQueue;
