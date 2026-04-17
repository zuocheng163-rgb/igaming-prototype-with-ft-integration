import React, { useState, useEffect, useCallback } from 'react';
import { Search, Upload, Globe, ChevronRight } from 'lucide-react';

// ISO 3166-1 alpha-2 subset (most common ~50 countries)
const COUNTRIES = [
  { code: 'DE', name: 'Germany' }, { code: 'GB', name: 'United Kingdom' }, { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'FI', name: 'Finland' },
  { code: 'DK', name: 'Denmark' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgium' }, { code: 'CH', name: 'Switzerland' },
  { code: 'IE', name: 'Ireland' }, { code: 'CZ', name: 'Czech Republic' }, { code: 'RO', name: 'Romania' },
  { code: 'HU', name: 'Hungary' }, { code: 'GR', name: 'Greece' }, { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' }, { code: 'SK', name: 'Slovakia' }, { code: 'SI', name: 'Slovenia' },
  { code: 'LT', name: 'Lithuania' }, { code: 'LV', name: 'Latvia' }, { code: 'EE', name: 'Estonia' },
  { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'JP', name: 'Japan' }, { code: 'KR', name: 'South Korea' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' }, { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' }, { code: 'CO', name: 'Colombia' }, { code: 'PE', name: 'Peru' },
  { code: 'ZA', name: 'South Africa' }, { code: 'NG', name: 'Nigeria' }, { code: 'KE', name: 'Kenya' },
  { code: 'IN', name: 'India' }, { code: 'PK', name: 'Pakistan' }, { code: 'BD', name: 'Bangladesh' },
  { code: 'TH', name: 'Thailand' }, { code: 'PH', name: 'Philippines' }, { code: 'VN', name: 'Vietnam' },
  { code: 'MY', name: 'Malaysia' }, { code: 'SG', name: 'Singapore' }, { code: 'ID', name: 'Indonesia' },
];

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

export const CountryRulesPanel = ({ token, user }) => {
    const [search, setSearch] = useState('');
    const [rules, setRules] = useState({});
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [drawerData, setDrawerData] = useState({});
    const [saving, setSaving] = useState(false);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchRules = useCallback(async () => {
        try {
            const res = await fetch('/api/operator/countries', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            const map = {};
            (data.rules || []).forEach(r => { map[r.country_code] = r; });
            setRules(map);
        } catch (_) {}
    }, [token]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const openDrawer = (country) => {
        setSelectedCountry(country);
        const existing = rules[country.code] || {};
        setDrawerData({
            currency: existing.currency || '',
            locale: existing.locale || '',
            odds_format: existing.odds_format || 'decimal',
            max_stake: existing.max_stake || '',
            blocked_game_ids: (existing.blocked_game_ids || []).join(', '),
            rg_overrides: JSON.stringify(existing.rg_overrides || {}, null, 2),
        });
    };

    const handleSave = async () => {
        if (!selectedCountry) return;
        setSaving(true);
        try {
            const payload = {
                currency: drawerData.currency || null,
                locale: drawerData.locale || null,
                odds_format: drawerData.odds_format || null,
                max_stake: drawerData.max_stake ? parseFloat(drawerData.max_stake) : null,
                blocked_game_ids: drawerData.blocked_game_ids ? drawerData.blocked_game_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
                rg_overrides: (() => { try { return JSON.parse(drawerData.rg_overrides || '{}'); } catch { return {}; } })()
            };
            const res = await fetch(`/api/operator/countries/${selectedCountry.code}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Save failed');
            addToast(`${selectedCountry.name} rules saved`);
            await fetchRules();
            setSelectedCountry(null);
        } catch (e) {
            addToast(e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        try {
            const res = await fetch('/api/operator/countries/import', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: form
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');
            addToast(`Imported ${data.imported || 0} country rules`);
            await fetchRules();
        } catch (e) {
            addToast(e.message, 'error');
        }
    };

    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
    );

    const Field = ({ label, value, onChange, placeholder, type = 'text', children }) => (
        <div style={{ marginBottom: '14px' }}>
            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>{label}</label>
            {children || (
                <input
                    type={type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', outline: 'none' }}
                />
            )}
            {!value && <span style={{ color: '#555', fontSize: '11px' }}>inherited from tenant default</span>}
        </div>
    );

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0 }}>Country Rules</h2>
                <label style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '13px'
                }}>
                    <Upload size={14} /> Import CSV
                    <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
                </label>
            </div>

            <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search countries..."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px 10px 38px', color: '#fff', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '520px', overflowY: 'auto' }}>
                {filtered.map(country => {
                    const hasRules = !!rules[country.code];
                    return (
                        <button
                            key={country.code}
                            onClick={() => openDrawer(country)}
                            style={{
                                background: hasRules ? 'rgba(0,204,255,0.04)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${hasRules ? 'rgba(0,204,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: '7px', padding: '10px 14px', cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                color: '#fff', textAlign: 'left', transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,204,255,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = hasRules ? 'rgba(0,204,255,0.2)' : 'rgba(255,255,255,0.05)'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#aaa', fontSize: '13px', minWidth: '28px' }}>{country.code}</span>
                                <span style={{ fontSize: '14px' }}>{country.name}</span>
                                {!hasRules && <span style={{ fontSize: '11px', color: '#555', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>inherited</span>}
                                {hasRules && rules[country.code]?.currency && (
                                    <span style={{ fontSize: '11px', color: '#00ccff', background: 'rgba(0,204,255,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                        {rules[country.code].currency}
                                    </span>
                                )}
                            </div>
                            <ChevronRight size={14} color="#555" />
                        </button>
                    );
                })}
            </div>

            {/* Drawer */}
            {selectedCountry && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
                    onClick={() => setSelectedCountry(null)}>
                    <div style={{ width: '440px', height: '100%', background: '#0d0d1a', borderLeft: '1px solid rgba(255,255,255,0.07)', overflow: 'auto', padding: '24px' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ color: '#fff', margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Globe size={18} color="#00ccff" /> {selectedCountry.name} ({selectedCountry.code})
                            </h3>
                            <button onClick={() => setSelectedCountry(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        </div>

                        <Field label="Currency" value={drawerData.currency} onChange={v => setDrawerData(d => ({ ...d, currency: v }))} placeholder="EUR" />
                        <Field label="Locale" value={drawerData.locale} onChange={v => setDrawerData(d => ({ ...d, locale: v }))} placeholder="en-GB" />
                        <Field label="Max Stake (€)" value={drawerData.max_stake} onChange={v => setDrawerData(d => ({ ...d, max_stake: v }))} placeholder="1000" type="number" />

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Odds Format</label>
                            <select value={drawerData.odds_format} onChange={e => setDrawerData(d => ({ ...d, odds_format: e.target.value }))}
                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '13px' }}>
                                <option value="decimal">Decimal (e.g. 2.50)</option>
                                <option value="fractional">Fractional (e.g. 3/2)</option>
                                <option value="american">American (e.g. +150)</option>
                            </select>
                        </div>

                        <Field label="Blocked Game IDs (comma-separated)" value={drawerData.blocked_game_ids} onChange={v => setDrawerData(d => ({ ...d, blocked_game_ids: v }))} placeholder="pragmatic:sweet-bonanza, netent:starburst" />

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>RG Overrides (JSON)</label>
                            <textarea
                                value={drawerData.rg_overrides}
                                onChange={e => setDrawerData(d => ({ ...d, rg_overrides: e.target.value }))}
                                rows={4}
                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '12px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleSave} disabled={saving}
                                style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Saving...' : 'Save Rules'}
                            </button>
                            <button onClick={() => setDrawerData({ currency: '', locale: '', odds_format: 'decimal', max_stake: '', blocked_game_ids: '', rg_overrides: '{}' })}
                                style={{ padding: '11px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#888', cursor: 'pointer', fontSize: '13px' }}>
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CountryRulesPanel;
