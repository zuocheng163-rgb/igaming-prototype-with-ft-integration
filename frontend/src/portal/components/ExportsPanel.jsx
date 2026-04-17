import React, { useState, useEffect, useCallback } from 'react';
import { Download, Plus, Trash2, RefreshCw, Calendar, Clock } from 'lucide-react';

const REPORT_TYPES = [
    { value: 'ggr_by_day', label: 'GGR by Day' },
    { value: 'top_players_deposits', label: 'Top 20 Players by Deposits' },
    { value: 'bonus_exposure', label: 'Bonus Exposure' },
    { value: 'kyc_queue_summary', label: 'KYC Queue Summary' },
    { value: 'player_list', label: 'Player List' },
    { value: 'transaction_log', label: 'Transaction Log' },
];

const STATUS_COLORS = {
    pending: '#ff8800', running: '#00ccff', completed: '#00ff88', failed: '#ff4444'
};

const Toast = ({ toasts }) => (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
            <div key={t.id} style={{
                padding: '12px 16px', borderRadius: '8px', minWidth: '240px',
                background: t.type === 'error' ? '#ff444422' : '#00ff8822',
                border: `1px solid ${t.type === 'error' ? '#ff4444' : '#00ff88'}`,
                color: t.type === 'error' ? '#ff4444' : '#00ff88', fontSize: '13px'
            }}>{t.message}</div>
        ))}
    </div>
);

export const ExportsPanel = ({ token, user }) => {
    const [activeTab, setActiveTab] = useState('now');
    const [reportType, setReportType] = useState('ggr_by_day');
    const [format, setFormat] = useState('csv');
    const [jobs, setJobs] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [exporting, setExporting] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [newSchedule, setNewSchedule] = useState({ report_type: 'ggr_by_day', format: 'csv', cron_expression: '0 9 * * *', destination: 'email:' });

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchJobs = useCallback(async () => {
        try {
            const res = await fetch('/api/operator/exports', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch (_) {}
    }, [token]);

    const fetchSchedules = useCallback(async () => {
        try {
            const res = await fetch('/api/operator/exports/schedules', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setSchedules(data.schedules || []);
        } catch (_) {}
    }, [token]);

    useEffect(() => { fetchJobs(); fetchSchedules(); }, [fetchJobs, fetchSchedules]);

    // Poll running jobs
    useEffect(() => {
        const runningJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');
        if (runningJobs.length === 0) return;
        const interval = setInterval(fetchJobs, 3000);
        return () => clearInterval(interval);
    }, [jobs, fetchJobs]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/operator/exports', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_type: reportType, format, filters: {} })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Export failed');
            addToast('Export started. Check the list below.');
            await fetchJobs();
        } catch (e) {
            addToast(e.message, 'error');
        } finally {
            setExporting(false);
        }
    };

    const handleAddSchedule = async () => {
        try {
            const res = await fetch('/api/operator/exports/schedules', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(newSchedule)
            });
            if (!res.ok) throw new Error('Failed to save schedule');
            addToast('Schedule created');
            setShowScheduleForm(false);
            await fetchSchedules();
        } catch (e) {
            addToast(e.message, 'error');
        }
    };

    const handleDeleteSchedule = async (id) => {
        try {
            await fetch(`/api/operator/exports/schedules/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            addToast('Schedule deleted');
            await fetchSchedules();
        } catch (_) { addToast('Delete failed', 'error'); }
    };

    const cronToHuman = (cron) => {
        const presets = {
            '0 9 * * *': 'Every day at 9:00 AM',
            '0 8 * * 1': 'Every Monday at 8:00 AM',
            '0 0 1 * *': 'First of every month',
            '0 * * * *': 'Every hour',
        };
        return presets[cron] || cron;
    };

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />
            <h2 style={{ color: '#fff', marginBottom: '8px', fontSize: '20px', fontWeight: '700' }}>Reports & Exports</h2>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '24px' }}>
                {[{ id: 'now', label: 'Export Now' }, { id: 'scheduled', label: 'Scheduled Reports' }].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 20px', background: 'none',
                            border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? '#00ccff' : 'transparent'}`,
                            color: activeTab === tab.id ? '#00ccff' : '#888', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'now' && (
                <>
                    {/* Export form */}
                    <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1', minWidth: '200px' }}>
                                <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Report Type</label>
                                <select
                                    value={reportType}
                                    onChange={e => setReportType(e.target.value)}
                                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px' }}
                                >
                                    {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Format</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['csv', 'pdf'].map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setFormat(f)}
                                            style={{
                                                padding: '8px 18px', borderRadius: '6px', cursor: 'pointer',
                                                border: `1px solid ${format === f ? '#00ccff' : 'rgba(255,255,255,0.1)'}`,
                                                background: format === f ? 'rgba(0,204,255,0.15)' : 'transparent',
                                                color: format === f ? '#00ccff' : '#888', fontSize: '13px', textTransform: 'uppercase', fontWeight: '600'
                                            }}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleExport}
                                disabled={exporting}
                                style={{
                                    background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)',
                                    border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#000',
                                    fontWeight: '700', fontSize: '14px', cursor: exporting ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px', opacity: exporting ? 0.7 : 1
                                }}
                            >
                                <Download size={15} />
                                {exporting ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    </div>

                    {/* Recent exports */}
                    <h3 style={{ color: '#aaa', fontSize: '14px', marginBottom: '12px', fontWeight: '600' }}>Recent Exports</h3>
                    {jobs.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '24px' }}>No exports yet</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {jobs.map(job => (
                                <div key={job.id} style={{
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '8px', padding: '12px 16px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
                                            {REPORT_TYPES.find(r => r.value === job.report_type)?.label || job.report_type}
                                        </div>
                                        <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>
                                            {job.format?.toUpperCase()} · {new Date(job.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{
                                            fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px',
                                            color: STATUS_COLORS[job.status], background: `${STATUS_COLORS[job.status]}22`,
                                            textTransform: 'uppercase'
                                        }}>
                                            {job.status === 'running' && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite', marginRight: '4px' }} />}
                                            {job.status}
                                        </span>
                                        {job.status === 'completed' && job.signed_url && (
                                            <a href={job.signed_url} download style={{
                                                background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
                                                borderRadius: '6px', padding: '5px 12px', color: '#00ff88',
                                                fontSize: '12px', textDecoration: 'none', fontWeight: '600'
                                            }}>
                                                Download
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {activeTab === 'scheduled' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ color: '#aaa', fontSize: '14px', margin: 0, fontWeight: '600' }}>Scheduled Reports</h3>
                        <button
                            onClick={() => setShowScheduleForm(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                                background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)',
                                borderRadius: '6px', color: '#00ccff', cursor: 'pointer', fontSize: '13px'
                            }}
                        >
                            <Plus size={14} /> Add Schedule
                        </button>
                    </div>

                    {showScheduleForm && (
                        <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderRadius: '10px', border: '1px solid rgba(0,204,255,0.2)' }}>
                            <h4 style={{ color: '#fff', margin: '0 0 16px', fontSize: '14px' }}>New Scheduled Report</h4>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Report Type</label>
                                        <select value={newSchedule.report_type} onChange={e => setNewSchedule(s => ({ ...s, report_type: e.target.value }))}
                                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px' }}>
                                            {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Format</label>
                                        <select value={newSchedule.format} onChange={e => setNewSchedule(s => ({ ...s, format: e.target.value }))}
                                            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px' }}>
                                            <option value="csv">CSV</option>
                                            <option value="pdf">PDF</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Cron Expression</label>
                                    <input value={newSchedule.cron_expression} onChange={e => setNewSchedule(s => ({ ...s, cron_expression: e.target.value }))}
                                        placeholder="0 9 * * *"
                                        style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                                    <div style={{ color: '#888', fontSize: '11px', marginTop: '3px' }}>{cronToHuman(newSchedule.cron_expression)}</div>
                                </div>
                                <div>
                                    <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Destination</label>
                                    <input value={newSchedule.destination} onChange={e => setNewSchedule(s => ({ ...s, destination: e.target.value }))}
                                        placeholder="email:ops@example.com or slack:#reports"
                                        style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setShowScheduleForm(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                                    <button onClick={handleAddSchedule} style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)', border: 'none', borderRadius: '6px', color: '#000', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>Save Schedule</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {schedules.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '24px' }}>No schedules configured</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {schedules.map(s => (
                                <div key={s.id} style={{
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '8px', padding: '12px 16px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
                                            {REPORT_TYPES.find(r => r.value === s.report_type)?.label || s.report_type}
                                        </div>
                                        <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>
                                            <Clock size={11} style={{ marginRight: '3px' }} />
                                            {cronToHuman(s.cron_expression)} · → {s.destination}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', color: s.enabled ? '#00ff88' : '#888' }}>{s.enabled ? 'Active' : 'Paused'}</span>
                                        <button onClick={() => handleDeleteSchedule(s.id)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ExportsPanel;
