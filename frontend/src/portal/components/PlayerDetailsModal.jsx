import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, User, Mail, Phone, MapPin, Calendar, Shield } from 'lucide-react';
import { PlayerNotesPanel } from './PlayerNotesPanel';
import { TrustTimeline } from './TrustTimeline';

const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'notes', label: 'Notes' },
    { id: 'trust', label: 'Trust Score' },
];

const PlayerDetailsModal = ({ userId, token, onClose }) => {
    const [player, setPlayer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [revealed, setRevealed] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        if (!userId || !token) return;

        fetch(`/api/operator/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setPlayer(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [userId, token]);

    const maskEmail = (email) => {
        if (!email) return 'N/A';
        const [name, domain] = email.split('@');
        return `${name.substring(0, 2)}***@${domain}`;
    };

    const maskPhone = (phone) => {
        if (!phone) return 'N/A';
        return `***${phone.slice(-4)}`;
    };

    const maskAddress = (address) => {
        if (!address) return 'N/A';
        return '*** *** ***';
    };

    if (!userId) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-prominent" onClick={onClose}>
                    <X size={18} />
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
                        <User size={24} />
                        Player Details
                    </h2>
                </div>

                {/* Tab navigation */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '8px 16px',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid var(--accent-gold, #ffd700)' : '2px solid transparent',
                                color: activeTab === tab.id ? 'white' : 'var(--text-muted, #888)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: activeTab === tab.id ? '600' : '400',
                                marginBottom: '-1px',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="modal-inner-scroll">

                    {activeTab === 'notes' && (
                        <PlayerNotesPanel playerId={userId} token={token} />
                    )}

                    {activeTab === 'trust' && (
                        <TrustTimeline playerId={userId} token={token} />
                    )}

                    {activeTab === 'profile' && loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            Loading player details...
                        </div>
                    ) : activeTab === 'profile' && !player ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4d' }}>
                            Failed to load player details
                        </div>
                    ) : activeTab === 'profile' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PII Protection</div>
                                    <div style={{ fontSize: '0.9rem' }}>{revealed ? 'Sensitive data visible' : 'Sensitive data masked'}</div>
                                </div>
                                <button
                                    onClick={() => setRevealed(!revealed)}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                                    {revealed ? 'Hide' : 'Reveal'} PII
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '12px', maxHeight: '60vh', overflowY: 'auto' }}>
                                {/* Primary Identity Fields (Always Top) */}
                                <DetailRow icon={<User size={16} />} label="User ID (Public)" value={player.user_id} />
                                <DetailRow icon={<Shield size={16} />} label="Internal UUID" value={player.id} sensitive={true} />
                                <DetailRow icon={<User size={16} />} label="Username" value={player.username} />

                                {/* Dynamic Fields (All other fields from DB) */}
                                {Object.entries(player)
                                    .filter(([key]) => !['id', 'user_id', 'username', 'password_hash', 'token', '_gamstop_enabled', '_gamstop_mock_mode'].includes(key))
                                    .filter(([key]) => {
                                        if (key.startsWith('gamstop_')) {
                                            return player._gamstop_enabled === true;
                                        }
                                        return true;
                                    })
                                    .sort()
                                    .map(([key, value]) => {
                                        let displayValue = value;
                                        if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
                                        
                                        // Add Simulator Badge for GAMSTOP fields
                                        const isGamstopField = key.startsWith('gamstop_');
                                        const labelSuffix = (isGamstopField && player._gamstop_mock_mode) ? ' (SIMULATED)' : '';
                                        if (typeof value === 'object' && value !== null) displayValue = JSON.stringify(value);
                                        if (value === null || value === undefined) displayValue = 'null';

                                        // Apply masking to known PII if not revealed
                                        const isPII = ['email', 'mobile', 'first_name', 'last_name', 'address', 'phone', 'full_mobile_number'].includes(key);
                                        if (isPII && !revealed) {
                                            displayValue = '•'.repeat(8) + ' (Hidden)';
                                        }

                                        return (
                                            <DetailRow
                                                key={key}
                                                icon={<div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />}
                                                label={key.replace(/_/g, ' ').toUpperCase() + labelSuffix}
                                                value={displayValue}
                                            />
                                        );
                                    })}
                            </div>

                            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Account Summary</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Balance</div>
                                        <div style={{ fontSize: '1.2rem', color: '#00ff88' }}>€{(player.balance || 0).toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bonus Balance</div>
                                        <div style={{ fontSize: '1.2rem', color: '#ffd700' }}>€{(player.bonus_balance || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const DetailRow = ({ icon, label, value, responsive }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ color: 'var(--primary)', flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{value}</div>
        </div>
    </div>
);

export default PlayerDetailsModal;
