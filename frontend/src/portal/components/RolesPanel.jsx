import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Shield, Lock, Users, ChevronRight, X, Save, AlertCircle } from 'lucide-react';

const MODULES = ['Players', 'Wallet', 'Bonuses', 'Games', 'Compliance', 'Settings', 'Exports', 'Notes', 'Affiliates', 'Fraud'];
const ACTIONS = ['read', 'write', 'approve', 'export'];

const ACTION_COLORS = {
    read:    { bg: 'rgba(0,204,255,0.1)',   border: 'rgba(0,204,255,0.3)',   text: '#00ccff' },
    write:   { bg: 'rgba(255,165,0,0.1)',   border: 'rgba(255,165,0,0.3)',   text: '#ffa500' },
    approve: { bg: 'rgba(0,255,136,0.1)',   border: 'rgba(0,255,136,0.3)',   text: '#00ff88' },
    export:  { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
};

const scopeKey = (module, action) => `${module.toLowerCase()}:${action}`;

const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', color: 'white', fontSize: '0.9rem', boxSizing: 'border-box',
};

const Toast = ({ toasts, onRemove }) => (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
            <div key={t.id} style={{
                padding: '12px 18px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px',
                background: t.type === 'error' ? 'rgba(255,77,77,0.15)' : t.type === 'warning' ? 'rgba(255,165,0,0.15)' : 'rgba(0,255,136,0.15)',
                border: `1px solid ${t.type === 'error' ? 'rgba(255,77,77,0.4)' : t.type === 'warning' ? 'rgba(255,165,0,0.4)' : 'rgba(0,255,136,0.4)'}`,
                color: t.type === 'error' ? '#ff4d4d' : t.type === 'warning' ? '#ffa500' : '#00ff88',
                backdropFilter: 'blur(12px)', minWidth: '280px', maxWidth: '400px', fontSize: '0.85rem',
            }}>
                <AlertCircle size={16} />
                <span style={{ flex: 1 }}>{t.message}</span>
                <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0', lineHeight: 1 }}>×</button>
            </div>
        ))}
    </div>
);

const RolesPanel = ({ token, user }) => {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState(null);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toasts, setToasts] = useState([]);

    // Edit form state
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editScopes, setEditScopes] = useState(new Set());

    // Create form state
    const [createName, setCreateName] = useState('');
    const [createDescription, setCreateDescription] = useState('');

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    const fetchRoles = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/operator/roles', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setRoles(data.roles || data || []);
            } else {
                // Fallback demo data if endpoint not yet available
                setRoles([
                    { id: '1', name: 'Super Admin', description: 'Full platform access', scopes: MODULES.flatMap(m => ACTIONS.map(a => scopeKey(m, a))), operator_count: 2, is_seed: true },
                    { id: '2', name: 'Compliance Officer', description: 'KYC, fraud and compliance tools', scopes: ['compliance:read','compliance:write','compliance:approve','players:read','fraud:read','fraud:write'], operator_count: 5, is_seed: true },
                    { id: '3', name: 'Customer Support', description: 'Read-only player and wallet access', scopes: ['players:read','wallet:read','notes:read','notes:write'], operator_count: 12, is_seed: false },
                    { id: '4', name: 'Finance', description: 'Wallet and exports access', scopes: ['wallet:read','wallet:write','wallet:approve','exports:read','exports:export'], operator_count: 3, is_seed: false },
                ]);
            }
        } catch {
            setRoles([]);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchRoles(); }, [fetchRoles]);

    const openRole = (role) => {
        setSelectedRole(role);
        setEditName(role.name);
        setEditDescription(role.description || '');
        setEditScopes(new Set(role.scopes || []));
        setShowDrawer(true);
    };

    const toggleScope = (module, action) => {
        if (selectedRole?.is_seed) return;
        const key = scopeKey(module, action);
        setEditScopes(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const body = { name: editName, description: editDescription, scopes: Array.from(editScopes) };
            const url = selectedRole.id === '_new' ? '/api/operator/roles' : `/api/operator/roles/${selectedRole.id}`;
            const method = selectedRole.id === '_new' ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                addToast(`Role "${editName}" saved successfully.`);
                setShowDrawer(false);
                fetchRoles();
            } else {
                const err = await res.json().catch(() => ({}));
                addToast(err.error || 'Failed to save role.', 'error');
            }
        } catch (e) {
            addToast('Network error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (selectedRole?.is_seed) {
            addToast('Seed roles cannot be deleted.', 'warning');
            return;
        }
        if (!confirm(`Delete role "${selectedRole.name}"? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/operator/roles/${selectedRole.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 409) {
                addToast('Cannot delete role: it is assigned to one or more operators.', 'error');
            } else if (res.ok) {
                addToast(`Role "${selectedRole.name}" deleted.`);
                setShowDrawer(false);
                fetchRoles();
            } else {
                const err = await res.json().catch(() => ({}));
                addToast(err.error || 'Failed to delete role.', 'error');
            }
        } catch (e) {
            addToast('Network error: ' + e.message, 'error');
        } finally {
            setDeleting(false);
        }
    };

    const handleCreate = async () => {
        if (!createName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/operator/roles', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: createName.trim(), description: createDescription.trim(), scopes: [] }),
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({ id: '_new_' + Date.now(), name: createName.trim(), description: createDescription.trim(), scopes: [], operator_count: 0, is_seed: false }));
                addToast(`Role "${createName}" created.`);
                setShowCreateForm(false);
                setCreateName('');
                setCreateDescription('');
                fetchRoles();
                // Open the newly created role for editing
                openRole(data);
            } else {
                const err = await res.json().catch(() => ({}));
                addToast(err.error || 'Failed to create role.', 'error');
            }
        } catch (e) {
            addToast('Network error: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ marginTop: 0 }}>
            <Toast toasts={toasts} onRemove={removeToast} />

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-gold, #f59e0b)' }}>
                    <Shield size={20} />
                    <h3 style={{ margin: 0 }}>Roles & Permissions (F14-01)</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={fetchRoles} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                    <button onClick={() => setShowCreateForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                        <Plus size={14} /> Create Role
                    </button>
                </div>
            </div>

            {/* Roles Table */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading roles...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                {['Role Name', 'Description', 'Scopes', 'Operators', 'Type', ''].map(h => (
                                    <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map(role => (
                                <tr key={role.id}
                                    onClick={() => openRole(role)}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                                    className="table-row"
                                >
                                    <td style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {role.is_seed && <Lock size={13} style={{ color: 'var(--accent-gold, #f59e0b)' }} title="Seed role — cannot be deleted" />}
                                            <span style={{ fontWeight: 600, color: 'white' }}>{role.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)', maxWidth: '240px' }}>{role.description || '—'}</td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(0,204,255,0.1)', color: '#00ccff', border: '1px solid rgba(0,204,255,0.25)' }}>
                                            {(role.scopes || []).length} scopes
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)' }}>
                                            <Users size={13} /> {role.operator_count ?? 0}
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {role.is_seed ? (
                                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>Seed</span>
                                        ) : (
                                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>Custom</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                                    </td>
                                </tr>
                            ))}
                            {roles.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No roles defined yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Role Modal */}
            {showCreateForm && (
                <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ width: '420px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: 'white' }}>Create Role</h3>
                            <button onClick={() => setShowCreateForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Role Name *</label>
                            <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. VIP Manager" style={inputStyle} autoFocus />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Description</label>
                            <input type="text" value={createDescription} onChange={e => setCreateDescription(e.target.value)} placeholder="Brief description of this role's purpose" style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreateForm(false)} className="btn-secondary" style={{ padding: '9px 20px' }}>Cancel</button>
                            <button onClick={handleCreate} disabled={!createName.trim() || saving} className="btn-primary" style={{ padding: '9px 20px', opacity: !createName.trim() ? 0.5 : 1 }}>
                                {saving ? 'Creating...' : 'Create & Configure'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Role Edit Drawer */}
            {showDrawer && selectedRole && (
                <div className="modal-overlay" onClick={() => setShowDrawer(false)}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button onClick={() => setShowDrawer(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <X size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                            <Shield size={20} style={{ color: 'var(--accent-gold, #f59e0b)' }} />
                            <h3 style={{ margin: 0, color: 'white' }}>{selectedRole.id === '_new' ? 'New Role' : 'Edit Role'}</h3>
                            {selectedRole.is_seed && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                    <Lock size={11} /> Seed Role
                                </span>
                            )}
                        </div>

                        {/* Name & Description */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Role Name</label>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} disabled={selectedRole.is_seed} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Description</label>
                                <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} style={inputStyle} disabled={selectedRole.is_seed} />
                            </div>
                        </div>

                        {/* Applied to N operators */}
                        <div style={{ marginBottom: '20px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <Users size={15} />
                            Applied to <strong style={{ color: 'white' }}>{selectedRole.operator_count ?? 0}</strong> operator account{selectedRole.operator_count !== 1 ? 's' : ''}
                        </div>

                        {/* Permission Matrix */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permission Matrix</label>
                                {selectedRole.is_seed && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <Lock size={12} /> Locked — seed roles cannot be modified
                                    </span>
                                )}
                            </div>

                            {/* Header row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(4, 1fr)', gap: '6px', marginBottom: '6px' }}>
                                <div />
                                {ACTIONS.map(a => (
                                    <div key={a} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: ACTION_COLORS[a].text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a}</div>
                                ))}
                            </div>

                            {MODULES.map(module => (
                                <div key={module} style={{ display: 'grid', gridTemplateColumns: '160px repeat(4, 1fr)', gap: '6px', marginBottom: '4px', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.82rem', color: 'white', fontWeight: 500, paddingLeft: '4px' }}>{module}</div>
                                    {ACTIONS.map(action => {
                                        const key = scopeKey(module, action);
                                        const checked = editScopes.has(key);
                                        const color = ACTION_COLORS[action];
                                        return (
                                            <div key={action} style={{ display: 'flex', justifyContent: 'center' }}>
                                                <label
                                                    title={selectedRole.is_seed ? 'Seed roles cannot be modified' : `Toggle ${module}:${action}`}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        width: '32px', height: '32px', borderRadius: '6px',
                                                        background: checked ? color.bg : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${checked ? color.border : 'rgba(255,255,255,0.08)'}`,
                                                        cursor: selectedRole.is_seed ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.15s',
                                                        opacity: selectedRole.is_seed ? 0.6 : 1,
                                                    }}
                                                    onClick={() => toggleScope(module, action)}
                                                >
                                                    {checked && <span style={{ fontSize: '0.7rem', color: color.text, fontWeight: 700 }}>✓</span>}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* Active scopes summary */}
                        <div style={{ marginBottom: '20px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {editScopes.size} scope{editScopes.size !== 1 ? 's' : ''} selected
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                            <div>
                                {!selectedRole.is_seed && selectedRole.id !== '_new' && (
                                    <button onClick={handleDelete} disabled={deleting} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '0.85rem' }}>
                                        <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete Role'}
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => setShowDrawer(false)} className="btn-secondary" style={{ padding: '9px 20px' }}>Cancel</button>
                                {!selectedRole.is_seed && (
                                    <button onClick={handleSave} disabled={saving || !editName.trim()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 20px', opacity: !editName.trim() ? 0.5 : 1 }}>
                                        <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RolesPanel;
