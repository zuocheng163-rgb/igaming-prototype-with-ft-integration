import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Globe, Eye, EyeOff, Archive, Edit2, Save } from 'lucide-react';

const STATUS_COLORS = { draft: '#ff8800', published: '#00ff88', archived: '#888' };
const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'it'];

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

export const CMSPanel = ({ token, user }) => {
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPage, setSelectedPage] = useState(null);
    const [activeEditorTab, setActiveEditorTab] = useState('content');
    const [editLocale, setEditLocale] = useState('en');
    const [translations, setTranslations] = useState({});
    const [seoData, setSeoData] = useState({});
    const [visibilityData, setVisibilityData] = useState({});
    const [showNewForm, setShowNewForm] = useState(false);
    const [newPage, setNewPage] = useState({ slug: '', default_locale: 'en', seo_title: '', seo_description: '' });
    const [saving, setSaving] = useState(false);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    };

    const fetchPages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/operator/cms/pages', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setPages(data.pages || []);
        } catch (_) {} finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchPages(); }, [fetchPages]);

    const openEditor = async (page) => {
        setSelectedPage(page);
        setActiveEditorTab('content');
        setEditLocale(page.default_locale || 'en');
        setSeoData({ seo_title: page.seo_title || '', seo_description: page.seo_description || '', og_image: page.og_image || '' });
        setVisibilityData({ country_allow_list: '', country_block_list: '', starts_at: '', ends_at: '' });
        // Fetch translations
        try {
            const res = await fetch(`/api/operator/cms/pages/${page.id}/translations`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            const map = {};
            (data.translations || []).forEach(t => { map[t.locale] = t; });
            setTranslations(map);
        } catch (_) {}
    };

    const handleCreatePage = async () => {
        if (!newPage.slug) return;
        try {
            const res = await fetch('/api/operator/cms/pages', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(newPage)
            });
            if (!res.ok) throw new Error('Failed to create page');
            addToast('Page created');
            setShowNewForm(false);
            setNewPage({ slug: '', default_locale: 'en', seo_title: '', seo_description: '' });
            await fetchPages();
        } catch (e) { addToast(e.message, 'error'); }
    };

    const handleSaveTranslation = async () => {
        if (!selectedPage) return;
        setSaving(true);
        try {
            const current = translations[editLocale] || {};
            const res = await fetch(`/api/operator/cms/pages/${selectedPage.id}/translations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ locale: editLocale, title: current.title || '', body_mdx: current.body_mdx || '' })
            });
            if (!res.ok) throw new Error('Save failed');
            addToast('Content saved');
        } catch (e) { addToast(e.message, 'error'); }
        finally { setSaving(false); }
    };

    const handlePublish = async (action) => {
        if (!selectedPage) return;
        const statusMap = { publish: 'published', archive: 'archived', draft: 'draft' };
        try {
            const res = await fetch(`/api/operator/cms/pages/${selectedPage.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: statusMap[action], ...seoData })
            });
            if (!res.ok) throw new Error('Update failed');
            addToast(`Page ${statusMap[action]}`);
            await fetchPages();
            setSelectedPage(p => ({ ...p, status: statusMap[action] }));
        } catch (e) { addToast(e.message, 'error'); }
    };

    return (
        <div style={{ padding: '24px' }}>
            <Toast toasts={toasts} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0 }}>Content Management</h2>
                <button onClick={() => setShowNewForm(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)', borderRadius: '6px', color: '#00ccff', cursor: 'pointer', fontSize: '13px' }}>
                    <Plus size={14} /> New Page
                </button>
            </div>

            {showNewForm && (
                <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', borderRadius: '10px', border: '1px solid rgba(0,204,255,0.2)' }}>
                    <h4 style={{ color: '#fff', margin: '0 0 16px', fontSize: '14px' }}>New Content Page</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Slug (URL path)</label>
                            <input value={newPage.slug} onChange={e => setNewPage(p => ({ ...p, slug: e.target.value }))} placeholder="terms-and-conditions"
                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Default Locale</label>
                            <select value={newPage.default_locale} onChange={e => setNewPage(p => ({ ...p, default_locale: e.target.value }))}
                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px' }}>
                                {LOCALES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '4px' }}>SEO Title</label>
                            <input value={newPage.seo_title} onChange={e => setNewPage(p => ({ ...p, seo_title: e.target.value }))} placeholder="Page title for search engines"
                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowNewForm(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                        <button onClick={handleCreatePage} style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)', border: 'none', borderRadius: '6px', color: '#000', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>Create</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Loading pages...</div>
            ) : pages.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No content pages yet</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pages.map(page => (
                        <div key={page.id} style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '8px', padding: '12px 16px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>/content/{page.slug}</div>
                                <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>
                                    {page.seo_title || '(no SEO title)'} · {page.default_locale?.toUpperCase()}
                                    · Updated {new Date(page.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px',
                                    color: STATUS_COLORS[page.status], background: `${STATUS_COLORS[page.status]}22`, textTransform: 'uppercase'
                                }}>{page.status}</span>
                                <button onClick={() => openEditor(page)}
                                    style={{ background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '6px', padding: '5px 12px', color: '#00ccff', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Edit2 size={12} /> Edit
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Editor drawer */}
            {selectedPage && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
                    onClick={() => setSelectedPage(null)}>
                    <div style={{ width: '600px', height: '100%', background: '#0d0d1a', borderLeft: '1px solid rgba(255,255,255,0.07)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ color: '#fff', margin: '0 0 4px', fontSize: '16px' }}>/content/{selectedPage.slug}</h3>
                                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', color: STATUS_COLORS[selectedPage.status], background: `${STATUS_COLORS[selectedPage.status]}22`, textTransform: 'uppercase' }}>
                                    {selectedPage.status}
                                </span>
                            </div>
                            <button onClick={() => setSelectedPage(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        </div>

                        {/* Editor tabs */}
                        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 24px' }}>
                            {['content', 'seo', 'visibility'].map(tab => (
                                <button key={tab} onClick={() => setActiveEditorTab(tab)}
                                    style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${activeEditorTab === tab ? '#00ccff' : 'transparent'}`, color: activeEditorTab === tab ? '#00ccff' : '#888', cursor: 'pointer', fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
                            {activeEditorTab === 'content' && (
                                <>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                        {LOCALES.map(l => (
                                            <button key={l} onClick={() => setEditLocale(l)}
                                                style={{ padding: '5px 12px', borderRadius: '5px', border: `1px solid ${editLocale === l ? '#00ccff' : 'rgba(255,255,255,0.1)'}`, background: editLocale === l ? 'rgba(0,204,255,0.15)' : 'transparent', color: editLocale === l ? '#00ccff' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                {l.toUpperCase()}
                                                {translations[l] && <span style={{ color: '#00ff88', marginLeft: '3px' }}>●</span>}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Title</label>
                                        <input
                                            value={translations[editLocale]?.title || ''}
                                            onChange={e => setTranslations(t => ({ ...t, [editLocale]: { ...t[editLocale], title: e.target.value } }))}
                                            placeholder="Page title"
                                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Content (Markdown)</label>
                                        <textarea
                                            value={translations[editLocale]?.body_mdx || ''}
                                            onChange={e => setTranslations(t => ({ ...t, [editLocale]: { ...t[editLocale], body_mdx: e.target.value } }))}
                                            placeholder="# Page Content&#10;&#10;Write your content here in Markdown..."
                                            rows={16}
                                            style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '10px 12px', color: '#fff', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </>
                            )}
                            {activeEditorTab === 'seo' && (
                                <>
                                    {['seo_title', 'seo_description', 'og_image'].map(field => (
                                        <div key={field} style={{ marginBottom: '14px' }}>
                                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px', textTransform: 'capitalize' }}>{field.replace(/_/g, ' ')}</label>
                                            <input value={seoData[field] || ''} onChange={e => setSeoData(d => ({ ...d, [field]: e.target.value }))}
                                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                                        </div>
                                    ))}
                                </>
                            )}
                            {activeEditorTab === 'visibility' && (
                                <>
                                    {[['country_allow_list', 'Country Allow List (comma-separated ISO codes)'], ['country_block_list', 'Country Block List'], ['starts_at', 'Start Date/Time'], ['ends_at', 'End Date/Time']].map(([field, label]) => (
                                        <div key={field} style={{ marginBottom: '14px' }}>
                                            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '5px' }}>{label}</label>
                                            <input value={visibilityData[field] || ''} onChange={e => setVisibilityData(d => ({ ...d, [field]: e.target.value }))}
                                                type={field.includes('_at') ? 'datetime-local' : 'text'}
                                                placeholder={field.includes('list') ? 'DE, GB, FR...' : ''}
                                                style={{ width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '9px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Footer actions */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {activeEditorTab === 'content' && (
                                <button onClick={handleSaveTranslation} disabled={saving}
                                    style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                                    <Save size={13} style={{ marginRight: '6px' }} />{saving ? 'Saving...' : 'Save Draft'}
                                </button>
                            )}
                            {selectedPage.status !== 'published' && (
                                <button onClick={() => handlePublish('publish')}
                                    style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)', border: 'none', borderRadius: '7px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
                                    <Eye size={13} style={{ marginRight: '6px' }} /> Publish
                                </button>
                            )}
                            {selectedPage.status === 'published' && (
                                <button onClick={() => handlePublish('archive')}
                                    style={{ padding: '10px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#888', cursor: 'pointer', fontSize: '13px' }}>
                                    <Archive size={13} style={{ marginRight: '6px' }} /> Archive
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CMSPanel;
