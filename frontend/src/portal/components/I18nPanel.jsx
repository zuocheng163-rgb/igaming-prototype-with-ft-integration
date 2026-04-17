import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Download, ToggleLeft, ToggleRight, Globe } from 'lucide-react';

const LOCALES = [
    { code: 'en', name: 'English', native: 'English', active: true },
    { code: 'es', name: 'Spanish', native: 'Español', active: true },
    { code: 'pt', name: 'Portuguese', native: 'Português', active: true },
    { code: 'de', name: 'German', native: 'Deutsch', active: true },
    { code: 'fr', name: 'French', native: 'Français', active: true },
    { code: 'it', name: 'Italian', native: 'Italiano', active: true },
    { code: 'pl', name: 'Polish', native: 'Polski', active: false },
    { code: 'nl', name: 'Dutch', native: 'Nederlands', active: false },
    { code: 'sv', name: 'Swedish', native: 'Svenska', active: false },
    { code: 'ar', name: 'Arabic', native: 'العربية', active: false, rtl: true },
    { code: 'ja', name: 'Japanese', native: '日本語', active: false },
    { code: 'ko', name: 'Korean', native: '한국어', active: false },
];

const MOCK_MISSING = [
    { key: 'sports.bet_slip.accept_odds', locale: 'de', last_seen: '2026-04-15' },
    { key: 'fraud.ato.remediation_success', locale: 'es', last_seen: '2026-04-14' },
    { key: 'affiliate.portal.no_conversions', locale: 'fr', last_seen: '2026-04-12' },
];

export const I18nPanel = ({ token, user }) => {
    const [locales, setLocales] = useState(LOCALES);
    const [defaultLocale, setDefaultLocale] = useState('en');
    const [activeTab, setActiveTab] = useState('locales');

    const toggleLocale = (code) => {
        if (code === 'en') return; // English is always active
        setLocales(ls => ls.map(l => l.code === code ? { ...l, active: !l.active } : l));
    };

    const moveLocale = (code, dir) => {
        setLocales(ls => {
            const idx = ls.findIndex(l => l.code === code);
            if (dir === 'up' && idx === 0) return ls;
            if (dir === 'down' && idx === ls.length - 1) return ls;
            const newLs = [...ls];
            const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
            [newLs[idx], newLs[swapIdx]] = [newLs[swapIdx], newLs[idx]];
            return newLs;
        });
    };

    const handleDownload = (code) => {
        // Simulate a download link
        const link = document.createElement('a');
        link.href = `/api/operator/settings/i18n/bundle?locale=${code}`;
        link.download = `messages.${code}.json`;
        link.click();
    };

    return (
        <div style={{ padding: '24px' }}>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '6px' }}>Internationalisation</h2>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>Configure languages and translation bundles for your platform.</p>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '24px' }}>
                {['locales', 'missing'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? '#00ccff' : 'transparent'}`, color: activeTab === tab ? '#00ccff' : '#888', cursor: 'pointer', fontSize: '14px', fontWeight: '500', textTransform: 'capitalize' }}>
                        {tab === 'missing' ? 'Missing Translations' : 'Locales'}
                    </button>
                ))}
            </div>

            {activeTab === 'locales' && (
                <>
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Default Locale</label>
                        <select value={defaultLocale} onChange={e => setDefaultLocale(e.target.value)}
                            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 14px', color: '#fff', fontSize: '14px', minWidth: '200px' }}>
                            {locales.filter(l => l.active).map(l => (
                                <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                            ))}
                        </select>
                        <p style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                            Locale priority: URL param › user profile › geo default › brand default › {defaultLocale}
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {locales.map((locale, idx) => (
                            <div key={locale.code} style={{
                                background: locale.active ? 'rgba(0,204,255,0.04)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${locale.active ? 'rgba(0,204,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: '8px', padding: '12px 14px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                    {/* Order controls */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                        <button onClick={() => moveLocale(locale.code, 'up')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '1px', lineHeight: 1 }}>
                                            <ChevronUp size={12} />
                                        </button>
                                        <button onClick={() => moveLocale(locale.code, 'down')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '1px', lineHeight: 1 }}>
                                            <ChevronDown size={12} />
                                        </button>
                                    </div>
                                    <Globe size={16} color={locale.active ? '#00ccff' : '#555'} />
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ color: locale.active ? '#fff' : '#666', fontWeight: '600', fontSize: '14px' }}>{locale.name}</span>
                                            <span style={{ color: '#555', fontSize: '12px' }}>{locale.native}</span>
                                            <span style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', color: '#888', fontSize: '11px', fontFamily: 'monospace' }}>{locale.code}</span>
                                            {locale.rtl && <span style={{ color: '#ff8800', fontSize: '11px' }}>RTL</span>}
                                            {locale.code === defaultLocale && <span style={{ color: '#ffd700', fontSize: '11px', fontWeight: '700' }}>DEFAULT</span>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    {locale.active && (
                                        <button onClick={() => handleDownload(locale.code)}
                                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '4px 10px', color: '#888', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Download size={12} /> Bundle
                                        </button>
                                    )}
                                    <button
                                        onClick={() => toggleLocale(locale.code)}
                                        disabled={locale.code === 'en'}
                                        style={{ background: 'none', border: 'none', cursor: locale.code === 'en' ? 'not-allowed' : 'pointer', opacity: locale.code === 'en' ? 0.4 : 1 }}
                                        title={locale.code === 'en' ? 'English is always active' : (locale.active ? 'Disable' : 'Enable')}
                                    >
                                        {locale.active
                                            ? <ToggleRight size={22} color="#00ccff" />
                                            : <ToggleLeft size={22} color="#555" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {activeTab === 'missing' && (
                <>
                    <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                        Missing translation keys are reported once per session per key. Fallback to English is used automatically.
                    </p>
                    {MOCK_MISSING.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No missing translations reported</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                    {['Translation Key', 'Locale', 'Last Seen'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {MOCK_MISSING.map((m, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '10px 12px', color: '#ddd', fontSize: '13px', fontFamily: 'monospace' }}>{m.key}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ background: 'rgba(255,136,0,0.15)', border: '1px solid rgba(255,136,0,0.3)', borderRadius: '4px', padding: '2px 8px', color: '#ff8800', fontSize: '12px', fontWeight: '700' }}>{m.locale.toUpperCase()}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: '#666', fontSize: '13px' }}>{m.last_seen}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </div>
    );
};

export default I18nPanel;
