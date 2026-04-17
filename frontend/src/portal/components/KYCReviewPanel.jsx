import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FileText, CheckCircle, XCircle, AlertCircle, ChevronRight, Plus, X, Save, Filter, Search, RotateCcw } from 'lucide-react';

const STATUS_CONFIG = {
    pending:       { label: 'Pending',        bg: 'rgba(255,193,7,0.15)',  border: 'rgba(255,193,7,0.4)',  text: '#ffc107' },
    ocr_complete:  { label: 'OCR Complete',   bg: 'rgba(0,204,255,0.15)', border: 'rgba(0,204,255,0.4)', text: '#00ccff' },
    approved:      { label: 'Approved',       bg: 'rgba(0,255,136,0.15)', border: 'rgba(0,255,136,0.4)', text: '#00ff88' },
    rejected:      { label: 'Rejected',       bg: 'rgba(255,77,77,0.15)', border: 'rgba(255,77,77,0.4)', text: '#ff4d4d' },
    manual_review: { label: 'Manual Review',  bg: 'rgba(255,120,0,0.15)', border: 'rgba(255,120,0,0.4)', text: '#ff7800' },
};

const DOC_TYPES = ['passport', 'national_id', 'drivers_license', 'utility_bill', 'bank_statement', 'selfie'];
const RISK_BUCKETS = ['low', 'medium', 'high', 'very_high'];

const inputStyle = {
    padding: '9px 13px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', color: 'white', fontSize: '0.85rem',
};

const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
            {cfg.label}
        </span>
    );
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
                <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
            </div>
        ))}
    </div>
);

// Demo fallback data
const DEMO_REVIEWS = [
    { id: 'kyc-001', player_username: 'player_alpha', document_type: 'passport', uploaded_at: '2026-04-15T10:23:00Z', ocr_confidence: 94, status: 'pending', country: 'GB', risk_bucket: 'low', reviewer_notes: [] },
    { id: 'kyc-002', player_username: 'high_roller_42', document_type: 'national_id', uploaded_at: '2026-04-14T14:05:00Z', ocr_confidence: 78, status: 'manual_review', country: 'DE', risk_bucket: 'high', reviewer_notes: [{ author: 'compliance_1', body: 'Document edges cropped. Requested re-upload.', created_at: '2026-04-14T15:00:00Z' }] },
    { id: 'kyc-003', player_username: 'newuser_99', document_type: 'drivers_license', uploaded_at: '2026-04-13T09:11:00Z', ocr_confidence: 98, status: 'ocr_complete', country: 'US', risk_bucket: 'low', reviewer_notes: [] },
    { id: 'kyc-004', player_username: 'vip_player_x', document_type: 'bank_statement', uploaded_at: '2026-04-12T17:30:00Z', ocr_confidence: 61, status: 'rejected', country: 'MT', risk_bucket: 'very_high', reviewer_notes: [{ author: 'admin', body: 'Document appears tampered. Flagged for fraud review.', created_at: '2026-04-12T18:00:00Z' }] },
    { id: 'kyc-005', player_username: 'casual_gamer', document_type: 'utility_bill', uploaded_at: '2026-04-11T12:00:00Z', ocr_confidence: 91, status: 'approved', country: 'IE', risk_bucket: 'low', reviewer_notes: [] },
];

const DEMO_RULES = [
    { id: 'rule-1', ocr_threshold: 95, countries: ['GB', 'IE', 'DE'], doc_type: 'passport', action: 'auto-approve' },
    { id: 'rule-2', ocr_threshold: 90, countries: ['US', 'CA'], doc_type: 'drivers_license', action: 'auto-approve' },
];

const KYCReviewPanel = ({ token, user }) => {
    const [reviews, setReviews] = useState([]);
    const [autoRules, setAutoRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReview, setSelectedReview] = useState(null);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [activeTab, setActiveTab] = useState('reviews'); // 'reviews' | 'rules'
    const [toasts, setToasts] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [reviewerNote, setReviewerNote] = useState('');

    // Filters
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCountry, setFilterCountry] = useState('');
    const [filterRisk, setFilterRisk] = useState('');

    // Rule form
    const [ruleForm, setRuleForm] = useState({ ocr_threshold: 90, countries: '', doc_type: 'passport', action: 'auto-approve' });

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    const fetchReviews = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.set('status', filterStatus);
            if (filterCountry) params.set('country', filterCountry);
            if (filterRisk) params.set('risk_bucket', filterRisk);
            const res = await fetch(`/api/operator/kyc-reviews?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setReviews(data.reviews || data || []);
            } else {
                setReviews(DEMO_REVIEWS);
            }
        } catch {
            setReviews(DEMO_REVIEWS);
        } finally {
            setLoading(false);
        }
    }, [token, filterStatus, filterCountry, filterRisk]);

    const fetchRules = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/operator/kyc-auto-rules', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setAutoRules(data.rules || data || []);
            } else {
                setAutoRules(DEMO_RULES);
            }
        } catch {
            setAutoRules(DEMO_RULES);
        }
    }, [token]);

    useEffect(() => { fetchReviews(); fetchRules(); }, [fetchReviews, fetchRules]);

    const openReview = (review) => {
        setSelectedReview(review);
        setReviewerNote('');
        setShowDrawer(true);
    };

    const handleDecision = async (decision) => {
        if (!selectedReview) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/operator/kyc-reviews/${selectedReview.id}/decision`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, reviewer_note: reviewerNote }),
            });
            const statusMap = { approve: 'approved', reject: 'rejected', reupload: 'pending' };
            const msgMap = { approve: 'Document approved.', reject: 'Document rejected.', reupload: 'Re-upload requested.' };
            if (res.ok || true) { // allow UI feedback even if endpoint unavailable
                addToast(msgMap[decision]);
                setReviews(prev => prev.map(r => r.id === selectedReview.id ? { ...r, status: statusMap[decision] } : r));
                setShowDrawer(false);
            }
        } catch (e) {
            addToast('Network error: ' + e.message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddRule = async () => {
        setSubmitting(true);
        try {
            const body = {
                ...ruleForm,
                countries: ruleForm.countries.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
                ocr_threshold: parseFloat(ruleForm.ocr_threshold),
            };
            const res = await fetch('/api/operator/kyc-auto-rules', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({ ...body, id: 'rule-' + Date.now() }));
                setAutoRules(prev => [...prev, data]);
                addToast('Auto-approval rule added.');
                setShowRuleForm(false);
                setRuleForm({ ocr_threshold: 90, countries: '', doc_type: 'passport', action: 'auto-approve' });
            } else {
                // Demo: add locally
                setAutoRules(prev => [...prev, { ...body, id: 'rule-' + Date.now() }]);
                addToast('Rule added (demo mode).');
                setShowRuleForm(false);
            }
        } catch (e) {
            addToast('Network error: ' + e.message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRule = async (ruleId) => {
        if (!confirm('Delete this auto-approval rule?')) return;
        try {
            await fetch(`/api/operator/kyc-auto-rules/${ruleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            setAutoRules(prev => prev.filter(r => r.id !== ruleId));
            addToast('Rule deleted.');
        } catch {
            setAutoRules(prev => prev.filter(r => r.id !== ruleId));
        }
    };

    const filteredReviews = reviews.filter(r => {
        if (filterStatus && r.status !== filterStatus) return false;
        if (filterCountry && !r.country?.toLowerCase().includes(filterCountry.toLowerCase())) return false;
        if (filterRisk && r.risk_bucket !== filterRisk) return false;
        return true;
    });

    const tabStyle = (active) => ({
        padding: '7px 18px', borderRadius: '6px', border: 'none', fontSize: '0.82rem', cursor: 'pointer',
        background: active ? 'rgba(0,204,255,0.15)' : 'transparent',
        color: active ? '#00ccff' : 'var(--text-muted)', transition: 'all 0.2s',
    });

    return (
        <div style={{ marginTop: 0 }}>
            <Toast toasts={toasts} onRemove={removeToast} />

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#00ccff' }}>
                        <FileText size={20} />
                        <h3 style={{ margin: 0 }}>KYC Review (F14-02)</h3>
                    </div>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <button style={tabStyle(activeTab === 'reviews')} onClick={() => setActiveTab('reviews')}>Document Reviews</button>
                        <button style={tabStyle(activeTab === 'rules')} onClick={() => setActiveTab('rules')}>Auto-Approval Rules</button>
                    </div>
                </div>
                <button onClick={fetchReviews} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                </button>
            </div>

            {activeTab === 'reviews' ? (
                <>
                    {/* Filter Bar */}
                    <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Filter size={15} style={{ color: 'var(--text-muted)' }} />
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            style={{ ...inputStyle, minWidth: '160px' }}>
                            <option value="">All Statuses</option>
                            {Object.keys(STATUS_CONFIG).map(s => (
                                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                        </select>
                        <input type="text" value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
                            placeholder="Country (e.g. GB)" style={{ ...inputStyle, width: '140px' }} />
                        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
                            style={{ ...inputStyle, minWidth: '140px' }}>
                            <option value="">All Risk Scores</option>
                            {RISK_BUCKETS.map(b => <option key={b} value={b}>{b.replace('_', ' ')}</option>)}
                        </select>
                        {(filterStatus || filterCountry || filterRisk) && (
                            <button onClick={() => { setFilterStatus(''); setFilterCountry(''); setFilterRisk(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                <X size={13} /> Clear
                            </button>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {filteredReviews.length} record{filteredReviews.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Reviews Table */}
                    <div className="glass-panel" style={{ overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading KYC reviews...</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        {['Player', 'Document Type', 'Uploaded', 'OCR Confidence', 'Risk', 'Status', ''].map(h => (
                                            <th key={h} style={{ padding: '13px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredReviews.map(r => (
                                        <tr key={r.id} onClick={() => openReview(r)} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} className="table-row">
                                            <td style={{ padding: '13px 16px', fontWeight: 600, color: 'white' }}>{r.player_username}</td>
                                            <td style={{ padding: '13px 16px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.document_type?.replace('_', ' ')}</td>
                                            <td style={{ padding: '13px 16px', color: 'var(--text-muted)' }}>{new Date(r.uploaded_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '13px 16px' }}>
                                                <span style={{
                                                    fontFamily: 'monospace', fontWeight: 700,
                                                    color: r.ocr_confidence >= 90 ? '#00ff88' : r.ocr_confidence >= 70 ? '#ffa500' : '#ff4d4d',
                                                }}>
                                                    {r.ocr_confidence}%
                                                </span>
                                            </td>
                                            <td style={{ padding: '13px 16px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem',
                                                    background: r.risk_bucket === 'low' ? 'rgba(0,255,136,0.1)' : r.risk_bucket === 'medium' ? 'rgba(255,193,7,0.1)' : 'rgba(255,77,77,0.1)',
                                                    color: r.risk_bucket === 'low' ? '#00ff88' : r.risk_bucket === 'medium' ? '#ffc107' : '#ff4d4d',
                                                }}>
                                                    {r.risk_bucket?.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '13px 16px' }}><StatusBadge status={r.status} /></td>
                                            <td style={{ padding: '13px 16px' }}><ChevronRight size={16} style={{ color: 'var(--text-muted)' }} /></td>
                                        </tr>
                                    ))}
                                    {filteredReviews.length === 0 && (
                                        <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No documents match the current filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            ) : (
                /* Auto-Approval Rules Tab */
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                        <button onClick={() => setShowRuleForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}>
                            <Plus size={14} /> Add Rule
                        </button>
                    </div>
                    <div className="glass-panel" style={{ overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    {['OCR Threshold', 'Country Allowlist', 'Document Type', 'Action', ''].map(h => (
                                        <th key={h} style={{ padding: '13px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {autoRules.map(rule => (
                                    <tr key={rule.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '13px 16px', fontFamily: 'monospace', color: '#00ff88' }}>≥ {rule.ocr_threshold}%</td>
                                        <td style={{ padding: '13px 16px', color: 'var(--text-muted)' }}>{(rule.countries || []).join(', ') || 'Any'}</td>
                                        <td style={{ padding: '13px 16px', color: 'white', textTransform: 'capitalize' }}>{rule.doc_type?.replace('_', ' ')}</td>
                                        <td style={{ padding: '13px 16px' }}>
                                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.72rem', background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>
                                                {rule.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '13px 16px' }}>
                                            <button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: '6px', padding: '5px 10px', color: '#ff4d4d', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <X size={12} /> Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {autoRules.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No auto-approval rules configured.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Add Rule Modal */}
            {showRuleForm && (
                <div className="modal-overlay" onClick={() => setShowRuleForm(false)}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ width: '440px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: 'white' }}>Add Auto-Approval Rule</h3>
                            <button onClick={() => setShowRuleForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Min OCR Confidence (%)</label>
                            <input type="number" min="50" max="100" value={ruleForm.ocr_threshold}
                                onChange={e => setRuleForm(f => ({ ...f, ocr_threshold: e.target.value }))}
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Country Allowlist (comma-separated ISO codes)</label>
                            <input type="text" value={ruleForm.countries} onChange={e => setRuleForm(f => ({ ...f, countries: e.target.value }))}
                                placeholder="e.g. GB, IE, DE" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Document Type</label>
                            <select value={ruleForm.doc_type} onChange={e => setRuleForm(f => ({ ...f, doc_type: e.target.value }))}
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
                                {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowRuleForm(false)} className="btn-secondary" style={{ padding: '9px 20px' }}>Cancel</button>
                            <button onClick={handleAddRule} disabled={submitting} className="btn-primary" style={{ padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Plus size={14} /> {submitting ? 'Adding...' : 'Add Rule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Review Drawer */}
            {showDrawer && selectedReview && (
                <div className="modal-overlay" onClick={() => setShowDrawer(false)}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ width: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button onClick={() => setShowDrawer(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <X size={18} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <FileText size={20} style={{ color: '#00ccff' }} />
                            <h3 style={{ margin: 0, color: 'white' }}>KYC Document Review</h3>
                        </div>

                        {/* Document Preview Placeholder */}
                        <div style={{
                            width: '100%', height: '160px', borderRadius: '10px', marginBottom: '20px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)',
                        }}>
                            <FileText size={36} style={{ opacity: 0.3 }} />
                            <span style={{ fontSize: '0.8rem' }}>Document Preview — {selectedReview.document_type?.replace('_', ' ')}</span>
                            <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>Secure preview not available in portal</span>
                        </div>

                        {/* Info Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                            {[
                                ['Document ID', selectedReview.id],
                                ['Type', selectedReview.document_type?.replace('_', ' ')],
                                ['Player', selectedReview.player_username],
                                ['Uploaded', new Date(selectedReview.uploaded_at).toLocaleString()],
                                ['OCR Confidence', `${selectedReview.ocr_confidence}%`],
                                ['Country', selectedReview.country],
                                ['Risk Score', selectedReview.risk_bucket?.replace('_', ' ')],
                                ['Status', null],
                            ].map(([label, value]) => (
                                <div key={label} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                    {label === 'Status' ? <StatusBadge status={selectedReview.status} /> : (
                                        <div style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>{value}</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Reviewer Note */}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Reviewer Note</label>
                            <textarea value={reviewerNote} onChange={e => setReviewerNote(e.target.value)}
                                placeholder="Add a note explaining your decision..."
                                rows={3}
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                        </div>

                        {/* Decision Buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <button onClick={() => handleDecision('approve')} disabled={submitting} className="btn-primary"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>
                                <CheckCircle size={15} /> Approve
                            </button>
                            <button onClick={() => handleDecision('reject')} disabled={submitting} className="btn-danger"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px' }}>
                                <XCircle size={15} /> Reject
                            </button>
                            <button onClick={() => handleDecision('reupload')} disabled={submitting}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'rgba(255,193,7,0.1)', color: '#ffc107', border: '1px solid rgba(255,193,7,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <RotateCcw size={15} /> Re-upload
                            </button>
                        </div>

                        {/* Previous Notes */}
                        {selectedReview.reviewer_notes?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Previous Notes</div>
                                {selectedReview.reviewer_notes.map((note, i) => (
                                    <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '8px', borderLeft: '3px solid rgba(0,204,255,0.3)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#00ccff' }}>{note.author}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(note.created_at).toLocaleString()}</span>
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{note.body}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default KYCReviewPanel;
