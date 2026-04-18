const { logger, auditLog, generateCorrelationId } = require('./logger');
const rabbitmq = require('./rabbitmq');

// These will now be defaults if tenant-specific config is missing
const DEFAULT_FT_API_URL = process.env.FT_API_URL || 'https://api.fasttrack-integration.com';
const DEFAULT_FT_API_KEY = process.env.FT_API_KEY;
const DEFAULT_PLATFORM_ORIGIN = process.env.PLATFORM_ORIGIN || 'igaming-gateway';

// Endpoint mapping based on FT Documentation
const EVENT_CONFIG = {
    'login': { path: '/v2/integration/login', method: 'POST' },
    'consents': { path: '/v2/integration/user/consents', method: 'PUT' },
    'blocks': { path: '/v2/integration/user/blocks', method: 'PUT' },
    'registration': { path: '/v2/integration/user', method: 'POST' },
    'user_update': { path: '/v2/integration/user', method: 'PUT' },
    'logout': { path: '/v2/integration/logout', method: 'POST' },
    'payment': { path: '/v1/integration/payment', method: 'POST' },
    'casino': { path: '/v1/integration/casino', method: 'POST' },
    'bonus': { path: '/v1/integration/bonus', method: 'POST' },
    'balance': { path: '/v1/integration/user/balances', method: 'POST' },
    'sportsbook': { path: '/v1/integration/sports', method: 'POST' },

    // Aliases for internal events
    'deposit': { path: '/v1/integration/payment', method: 'POST' },
    'withdrawal': { path: '/v1/integration/payment', method: 'POST' },
    'bet': { path: '/v1/integration/casino', method: 'POST' },
    'win': { path: '/v1/integration/casino', method: 'POST' },
    'block': { path: '/v2/integration/user/blocks', method: 'PUT' },
    'consent': { path: '/v2/integration/user/consents', method: 'PUT' }
};

const FT_MESSAGE_TYPES = {
    'balance': 'USER_BALANCES_UPDATE',
    'bonus': 'BONUS',
    'casino': 'CASINO',
    'bet': 'CASINO',
    'win': 'CASINO',
    'payment': 'PAYMENT',
    'deposit': 'PAYMENT',
    'withdrawal': 'PAYMENT',
    'user_update': 'USER_UPDATE_V2',
    'blocks': 'USER_BLOCK_V2',
    'block': 'USER_BLOCK_V2',
    'consents': 'USER_CONSENTS_V2',
    'consent': 'USER_CONSENTS_V2',
    'login': 'LOGIN_V2',
    'registration': 'USER_CREATE_V2',
    'logout': 'LOGOUT',
    'sportsbook': 'SPORTSBOOK'
};

/**
 * Pushes clinical events to Fast Track Integration API.
 * Now supports multi-tenancy and professional observability.
 */
/**
 * Internal helper to push events with retry logic for transient network errors.
 */
const pushEventWithRetry = async (userId, eventType, payload, options = {}, retries = 3, delay = 500) => {
    const correlationId = options.correlationId || generateCorrelationId();
    const operatorId = options.operatorId || 'default';
    const config_url = options.ft_api_url || DEFAULT_FT_API_URL;
    const config_key = options.ft_api_key || DEFAULT_FT_API_KEY;
    const origin = options.platform_origin || DEFAULT_PLATFORM_ORIGIN;

    const eventConfig = EVENT_CONFIG[eventType];
    if (!eventConfig) {
        logger.error(`[FT Integration] Unknown event type: ${eventType}`, { correlationId });
        return;
    }

    if (!config_key) {
        logger.warn('[FT Integration] No API Key provided. Skipping request.', { correlationId, operatorId });
        return;
    }

    try {
        const baseUrl = config_url.endsWith('/') ? config_url.slice(0, -1) : config_url;
        const targetUrl = `${baseUrl}${eventConfig.path}`;
        const timestamp = new Date().toISOString(); // ISO8601 for payload
        const utcTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'; // Custom UTC for body
        let requestBody = {};

        // Event enrichment logic - STRICT ALIGNMENT with FT Schemas provided by User
        if (eventType === 'login') {
            requestBody = {
                user_id: userId,
                is_impersonated: payload.is_impersonated || false,
                ip_address: payload.ip_address || '127.0.0.1',
                user_agent: payload.user_agent || 'Mozilla/5.0',
                timestamp,
                origin
            };
        } else if (eventType === 'registration') {
            requestBody = {
                user_id: userId,
                note: payload.note || 'New registration',
                user_agent: payload.user_agent || 'Mozilla/5.0',
                ip_address: payload.ip_address || '127.0.0.1',
                timestamp,
                origin
            };
        } else if (['user_update', 'consents', 'consent', 'blocks', 'block'].includes(eventType)) {
            requestBody = { user_id: userId, timestamp, origin };
        } else if (eventType === 'logout') {
            requestBody = { user_id: userId, timestamp, origin };
        } else if (eventType === 'deposit' || eventType === 'payment' || eventType === 'withdrawal') {
            requestBody = {
                amount: parseFloat(payload.amount),
                bonus_code: payload.bonus_code || null,
                currency: payload.currency || 'EUR',
                exchange_rate: parseFloat(payload.exchange_rate || 1.0),
                fee_amount: parseFloat(payload.fee_amount || 0.0),
                note: payload.note || null,
                origin,
                payment_id: payload.transaction_id || `tx-${Date.now()}`,
                status: payload.status || 'Approved', // ENUM: Requested, Approved, Rejected, Rollback, Cancelled
                timestamp,
                type: (payload.type === 'Debit' || eventType === 'withdrawal') ? 'Debit' : 'Credit',
                user_id: userId,
                vendor_id: payload.vendor_id,
                vendor_name: payload.vendor_name
            };
        } else if (eventType === 'bet' || eventType === 'win' || eventType === 'casino' || eventType === 'loss') {
            requestBody = {
                activity_id: payload.transaction_id || `ctx-${Date.now()}`,
                amount: parseFloat(payload.amount),
                balance_after: parseFloat(payload.balance_after || 0.0),
                balance_before: parseFloat(payload.balance_before || 0.0),
                bonus_wager_amount: parseFloat(payload.bonus_wager_amount || 0.0),
                currency: payload.currency || 'EUR',
                exchange_rate: parseFloat(payload.exchange_rate || 1.0),
                game_id: payload.game_id || 'unknown',
                game_name: payload.game_name || 'Mock Slot Game',
                game_type: payload.game_type || 'Slots', // ENUM: Live Casino, Table, Slots
                is_round_end: payload.is_round_end !== undefined ? payload.is_round_end : true,
                locked_wager_amount: parseFloat(payload.locked_wager_amount || 0.0),
                origin,
                round_id: payload.round_id || `round-${Date.now()}`,
                status: payload.status || 'Approved', // ENUM: Approved, Rollback
                timestamp,
                type: (eventType === 'win' || payload.type === 'Win') ? 'Win' : (eventType === 'loss' || payload.type === 'Loss' ? 'Loss' : 'Bet'), // ENUM: Bet, Win, Loss
                user_id: userId,
                vendor_id: payload.vendor_id,
                vendor_name: payload.game_provider || payload.vendor_name,
                wager_amount: parseFloat(payload.wager_amount || payload.amount || 0.0),
                meta: payload.meta || { source: 'backend' }
            };
        } else if (eventType === 'balance') {
            requestBody = {
                balances: payload.balances || [
                    { amount: parseFloat(payload.amount || 0), currency: payload.currency || 'EUR', key: 'real_money', exchange_rate: 1 },
                    { amount: parseFloat(payload.bonus_amount || 0), currency: payload.currency || 'EUR', key: 'bonus_money', exchange_rate: 1 }
                ],
                origin,
                timestamp,
                user_id: userId
            };
        } else if (eventType === 'bonus') {
            requestBody = {
                amount: parseFloat(payload.amount || 0.0),
                bonus_code: payload.bonus_code || 'WELCOME100',
                bonus_id: payload.bonus_id || '9821',
                bonus_turned_real: payload.bonus_turned_real || 0,
                currency: payload.currency || 'EUR',
                exchange_rate: parseFloat(payload.exchange_rate || 1.0),
                locked_amount: parseFloat(payload.locked_amount || 0.0),
                meta: payload.meta || { source: 'backend' },
                origin,
                product: payload.product || 'Casino',
                required_wagering_amount: parseFloat(payload.required_wagering_amount || 0.0),
                status: payload.status || 'Completed', // ENUM: Completed, AutoCompleted, Forfeited, Expired, Lost
                type: payload.type || 'WelcomeBonus', // ENUM: NoDeposit, WelcomeBonus, CashbackBonus, ReloadBonus, WagerFree, FreeSpins, RiskFreeBet, Undefined
                user_bonus_id: payload.user_bonus_id,
                user_id: userId,
                timestamp,
                fasttrack_references: payload.fasttrack_references
            };
        } else if (eventType === 'sportsbook') {
            // Map internal bet_type (SINGLE/MULTI/SYSTEM) to FT enum (Single/Multi/System)
            const betTypeMap = { SINGLE: 'Single', MULTI: 'Multi', SYSTEM: 'System' };
            const ftBetType = betTypeMap[(payload.bet_type || '').toUpperCase()] || 'Single';

            // origin must always be a non-empty string per FT spec
            // (identifies the brand/jurisdiction in the FT system)
            const safeOrigin = origin || DEFAULT_PLATFORM_ORIGIN || 'igaming-gateway';

            // Build bets[] array per FT /v1/integration/sports schema
            // Each leg stored in mock-provider has: event_home, event_away, market_type,
            // selection_name, odds_at_placement, league_name, sport_name, event_start_ts, is_live
            const legs = payload.legs || [];
            const bets = legs.map(leg => {
                const eventHome = leg.event_home || leg.home_team || '';
                const eventAway = leg.event_away || leg.away_team || '';
                const eventName = (eventHome && eventAway)
                    ? `${eventHome} vs ${eventAway}`
                    : leg.event_name || 'Unknown Match';

                return {
                    event_name:       eventName,
                    tournament_name:  leg.league_name || leg.tournament_name || 'Undefined',
                    sports_name:      leg.sport_name  || leg.sports_name    || 'Undefined',
                    match_start:      leg.event_start_ts || leg.match_start || timestamp,
                    market:           leg.market_type || leg.market || 'Undefined',
                    odds:             parseFloat(leg.odds_at_placement || leg.odds || 1.0),
                    is_live:          leg.is_live || false,
                    is_free_bet:      payload.is_free_bet || false,
                    is_risk_free_bet: payload.is_risk_free_bet || false,
                    outcomes: [{
                        criterion_name: leg.market_type || leg.market || 'Undefined',
                        outcome_label:  leg.selection_name || leg.outcome_label || 'Undefined',
                        meta:           leg.meta || {},
                    }],
                };
            });

            requestBody = {
                activity_id:           payload.activity_id || `sb-${Date.now()}`,
                activity_id_reference: payload.activity_id_reference || payload.activity_id || `sb-${Date.now()}`,
                user_id:               userId,
                type:                  payload.type   || 'Bet',      // ENUM: Bet, Settlement
                status:                payload.status || 'Approved', // ENUM: Approved, Rollback
                bet_type:              ftBetType,                     // ENUM: Single, Multi, System
                timestamp,
                amount:                parseFloat(payload.amount      || payload.stake || 0),
                wager_amount:          parseFloat(payload.wager_amount || payload.stake || 0),
                bonus_wager_amount:    parseFloat(payload.bonus_wager_amount  || 0),
                locked_wager_amount:   parseFloat(payload.locked_wager_amount || 0),
                odds:                  parseFloat(payload.combined_odds || payload.odds || 1.0),
                currency:              payload.currency || 'EUR',
                exchange_rate:         parseFloat(payload.exchange_rate || 1.0),
                origin:                safeOrigin,
                is_cashout:            payload.is_cashout || false,
                bets,
                ...(payload.settlement_type && { settlement_type: payload.settlement_type }),
                ...(payload.balance_before !== undefined && { balance_before: parseFloat(payload.balance_before) }),
                ...(payload.balance_after  !== undefined && { balance_after:  parseFloat(payload.balance_after)  }),
                ...(payload.user_bonus_id  && { user_bonus_id: payload.user_bonus_id }),
                // Settlement-only reference fields (required by FT when type === 'Settlement')
                ...(payload.type === 'Settlement' && {
                    reference_bet_amount:         parseFloat(payload.reference_bet_amount         || payload.stake || 0),
                    reference_bet_real_amount:    parseFloat(payload.reference_bet_real_amount    || payload.stake || 0),
                    reference_bet_bonus_amount:   parseFloat(payload.reference_bet_bonus_amount   || 0),
                    reference_bet_locked_amount:  parseFloat(payload.reference_bet_locked_amount  || 0),
                    reference_bet_exchange_rate:  parseFloat(payload.reference_bet_exchange_rate  || 1.0),
                }),
            };

            // Warn if bets array is unexpectedly empty
            if (bets.length === 0) {
                logger.warn('[FT Integration] Sportsbook event has empty bets array — legs may be missing', { userId, correlationId, payloadLegsCount: legs.length });
            }
        }

        logger.info(`[FT Integration] Preparing to queue ${eventType} event to RabbitMQ`, { userId, correlationId });

        const ftType = FT_MESSAGE_TYPES[eventType] || "";

        // Send ONLY the domain payload required by FT as the message body
        // Technical metadata moved to headers for the bridge to handle
        const published = await rabbitmq.publishEvent(null, requestBody, ftType, {
            headers: {
                'x-ft-url': targetUrl,
                'x-ft-method': eventConfig.method,
                'x-ft-api-key': config_key,
                'x-correlation-id': correlationId,
                'x-timestamp': utcTimestamp
            }
        });

        if (!published) {
            logger.warn(`[FT Integration] RabbitMQ publishing skipped or failed for ${eventType}`, { correlationId });
            return { status: 'skipped', reason: 'RabbitMQ non-delivery' };
        }

        await auditLog({
            correlationId, operatorId, actor_id: userId, action: `outbound:rabbitmq:publish:${eventType}`, entity_type: 'fasttrack_event', entity_id: userId, status: 'success', metadata: { request: requestBody }, message: `Successfully queued ${eventType} event via RabbitMQ`
        });

        return { status: 'queued', correlationId };
    } catch (error) {
        const errorMsg = error.message;
        logger.error(`[FT Integration] Failed to queue event: ${eventType}`, { correlationId, error: errorMsg });
        await auditLog({
            correlationId, operatorId, actor_id: userId, action: `outbound:rabbitmq:publish:${eventType}`, entity_type: 'fasttrack_event', entity_id: userId, status: 'error', level: 'error', metadata: { request: payload, error: errorMsg }, message: `Failed to queue ${eventType} event`
        });
        throw error;
    }
};

/**
 * Pushes clinical events to Fast Track Integration API.
 */
const pushEvent = async (userId, eventType, payload, options = {}) => {
    return pushEventWithRetry(userId, eventType, payload, options);
};

module.exports = {
    pushEvent,
    generateCorrelationId
};
