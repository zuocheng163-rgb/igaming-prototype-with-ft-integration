import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Download } from 'lucide-react';

const RISK_BANDS = [
    { min: 0, max: 25, color: '#00ff8844', label: 'Low', textColor: '#00ff88' },
    { min: 25, max: 50, color: '#ffd70033', label: 'Medium', textColor: '#ffd700' },
    { min: 50, max: 75, color: '#ff880033', label: 'High', textColor: '#ff8800' },
    { min: 75, max: 100, color: '#ff444433', label: 'Critical', textColor: '#ff4444' },
];

const EVENT_TYPE_COLORS = {
    kyc_submitted: '#00ccff', alert_fired: '#ff4444', remediation: '#00ff88',
    restriction: '#ff8800', login: '#888', deposit: '#ffd700'
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const score = payload[0]?.value;
    const band = RISK_BANDS.find(b => score >= b.min && score < b.max) || RISK_BANDS[RISK_BANDS.length - 1];
    return (
        <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ color: '#aaa', fontSize: '12px', margin: '0 0 4px' }}>{label}</p>
            <p style={{ color: band.textColor, margin: 0, fontWeight: '700', fontSize: '15px' }}>
                Score: {score} <span style={{ fontSize: '12px' }}>({band.label})</span>
            </p>
        </div>
    );
};

export const TrustTimeline = ({ playerId, token }) => {
    const [data, setData] = useState({ scores: [], events: [] });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        if (!playerId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/operator/players/${playerId}/trust-timeline`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await res.json();
            setData(d);
        } catch (_) {} finally { setLoading(false); }
    }, [playerId, token]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/operator/exports', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_type: 'trust_timeline', filters: { player_id: playerId }, format: 'pdf' })
            });
            const d = await res.json();
            if (d.job_id) window.open(`/api/operator/exports/${d.job_id}/download`, '_blank');
        } catch (_) {} finally { setExporting(false); }
    };

    const scores = data.scores || [];
    const events = data.events || [];

    // Merge scores with event timestamps for pins
    const chartData = scores.map(s => ({
        date: new Date(s.ts).toLocaleDateString(),
        score: s.score,
    }));

    const getBandColor = (score) => {
        const band = RISK_BANDS.find(b => score >= b.min && score < b.max);
        return band?.textColor || '#ff4444';
    };

    return (
        <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h4 style={{ color: '#fff', margin: '0 0 3px', fontSize: '15px', fontWeight: '600' }}>Trust Score Timeline</h4>
                    <p style={{ color: '#888', margin: 0, fontSize: '12px' }}>12-month composite risk score history</p>
                </div>
                <button onClick={handleExport} disabled={exporting}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#aaa', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                    <Download size={13} /> {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
            </div>

            {/* Risk band legend */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {RISK_BANDS.map(band => (
                    <div key={band.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
                        <div style={{ width: '12px', height: '12px', background: band.color, borderRadius: '2px', border: `1px solid ${band.textColor}66` }} />
                        <span style={{ color: band.textColor }}>{band.label} (0–{band.max})</span>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading timeline...</div>
            ) : chartData.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                    No trust score history available
                </div>
            ) : (
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData}>
                            {/* Risk bands */}
                            {RISK_BANDS.map(band => (
                                <ReferenceArea key={band.label} y1={band.min} y2={band.max} fill={band.color} fillOpacity={0.5} />
                            ))}
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" stroke="#555" tick={{ fill: '#888', fontSize: 10 }} />
                            <YAxis domain={[0, 100]} stroke="#555" tick={{ fill: '#888', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            {/* Event pins */}
                            {events.map(ev => (
                                <ReferenceLine
                                    key={ev.ts}
                                    x={new Date(ev.ts).toLocaleDateString()}
                                    stroke={EVENT_TYPE_COLORS[ev.type] || '#888'}
                                    strokeDasharray="4 2"
                                    strokeOpacity={0.7}
                                />
                            ))}
                            <Line type="monotone" dataKey="score" stroke="#00ccff" strokeWidth={2.5} dot={{ r: 3, fill: '#00ccff' }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Event list */}
            {events.length > 0 && (
                <>
                    <h5 style={{ color: '#aaa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Events</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '180px', overflowY: 'auto' }}>
                        {events.map((ev, i) => (
                            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '7px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: EVENT_TYPE_COLORS[ev.type] || '#888', flexShrink: 0, marginTop: '4px' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#ddd', fontSize: '13px' }}>{ev.description}</div>
                                    <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
                                        {new Date(ev.ts).toLocaleString()}
                                        {ev.audit_id && <span style={{ color: '#00ccff', marginLeft: '6px', cursor: 'pointer' }}>→ Audit #{ev.audit_id.slice(0, 8)}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default TrustTimeline;
