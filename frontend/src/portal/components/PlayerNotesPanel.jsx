import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pin, PinOff, Edit2, Plus, Lock } from 'lucide-react';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

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

export const PlayerNotesPanel = ({ playerId, token, currentOperator }) => {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [visibility, setVisibility] = useState('internal_all');
    const [pinned, setPinned] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const [toasts, setToasts] = useState([]);
    const textareaRef = useRef(null);

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    };

    const fetchNotes = useCallback(async () => {
        if (!playerId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/operator/players/${playerId}/notes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setNotes(data.notes || []);
        } catch (e) {
            addToast('Failed to load notes', 'error');
        } finally {
            setLoading(false);
        }
    }, [playerId, token]);

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    // Cmd+Enter to save
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && document.activeElement === textareaRef.current) {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [body, visibility, pinned, editingNote]);

    const handleSave = async () => {
        if (!body.trim()) return;
        setSaving(true);
        try {
            const url = editingNote
                ? `/api/operator/players/${playerId}/notes/${editingNote.id}`
                : `/api/operator/players/${playerId}/notes`;
            const method = editingNote ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: body.trim(), visibility, pinned })
            });
            if (!res.ok) throw new Error('Save failed');
            setBody('');
            setPinned(false);
            setEditingNote(null);
            await fetchNotes();
            addToast('Note saved');
        } catch (e) {
            addToast('Failed to save note', 'error');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (note) => {
        const elapsed = Date.now() - new Date(note.created_at).getTime();
        if (elapsed > EDIT_WINDOW_MS) {
            // Past edit window — create new note with reference
            setBody(`[Edited from #${note.id}] `);
            setEditingNote(null);
        } else {
            setEditingNote(note);
            setBody(note.body);
            setVisibility(note.visibility);
            setPinned(note.pinned || false);
        }
        textareaRef.current?.focus();
    };

    const canEdit = (note) => {
        return note.author_operator_id === currentOperator;
    };

    const sortedNotes = [...notes].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    return (
        <div style={{ padding: '16px' }}>
            <Toast toasts={toasts} />

            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading notes...</div>
            ) : sortedNotes.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>No notes yet</div>
            ) : (
                <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sortedNotes.map(note => (
                        <div key={note.id} style={{
                            background: note.pinned ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${note.pinned ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.07)'}`,
                            borderRadius: '8px', padding: '12px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {note.pinned && <Pin size={12} color="#ffd700" />}
                                    <span style={{ color: '#888', fontSize: '12px' }}>{note.author_operator_id}</span>
                                    <span style={{ color: '#555', fontSize: '11px' }}>·</span>
                                    <span style={{ color: '#555', fontSize: '11px' }}>
                                        {new Date(note.created_at).toLocaleString()}
                                    </span>
                                    {note.visibility !== 'internal_all' && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#888', fontSize: '11px' }}>
                                            <Lock size={10} /> Restricted
                                        </span>
                                    )}
                                </div>
                                {canEdit(note) && (
                                    <button onClick={() => startEdit(note)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '2px' }}>
                                        <Edit2 size={13} />
                                    </button>
                                )}
                            </div>
                            <p style={{ color: '#ddd', fontSize: '14px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {note.body}
                            </p>
                            {note.reference_to && (
                                <div style={{ color: '#666', fontSize: '11px', marginTop: '6px' }}>Edited from #{note.reference_to}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add / Edit note form */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
                {editingNote && (
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Editing note #{editingNote.id}</span>
                        <button onClick={() => { setEditingNote(null); setBody(''); }} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                    </div>
                )}
                <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={e => setBody(e.target.value.slice(0, 4000))}
                    placeholder="Add a note... (Cmd+Enter to save)"
                    rows={3}
                    style={{
                        width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px',
                        resize: 'vertical', boxSizing: 'border-box', outline: 'none'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <select
                            value={visibility}
                            onChange={e => setVisibility(e.target.value)}
                            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '5px 8px', color: '#aaa', fontSize: '12px' }}
                        >
                            <option value="internal_all">Visible to all staff</option>
                            <option value="internal_role_fraud">Fraud team only</option>
                            <option value="internal_role_vip">VIP team only</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#888', fontSize: '12px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
                            Pin
                        </label>
                        <span style={{ color: body.length >= 3800 ? '#ff8800' : '#555', fontSize: '11px' }}>
                            {body.length}/4000
                        </span>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!body.trim() || saving}
                        style={{
                            background: 'linear-gradient(135deg, #00ccff 0%, #0088cc 100%)',
                            border: 'none', borderRadius: '6px', padding: '7px 18px',
                            color: '#000', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                            opacity: !body.trim() || saving ? 0.5 : 1
                        }}
                    >
                        {saving ? 'Saving...' : editingNote ? 'Update' : 'Save Note'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlayerNotesPanel;
