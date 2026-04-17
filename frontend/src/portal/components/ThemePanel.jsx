import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, Tablet, Check, Upload } from 'lucide-react';

const PRESETS = [
    { name: 'Midnight', primary: '#0a0a1a', accent: '#00ccff', gold: '#ffd700', preview: ['#0a0a1a', '#00ccff', '#ffd700'] },
    { name: 'Gold Rush', primary: '#1a1000', accent: '#ffd700', gold: '#ff8c00', preview: ['#1a1000', '#ffd700', '#ff8c00'] },
    { name: 'Neon City', primary: '#0d0d0d', accent: '#ff00ff', gold: '#00ff88', preview: ['#0d0d0d', '#ff00ff', '#00ff88'] },
    { name: 'Arctic', primary: '#0a1628', accent: '#48cae4', gold: '#ffffff', preview: ['#0a1628', '#48cae4', '#90e0ef'] },
    { name: 'Volcano', primary: '#1a0505', accent: '#ff4500', gold: '#ffd700', preview: ['#1a0505', '#ff4500', '#ffd700'] },
    { name: 'Forest', primary: '#051a0a', accent: '#00c851', gold: '#ffd700', preview: ['#051a0a', '#00c851', '#ffd700'] },
    { name: 'Royal Purple', primary: '#0f0520', accent: '#9b59b6', gold: '#f1c40f', preview: ['#0f0520', '#9b59b6', '#f1c40f'] },
    { name: 'Chrome', primary: '#1a1a1a', accent: '#e0e0e0', gold: '#c0c0c0', preview: ['#1a1a1a', '#c0c0c0', '#e0e0e0'] },
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

export const ThemePanel = ({ token, user }) => {
    const [selectedPreset, setSelectedPreset] = useState('Midnight');
    const [customPrimary, setCustomPrimary] = useState('');
    const [customAccent, setCustomAccent] = useState('');
    const [customFont, setCustomFont] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [bgImageUrl, setBgImageUrl] = useState('');
    const [previewDevice, setPreviewDevice] = useState('desktop');
    const [saving, setSaving] = useState(false);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchTheme = useCallback(async () => {
        try {
            const res = await fetch('/api/operator/settings/theme', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (data.theme?.preset_name) setSelectedPreset(data.theme.preset_name);
            const tokens = data.theme?.custom_tokens || {};
            setCustomPrimary(tokens['--color-primary'] || '');
            setCustomAccent(tokens['--color-accent'] || '');
            setCustomFont(tokens['--font-family'] || '');
            setLogoUrl(data.theme?.logo_url || '');
            setBgImageUrl(data.theme?.background_image_url || '');
        } catch (_) {}
    }, [token]);

    useEffect(() => { fetchTheme(); }, [fetchTheme]);

    const handleSave = async () => {
        setSaving(true);
        const customTokens = {};
        if (customPrimary) customTokens['--color-primary'] = customPrimary;
        if (customAccent) customTokens['--color-accent'] = customAccent;
        if (customFont) customTokens['--font-family'] = customFont;
        try {
            const res = await fetch('/api/operator/settings/theme', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ preset_name: selectedPreset, custom_tokens: customTokens, logo_url: logoUrl, background_image_url: bgImageUrl })
            });
            if (!res.ok) throw new Error('Failed to save theme');
            addToast('Theme saved and will be live within 90 seconds');
        } catch (e) { addToast(e.message, 'error'); }
        finally { setSaving(false); }
    };

    const currentPreset = PRESETS.find(p => p.name === selectedPreset) || PRESETS[0];
    const effectivePrimary = customPrimary || currentPreset.primary;
    const effectiveAccent = customAccent || currentPreset.accent;

    const deviceFrames = [
        { id: 'mobile', icon: Smartphone, label: '375px', width: '160px' },
        { id: 'tablet', icon: Tablet, label: '768px', width: '200px' },
        { id: 'desktop', icon: Monitor, label: '1280px', width: '240px' },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />

            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Theme Picker</h2>

            {/* Preset Grid */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Presets</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '28px' }}>
                {PRESETS.map(preset => (
                    <button
                        key={preset.name}
                        onClick={() => setSelectedPreset(preset.name)}
                        style={{
                            background: '#1a1a2e', border: `2px solid ${selectedPreset === preset.name ? '#00ccff' : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: '10px', padding: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative'
                        }}
                    >
                        {selectedPreset === preset.name && (
                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#00ccff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={11} color="#000" />
                            </div>
                        )}
                        {/* Color swatches */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                            {preset.preview.map((color, i) => (
                                <div key={i} style={{ width: '24px', height: '24px', borderRadius: '4px', background: color, border: '1px solid rgba(255,255,255,0.1)' }} />
                            ))}
                        </div>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{preset.name}</div>
                    </button>
                ))}
            </div>

            {/* Custom Overrides */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom Overrides</h3>
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Primary Color</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={customPrimary || currentPreset.primary} onChange={e => setCustomPrimary(e.target.value)}
                                style={{ width: '40px', height: '36px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }} />
                            <input value={customPrimary} onChange={e => setCustomPrimary(e.target.value)} placeholder={currentPreset.primary}
                                style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', fontFamily: 'monospace' }} />
                        </div>
                    </div>
                    <div>
                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Accent Color</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={customAccent || currentPreset.accent} onChange={e => setCustomAccent(e.target.value)}
                                style={{ width: '40px', height: '36px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }} />
                            <input value={customAccent} onChange={e => setCustomAccent(e.target.value)} placeholder={currentPreset.accent}
                                style={{ flex: 1, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', fontFamily: 'monospace' }} />
                        </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Font Family</label>
                        <input value={customFont} onChange={e => setCustomFont(e.target.value)} placeholder="Inter, sans-serif"
                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Logo URL</label>
                        <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://cdn.example.com/logo.png"
                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Background Image URL</label>
                        <input value={bgImageUrl} onChange={e => setBgImageUrl(e.target.value)} placeholder="https://cdn.example.com/bg.jpg"
                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                </div>
            </div>

            {/* Preview */}
            <h3 style={{ color: '#aaa', fontSize: '13px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preview</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {deviceFrames.map(d => (
                    <button key={d.id} onClick={() => setPreviewDevice(d.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '6px', border: `1px solid ${previewDevice === d.id ? '#00ccff' : 'rgba(255,255,255,0.1)'}`, background: previewDevice === d.id ? 'rgba(0,204,255,0.1)' : 'transparent', color: previewDevice === d.id ? '#00ccff' : '#888', cursor: 'pointer', fontSize: '12px' }}>
                        <d.icon size={14} /> {d.label}
                    </button>
                ))}
            </div>
            <div style={{ background: '#0a0a0f', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'center', minHeight: '160px', alignItems: 'center' }}>
                <div style={{
                    background: effectivePrimary, borderRadius: '8px', overflow: 'hidden',
                    width: deviceFrames.find(d => d.id === previewDevice)?.width || '240px',
                    minHeight: '120px', border: '1px solid rgba(255,255,255,0.1)', transition: 'width 0.3s'
                }}>
                    <div style={{ background: `${effectivePrimary}cc`, padding: '8px 12px', borderBottom: `1px solid ${effectiveAccent}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: effectiveAccent, fontWeight: '700', fontSize: '11px' }}>
                            {logoUrl ? '🖼 Logo' : 'BRAND'}
                        </span>
                        <div style={{ width: '32px', height: '14px', background: effectiveAccent, borderRadius: '3px' }} />
                    </div>
                    <div style={{ padding: '10px 12px', display: 'flex', gap: '6px' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ flex: 1, height: '40px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', border: `1px solid ${effectiveAccent}22` }} />
                        ))}
                    </div>
                    <div style={{ padding: '0 12px 10px', display: 'flex', gap: '6px' }}>
                        <div style={{ flex: 1, height: '20px', background: effectiveAccent, borderRadius: '3px', opacity: 0.8 }} />
                        <div style={{ flex: 1, height: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSave} disabled={saving}
                    style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving...' : 'Save Theme'}
                </button>
            </div>
        </div>
    );
};

export default ThemePanel;
