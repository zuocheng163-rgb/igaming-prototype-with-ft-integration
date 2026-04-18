const { createClient } = require('@supabase/supabase-js');
const { logger } = require('./logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (supabaseUrl && (supabaseServiceKey || supabaseKey)) {
    supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);
    logger.info('[Supabase] Client initialized');
} else {
    logger.warn('[Supabase] Missing credentials.');
}

let rabbitmq;
try {
    rabbitmq = require('./rabbitmq');
} catch (e) {
    logger.warn('[Supabase] RabbitMQ not available, ignoring event publishing.');
}

// F10: In-memory overrides for KYC status (PoC / Missing Migration Fallback)
const kycOverrides = new Map();

const getBrandId = (brandId) => {
    if (!brandId || brandId === 1 || brandId === '1') return 1;
    return brandId;
};

const getTenantConfig = async (brandId) => {
    if (!supabase) return null;
    // brand_id is stored as TEXT in DB, so we ensure string comparison
    const { data, error } = await supabase.from('tenant_configs').select('*').eq('brand_id', String(brandId)).maybeSingle();
    if (error) {
        logger.error('[Supabase] Failed to fetch tenant config', { brandId, error: error.message });
        return null;
    }
    return data;
};

const updateOperatorApiKey = async (brandId, newKey) => {
    if (!supabase) return false;
    const { error } = await supabase.from('tenant_configs').upsert({
        brand_id: brandId,
        operator_name: brandId === 1 ? 'Default Operator' : `Operator ${brandId}`,
        ft_api_key: newKey,
        updated_at: new Date().toISOString()
    }, { onConflict: 'brand_id' });
    if (error) {
        logger.error('Failed to update operator API key:', { error: error.message, brandId });
        return false;
    }
    return true;
};

const saveAuditLog = async (logEntry) => {
    if (!supabase) return;
    
    // Ensure status defaults to 'success' for UI rendering (e.g. 200 vs 500)
    const logBatch = (Array.isArray(logEntry) ? logEntry : [logEntry]).map(entry => ({
        status: 'success', // Default
        ...entry
    }));

    const { error } = await supabase.from('platform_audit_logs').insert(logBatch);
    if (error) {
        logger.error('[Supabase] Failed to save audit log', { error: error.message, correlationId: logEntry.correlation_id });
    }
};

const getUser = async (username, token) => {
    if (!supabase || !token) return null;
    let query = supabase.from('users').select('*').eq('token', token);
    if (username) query = query.eq('username', username);
    const { data, error } = await query.single();
    if (error || !data) return null;

    // F10: Apply in-memory overrides for missing columns
    const override = kycOverrides.get(data.id) || kycOverrides.get(data.username);
    return {
        kyc_status: 'NOT_STARTED',
        wallet_blocked: false,
        ...data,
        ...override
    };
};

const getUserById = async (userId) => {
    if (!supabase) return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    let query = supabase.from('users').select('*');
    if (isUuid) query = query.eq('id', userId);
    else query = query.or(`username.eq.${userId},user_id.eq.${userId}`);
    const { data, error } = await query.single();
    if (error || !data) return null;

    // F10: Apply in-memory overrides for missing columns
    const override = kycOverrides.get(data.id) || kycOverrides.get(data.username);
    return {
        kyc_status: 'NOT_STARTED',
        wallet_blocked: false,
        ...data,
        ...override
    };
};

const getUserConsents = async (userId) => {
    if (!supabase) return {};
    const { data, error } = await supabase.from('user_consents').select('*').eq('user_id', userId).single();
    if (error) return { email: true, sms: true, telephone: true, post_mail: true, site_notification: true, push_notification: true };
    return data;
};

const getUserBlocks = async (userId) => {
    if (!supabase) return {};
    const { data, error } = await supabase.from('user_blocks').select('*').eq('user_id', userId).single();
    if (error) return { blocked: false, excluded: false };
    return data;
};

const updateUser = async (userId, updates) => {
    if (!supabase) return null;

    // F10: Track KYC overrides in memory if DB columns might be missing
    if (updates.kyc_status || updates.wallet_blocked !== undefined) {
        const existing = kycOverrides.get(userId) || {};
        kycOverrides.set(userId, {
            ...existing,
            ...(updates.kyc_status && { kyc_status: updates.kyc_status }),
            ...(updates.wallet_blocked !== undefined && { wallet_blocked: updates.wallet_blocked })
        });
    }

    // F10: Filter out KYC columns if they might not exist (optional but safer)
    const safeUpdates = { ...updates };

    try {
        const { data, error } = await supabase.from('users').update(safeUpdates).eq('id', userId).select().single();
        if (error) {
            if (error.message.includes('column') || error.message.includes('schema cache')) {
                logger.warn('[Supabase] updateUser: Skipping missing KYC columns', { userId, error: error.message });
                // Retry WITHOUT KYC columns
                const legacyUpdates = { ...updates };
                delete legacyUpdates.kyc_status;
                delete legacyUpdates.wallet_blocked;
                delete legacyUpdates.sumsub_applicant_id;
                delete legacyUpdates.kyc_verified_at;
                const { data: retryData, error: retryError } = await supabase.from('users').update(legacyUpdates).eq('id', userId).select().single();
                if (retryError) return null;
                return retryData;
            }
            return null;
        }
        return data;
    } catch (e) {
        logger.error('[Supabase] updateUser failure', { error: e.message });
        return null;
    }
};

const createUser = async (userData) => {
    if (!supabase) throw new Error('Supabase not initialized');
    const brandId = userData.brand_id || 1;
    const publicUserId = userData.username || `user_${Date.now()}`;
    const isDemo = process.env.DEMO_MODE === 'true';
    const newUser = {
        brand_id: brandId,
        user_id: publicUserId,
        username: userData.username,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        balance: userData.balance || (isDemo ? 1000.00 : 0),
        bonus_balance: userData.bonus_balance || (isDemo ? 500.00 : 0),
        currency: userData.currency || 'EUR',
        registration_date: new Date().toISOString(),
        birth_date: userData.birth_date,
        sex: userData.sex,
        title: userData.title,
        language: userData.language,
        country: userData.country,
        city: userData.city,
        address: userData.address,
        postal_code: userData.postal_code,
        mobile: userData.mobile,
        mobile_prefix: userData.mobile_prefix,
        full_mobile_number: userData.full_mobile_number,
        origin: userData.origin,
        market: userData.market,
        registration_code: userData.registration_code,
        roles: userData.roles || ['PLAYER'],
        token: userData.token,
        ...userData
    };

    // F10: Add KYC columns ONLY if provided/needed (graceful if column missing in DB)
    if (userData.kyc_status) newUser.kyc_status = userData.kyc_status;
    if (userData.wallet_blocked !== undefined) newUser.wallet_blocked = userData.wallet_blocked;
    if (userData.sumsub_applicant_id) newUser.sumsub_applicant_id = userData.sumsub_applicant_id;
    if (userData.kyc_verified_at) newUser.kyc_verified_at = userData.kyc_verified_at;

    delete newUser.operator_id;
    delete newUser.operatorId;
    const { data: userRecord, error: userError } = await supabase.from('users').insert([newUser]).select().single();
    if (userError) throw userError;
    const initialConsents = {
        brand_id: brandId,
        user_id: publicUserId,
        allow_marketing_communication: true,
        email: true,
        sms: true,
        telephone: true,
        post_mail: true,
        site_notification: true,
        push_notification: true
    };
    await supabase.from('user_consents').insert([initialConsents]);
    const initialBlocks = {
        brand_id: brandId,
        user_id: publicUserId,
        blocked: false,
        excluded: false
    };
    await supabase.from('user_blocks').insert([initialBlocks]);
    return userRecord;
};

const updateBalance = async (userId, newBalance, brandId) => {
    return updateUser(userId, { balance: newBalance });
};

const upsertPlayerProfile = async (profileData) => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('player_profiles').upsert([profileData], { onConflict: 'player_id' }).select().single();
        if (error) {
            logger.warn('[Supabase] upsertPlayerProfile: Table might be missing, skipping', { error: error.message });
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
};

const logKycEvent = async (eventData) => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('kyc_events').insert([eventData]).select().single();
        if (error) {
            logger.warn('[Supabase] logKycEvent: Table might be missing, skipping', { error: error.message });
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
};

/**
 * Game Favourites
 */
const getUserFavourites = async (userId) => {
    if (!supabase) return [];
    const user = await getUserById(userId);
    if (!user) return [];

    const { data: favs, error: favError } = await supabase
        .from('user_favourites')
        .select('game_id')
        .eq('user_id', user.id);

    if (favError || !favs || favs.length === 0) return [];

    const gameIds = favs.map(f => f.game_id);
    const { data: games, error: gameError } = await supabase
        .from('games_master')
        .select('*')
        .in('id', gameIds);

    if (gameError) {
        logger.error('[Supabase] Failed to fetch game details for favourites', { userId, error: gameError.message });
        return [];
    }
    return games || [];
};

const toggleFavourite = async (userId, gameId) => {
    if (!supabase) return { success: false };
    const user = await getUserById(userId);
    if (!user) return { success: false };

    const { data: existing } = await supabase
        .from('user_favourites')
        .select('id')
        .eq('user_id', user.id)
        .eq('game_id', gameId)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('user_favourites')
            .delete()
            .eq('id', existing.id);
        return { success: !error, status: 'removed', is_favourite: false };
    } else {
        const { error } = await supabase
            .from('user_favourites')
            .insert({ user_id: user.id, game_id: gameId });
        
        if (error) {
            logger.error('[Supabase] Failed to insert favourite', { userId: user.id, gameId, error });
        }
        
        return { success: !error, status: 'added', is_favourite: true, error: error ? error.message : null };
    }
};

/**
 * User Activity (Recently Played)
 */
const getRecentlyPlayed = async (userId, limit = 20) => {
    if (!supabase) return [];
    const user = await getUserById(userId);
    if (!user) return [];

    const { data: activity, error: activityError } = await supabase
        .from('user_activity')
        .select('game_id, timestamp')
        .eq('user_id', user.id)
        .eq('activity_type', 'game_launch')
        .order('timestamp', { ascending: false })
        .limit(limit * 2); // Get more to allow for deduping

    if (activityError || !activity) return [];

    const gameIds = [];
    const seen = new Set();
    activity.forEach(item => {
        if (item.game_id && !seen.has(item.game_id)) {
            seen.add(item.game_id);
            gameIds.push(item.game_id);
        }
    });

    if (gameIds.length === 0) return [];

    const { data: games, error: gameError } = await supabase
        .from('games_master')
        .select('*')
        .in('id', gameIds.slice(0, limit));

    if (gameError) {
        logger.error('[Supabase] Failed to fetch game details for recently played', { userId, error: gameError.message });
        return [];
    }

    // Maintain the order of gameIds
    return gameIds.slice(0, limit).map(id => games.find(g => g.id === id)).filter(Boolean);
};

const trackActivity = async (userId, activityType, gameId = null, metadata = {}) => {
    if (!supabase) return null;
    const user = await getUserById(userId);
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_activity')
        .insert({
            user_id: user.id,
            activity_type: activityType,
            game_id: gameId,
            metadata
        })
        .select()
        .single();

    if (error) {
        logger.error('[Supabase] Failed to track activity', { userId, activityType, error: error.message });
        return null;
    }
    return data;
};

/**
 * Player Ledger / Transactions
 */
const getUserTransactions = async (userId, limit = 50) => {
    if (!supabase) return [];
    const user = await getUserById(userId);
    if (!user) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id) // Fix: use UUID instead of username
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        logger.error('[Supabase] Failed to fetch user transactions', { userId, error: error.message });
        return [];
    }
    return data;
};

// NOTE: module.exports is at the end of this file to ensure all functions are defined first

/**
 * Helper to convert period labels to start dates
 */
function getPeriodDates(periodLabel) {
    const now = new Date();
    const start = new Date(now);
    let days = 30;

    switch (periodLabel) {
        case 'Today':
            start.setHours(0, 0, 0, 0);
            days = 1;
            break;
        case 'Yesterday':
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            now.setDate(now.getDate() - 1);
            now.setHours(23, 59, 59, 999);
            days = 1;
            break;
        case 'Last 7 Days':
            start.setDate(now.getDate() - 6); // 7 days including today
            start.setHours(0, 0, 0, 0);
            days = 7;
            break;
        case 'This Month':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            days = now.getDate();
            break;
        case 'Last 30 Days':
        default:
            start.setDate(now.getDate() - 29); // 30 days including today
            start.setHours(0, 0, 0, 0);
            days = 30;
            break;
    }

    return { start: start.toISOString(), end: now.toISOString(), days };
}
const getActivities = async (brandId, limit = 20) => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('platform_audit_logs').select('*').or(`brand_id.eq.${brandId},brand_id.eq.1`).order('timestamp', { ascending: false }).limit(limit);
    if (error) return [];
    return data.map(log => {
        const isInbound = log.action.startsWith('inbound:');
        let method = 'POST', endpoint = log.action;
        if (isInbound) {
            method = log.action.split(':')[1]?.toUpperCase() || 'ACTION';
            endpoint = log.entity_id ? `User: ${log.entity_id}` : 'System';
        } else {
            const parts = log.action.split(':');
            if (parts.length >= 3) {
                method = 'FT-PUSH', endpoint = parts[2].toUpperCase();
            } else if (parts.length === 2 && parts[0] === 'push_event') {
                method = 'FT-PUSH', endpoint = parts[1].toUpperCase();
            }
        }
        return { id: log.id, type: isInbound ? 'inbound' : 'outbound', method, endpoint, message: log.message, status: log.status === 'success' ? 200 : 500, payload: log.metadata || {}, timestamp: log.timestamp };
    });
};

const getTransactionsByOperator = async (brandId, filters = {}) => {
    if (!supabase) return [];
    let query = supabase.from('platform_audit_logs').select('*').eq('brand_id', brandId).in('action', ['wallet:debit', 'wallet:credit', 'wallet:deposit', 'wallet:bonus_credit']);
    if (filters.startDate) query = query.gte('timestamp', filters.startDate);
    if (filters.endDate) query = query.lte('timestamp', filters.endDate);
    const { data, error } = await query.order('timestamp', { ascending: false });
    if (error) return [];
    return data;
};

const getAggregatedKPIs = async (brandId, period = 'Last 30 Days') => {
    if (!supabase) return {};

    const { start, end } = getPeriodDates(period);

    const { data: transactions, error } = await supabase
        .from('platform_audit_logs')
        .select('*')
        .eq('brand_id', brandId)
        .in('action', ['wallet:debit', 'wallet:credit', 'wallet:bonus_credit'])
        .gte('timestamp', start)
        .lte('timestamp', end);

    if (error) {
        logger.error('[Supabase] Failed to fetch KPIs', { error: error.message });
        return {};
    }

    let totalDebits = 0;
    let totalCredits = 0;
    let totalBonuses = 0;
    let successfulTxs = 0;

    transactions.forEach(tx => {
        const amount = Math.abs(tx.metadata?.request?.amount || 0);

        if (tx.status === 'success') {
            successfulTxs++;
        }

        if (tx.action === 'wallet:debit') {
            totalDebits += amount;
        } else if (tx.action === 'wallet:credit') {
            totalCredits += amount;
        } else if (tx.action === 'wallet:bonus_credit') {
            totalBonuses += amount;
        }
    });

    const ggr = totalDebits - totalCredits;
    const deposits = 0; // Simulated for now

    const { count: activePlayers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .gt('last_login', start);

    // Bug fix: count ALL outbound events within selected period
    const { count: eventsSent } = await supabase
        .from('platform_audit_logs')
        .select('*', { count: 'exact', head: true })
        .or(`brand_id.eq.${brandId},brand_id.eq.1`)
        .gte('timestamp', start)
        .lte('timestamp', end)
        .not('action', 'ilike', 'inbound:%');

    const { count: complianceAlerts } = await supabase
        .from('platform_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .in('level', ['warn', 'error', 'critical'])
        .gte('timestamp', start)
        .lte('timestamp', end);

    // Approval Rate based on all transaction attempts in the set
    const approvalRate = transactions.length > 0 ? Math.round((successfulTxs / transactions.length) * 100) : 100;

    return {
        ggr: Number(ggr.toFixed(2)),
        ngr: Number((ggr - totalBonuses).toFixed(2)),
        bonuses: Number(totalBonuses.toFixed(2)),
        deposits,
        transaction_count: transactions.filter(t => t.action === 'wallet:debit').length,
        active_players: activePlayers || 0,
        approval_rate: approvalRate,
        events_sent: eventsSent || 0,
        compliance_alerts: complianceAlerts || 0
    };
};

const getComplianceAlerts = async (brandId, limit = 50, filters = {}) => {
    if (!supabase) return [];
    let query = supabase.from('platform_audit_logs').select('*').eq('brand_id', brandId).in('level', ['warn', 'error', 'critical']);

    if (filters.startDate) query = query.gte('timestamp', filters.startDate);
    if (filters.endDate) query = query.lte('timestamp', filters.endDate);
    if (filters.id) query = query.eq('id', filters.id);

    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit);
    if (error) return [];
    return data.map(log => ({ id: log.id, user: log.actor_id || 'System', trigger: log.action, risk: log.level === 'critical' ? 'High' : log.level === 'error' ? 'Medium' : 'Low', status: 'Open', date: log.timestamp, message: log.message, metadata: log.metadata }));
};

const getOperatorNotifications = async (brandId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('platform_audit_logs').select('*').eq('brand_id', brandId).in('level', ['warn', 'error', 'critical']).order('timestamp', { ascending: false }).limit(10);
    if (error) return [];
    return data.map(log => ({ id: log.id, type: log.level === 'critical' ? 'alert' : 'info', title: log.action.toUpperCase(), message: log.message, time: log.timestamp, read: false, metadata: log.metadata, severity: log.level === 'critical' ? 'Critical' : log.level === 'error' ? 'Warning' : 'Info' }));
};

const getOperatorStats = async (brandId, period = 'Last 30 Days') => {
    if (!supabase) return {};

    const kpis = await getAggregatedKPIs(brandId, period);
    const { start, end, days } = getPeriodDates(period);

    // Try daily_stats table first (PoC often uses this for speed)
    const { data: history } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('brand_id', brandId)
        .gte('date', start.substring(0, 10))
        .lte('date', end.substring(0, 10))
        .order('date', { ascending: true })
        .limit(days);

    let demoHistory = history && history.length > 0 ? history : [];

    if (demoHistory.length === 0) {
        // Build daily GGR/NGR from wallet:debit, wallet:credit, and wallet:bonus_credit audit logs
        const { data: auditLogs } = await supabase
            .from('platform_audit_logs')
            .select('*')
            .eq('brand_id', brandId)
            .in('action', ['wallet:debit', 'wallet:credit', 'wallet:bonus_credit'])
            .gte('timestamp', start)
            .lte('timestamp', end);

        if (auditLogs && auditLogs.length > 0) {
            const byDay = {};
            auditLogs.forEach(log => {
                const day = log.timestamp.substring(0, 10); // YYYY-MM-DD
                if (!byDay[day]) byDay[day] = { date: day, ggr: 0, ngr: 0, bonuses: 0 };

                const amount = Math.abs(log.metadata?.request?.amount || 0);
                if (log.action === 'wallet:debit') byDay[day].ggr += amount;
                else if (log.action === 'wallet:credit') byDay[day].ggr -= amount;
                else if (log.action === 'wallet:bonus_credit') byDay[day].bonuses += amount;
            });

            // Calculate final NGR per day
            Object.values(byDay).forEach(d => {
                d.ggr = Number(d.ggr.toFixed(2));
                d.bonuses = Number(d.bonuses.toFixed(2));
                d.ngr = Number((d.ggr - d.bonuses).toFixed(2));
            });

            demoHistory = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
        }

        // Final Fallback: Ensure history length matches the period requested
        // Using midnight-to-midnight logic
        const filledHistory = [];
        const endDateObj = new Date(end);
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(endDateObj);
            date.setDate(date.getDate() - i);
            const dStr = date.toISOString().substring(0, 10);
            const existing = demoHistory.find(d => d.date === dStr);
            filledHistory.push(existing || { date: dStr, ggr: 0, ngr: 0, bonuses: 0, active_players: 0, approval_rate: 0, compliance_alerts: 0, events_sent: 0 });
        }
        demoHistory = filledHistory;
    }

    const lastDay = demoHistory[demoHistory.length - 1] || { ggr: 0, active_players: 0, approval_rate: 0 };
    const prevDay = demoHistory[demoHistory.length - 2] || lastDay;
    const calculateTrend = (curr, prev) => (prev && prev !== 0) ? Math.round(((curr - prev) / prev) * 100) : 0;
    const enrichment = {
        active_players: { value: kpis.active_players, trend: calculateTrend(kpis.active_players, prevDay.active_players), sparkline: demoHistory.slice(-7).map(d => d.active_players) },
        ggr: { value: kpis.ggr, trend: calculateTrend(kpis.ggr, prevDay.ggr), sparkline: demoHistory.slice(-7).map(d => d.ggr) },
        approval_rate: { value: kpis.approval_rate, trend: calculateTrend(kpis.approval_rate, prevDay.approval_rate), sparkline: demoHistory.slice(-7).map(d => d.approval_rate) },
        compliance_alerts: { value: kpis.compliance_alerts, trend: calculateTrend(kpis.compliance_alerts, prevDay.compliance_alerts), sparkline: demoHistory.slice(-7).map(d => d.compliance_alerts) },
        events_sent: { value: kpis.events_sent, trend: calculateTrend(kpis.events_sent, prevDay.events_sent), sparkline: demoHistory.slice(-7).map(d => d.events_sent) }
    };
    const recentEvents = await getActivities(brandId, 5);
    return { ...kpis, metrics: enrichment, ggr_history: demoHistory, recent_events: recentEvents };
};

const createTransaction = async (txData) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('transactions').insert([{ transaction_id: txData.transaction_id, brand_id: txData.brand_id || 1, user_id: txData.user_id, type: txData.type, amount: txData.amount, status: txData.status || 'Success', currency: txData.currency || 'EUR', game_id: txData.game_id || null, metadata: txData.metadata || {}, created_at: new Date().toISOString() }]).select().single();
    if (error) return null;
    return data;
};

const acquireLock = async (transactionId, brandId) => {
    if (!supabase) return true;
    const { error } = await supabase.from('transaction_locks').insert([{ transaction_id: transactionId, brand_id: brandId || 1, status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() }]);
    if (error) return false;
    return true;
};

const searchOperatorGlobal = async (brandId, query) => {
    if (!supabase) return { players: [], transactions: [] };
    const usersQuery = supabase.from('users').select('id, user_id, username, email, balance').eq('brand_id', brandId);
    if (query) usersQuery.or(`username.ilike.%${query}%,email.ilike.%${query}%`);
    const normalizedBrandId = getBrandId(brandId);
    const txQuery = supabase.from('transactions').select('*, users!inner(user_id, username)').eq('brand_id', normalizedBrandId).order('created_at', { ascending: false }).limit(50);
    const [usersRes, transactionsRes] = await Promise.all([usersQuery.limit(20), txQuery]);
    const transactions = (transactionsRes.data || []).map(tx => ({ ...tx, public_user_id: tx.users?.user_id || tx.users?.username || tx.user_id, user_name: tx.users?.username }));
    return { players: usersRes.data || [], transactions };
};

const getUserByIdAndBrand = async (userId, brandId) => {
    if (!supabase) return null;
    
    // brand_id in 'users' table is typically a NUMBER in this schema
    // brand_id in 'tenant_configs' is a STRING
    const numericBrandId = parseInt(brandId, 10);

    // Fetch User without the problematic join
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('brand_id', numericBrandId)
        .or(`user_id.eq.${userId},username.eq.${userId}`)
        .maybeSingle();
        
    if (userError || !user) {
        if (userError) logger.error('[Supabase] getUserByIdAndBrand failed', { userId, brandId: numericBrandId, error: userError.message });
        return null; // Return null to correctly trigger the 404
    }

    // Fetch Profile explicitly
    let { data: profile, error: profileFetchError } = await supabase
        .from('player_profiles')
        .select('*')
        .eq('player_id', user.id)
        .maybeSingle();

    if (profileFetchError) {
        logger.error('[Supabase] Failed fetching player_profiles', { playerId: user.id, error: profileFetchError.message });
    }
    
    // Auto-create profile if missing
    if (!profile) {
        logger.info('[Supabase] Auto-creating missing profile for legacy player', { userId: user.id });
        const { data: newProfile, error: profileCreateError } = await supabase
            .from('player_profiles')
            .insert({
                player_id: user.id,
                tenant_id: String(brandId), // player_profiles.tenant_id is a string
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name
            })
            .select()
            .single();
            
        if (!profileCreateError) {
            profile = newProfile;
        } else {
            logger.error('[Supabase] Failed to auto-create missing profile', { userId: user.id, error: profileCreateError.message });
        }
    }
    
    // Flatten the profile data into the main object
    if (profile) {
        return { ...user, ...profile };
    }
    
    // If profile auto-creation failed (e.g. missing service role key locally), return defaults
    // so the UI still displays the GAMSTOP and risk flags accurately.
    return { 
        ...user,
        gamstop_blocked: false,
        bonus_suppressed: false,
        edd_pending: false,
        self_exclusion_type: null,
        self_exclusion_until: null
    };
};

const getFilteredPlayers = async (brandId, filters, page = 1, limit = 10) => {
    if (!supabase) return { players: [], total: 0, totalPages: 0 };
    let query = supabase.from('users').select('id, user_id, username, email, balance, country, last_login', { count: 'exact' }).eq('brand_id', brandId);
    if (filters.country) query = query.ilike('country', `%${filters.country}%`);
    if (filters.username) query = query.ilike('username', `%${filters.username}%`);
    if (filters.email) query = query.ilike('email', `%${filters.email}%`);
    if (filters.balance) {
        const { operator, value } = filters.balance;
        if (operator === '>') query = query.gt('balance', value);
        else if (operator === '>=') query = query.gte('balance', value);
        else if (operator === '=') query = query.eq('balance', value);
        else if (operator === '<') query = query.lt('balance', value);
        else if (operator === '<=') query = query.lte('balance', value);
    }
    if (filters.last_login) {
        const { operator, value } = filters.last_login;
        if (operator === '>') query = query.gt('last_login', value);
        else if (operator === '>=') query = query.gte('last_login', value);
        else if (operator === '=') query = query.eq('last_login', value);
        else if (operator === '<') query = query.lt('last_login', value);
        else if (operator === '<=') query = query.lte('last_login', value);
    }
    const offset = (page - 1) * limit;
    query = query.order('last_login', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) return { players: [], total: 0, totalPages: 0 };

    const players = data || [];

    // Fetch profiles for these players to attach DoC fields
    if (players.length > 0) {
        const userIds = players.map(u => u.id);
        const { data: profiles, error: profileError } = await supabase
            .from('player_profiles')
            .select('player_id, gamstop_blocked, bonus_suppressed')
            .in('player_id', userIds);
            
        if (!profileError && profiles) {
            const profileMap = profiles.reduce((acc, p) => {
                acc[p.player_id] = p;
                return acc;
            }, {});
            
            players.forEach(u => {
                if (profileMap[u.id]) {
                    u.gamstop_blocked = profileMap[u.id].gamstop_blocked || false;
                    u.bonus_suppressed = profileMap[u.id].bonus_suppressed || false;
                } else {
                    u.gamstop_blocked = false;
                    u.bonus_suppressed = false;
                }
            });
        }
    }

    return { players, total: count || 0, totalPages: Math.ceil((count || 0) / limit), currentPage: page };
};

const getFilteredTransactions = async (brandId, filters, page = 1, limit = 10) => {
    if (!supabase) return { transactions: [], total: 0, totalPages: 0 };
    let query = supabase.from('transactions').select('*, users!inner(user_id, username)', { count: 'exact' }).eq('brand_id', brandId);
    if (filters.transaction_id) query = query.ilike('transaction_id', `%${filters.transaction_id}%`);
    if (filters.user) query = query.ilike('users.username', `%${filters.user}%`);
    
    if (filters.type === 'GGR') {
        query = query.in('type', ['DEPOSIT', 'WITHDRAWAL']);
    } else if (filters.type) {
        query = query.ilike('type', `%${filters.type}%`);
    }
    if (filters.amount) {
        const { operator, value } = filters.amount;
        if (operator === '>') query = query.gt('amount', value);
        else if (operator === '>=') query = query.gte('amount', value);
        else if (operator === '=') query = query.eq('amount', value);
        else if (operator === '<') query = query.lt('amount', value);
        else if (operator === '<=') query = query.lte('amount', value);
    }
    if (filters.date) {
        const { operator, value } = filters.date;
        if (operator === '>') query = query.gt('created_at', value);
        else if (operator === '>=') query = query.gte('created_at', value);
        else if (operator === '=') query = query.eq('created_at', value);
        else if (operator === '<') query = query.lt('created_at', value);
        else if (operator === '<=') query = query.lte('created_at', value);
    }
    if (filters.status) query = query.ilike('status', `%${filters.status}%`);
    const offset = (page - 1) * limit;
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) return { transactions: [], total: 0, totalPages: 0 };
    const transactions = (data || []).map(tx => ({ ...tx, public_user_id: tx.users?.user_id || tx.users?.username || tx.user_id, user: tx.users?.username || tx.user_id }));
    return { transactions, total: count || 0, totalPages: Math.ceil((count || 0) / limit), currentPage: page };
};

const getOperationalStream = async (brandId, page = 1, limit = 20, filters = {}) => {
    if (!supabase) return { events: [], total: 0, totalPages: 0 };
    let query = supabase.from('platform_audit_logs').select('*', { count: 'exact' }).or(`brand_id.eq.${brandId},brand_id.eq.1`);

    if (filters.type === 'inbound') query = query.ilike('action', 'inbound:%');
    else if (filters.type === 'outbound') query = query.not('action', 'ilike', 'inbound:%');

    if (filters.startDate) query = query.gte('timestamp', filters.startDate);
    if (filters.endDate) query = query.lte('timestamp', filters.endDate);

    const { data, error, count } = await query.order('timestamp', { ascending: false }).limit(100);
    if (error) return { events: [], total: 0, totalPages: 0 };
    const allEvents = (data || []).map(log => {
        const isInbound = log.action.startsWith('inbound:');
        let method = 'POST', endpoint = log.action;
        if (isInbound) {
            method = log.action.split(':')[1]?.toUpperCase() || 'ACTION';
            endpoint = log.entity_id ? `User: ${log.entity_id}` : 'System';
        } else {
            const parts = log.action.split(':');
            if (parts.length >= 3) {
                method = 'FT-PUSH', endpoint = parts[2].toUpperCase();
            } else if (parts.length === 2 && parts[0] === 'push_event') {
                method = 'FT-PUSH', endpoint = parts[1].toUpperCase();
            }
        }
        return { 
            id: log.id, 
            type: isInbound ? 'inbound' : 'outbound', 
            method, 
            endpoint, 
            message: log.message, 
            status: (log.status === 'success' || !log.status) && log.level !== 'error' ? 200 : 500, 
            payload: log.metadata || {}, 
            timestamp: log.timestamp 
        };
    });
    const offset = (page - 1) * limit;
    const paginatedEvents = allEvents.slice(offset, offset + limit);
    return { events: paginatedEvents, total: Math.min(allEvents.length, 100), totalPages: Math.ceil(Math.min(allEvents.length, 100) / limit), currentPage: page };
};

const getActivePromotions = async (brandId = 1) => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('bonus_templates')
        .select('*')
        .eq('active', true);

    if (error) {
        logger.error('[Supabase] Failed to fetch active promotions', { error: error.message });
        return [];
    }
    return data || [];
};

module.exports = {
    supabase,
    client: supabase,

    getTenantConfig,
    saveAuditLog,
    getUser,
    getUserById,
    getUserConsents,
    getUserBlocks,
    updateUser,
    createUser,
    updateBalance,
    getActivities,
    getTransactionsByOperator,
    getAggregatedKPIs,
    getComplianceAlerts,
    getOperatorNotifications,
    getOperatorStats,
    searchOperatorGlobal,
    getUserByIdAndBrand,
    createTransaction,
    acquireLock,
    getFilteredPlayers,
    getFilteredTransactions,
    getOperationalStream,
    getBrandId,
    updateOperatorApiKey,
    upsertPlayerProfile,
    logKycEvent,
    getUserFavourites,
    toggleFavourite,
    getRecentlyPlayed,
    trackActivity,
    getUserTransactions,
    getActivePromotions,
    getPeriodDates
};
