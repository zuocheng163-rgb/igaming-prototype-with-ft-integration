'use strict';

const supabaseService = require('../supabase');
const { logger } = require('../logger');

// ── In-memory store for mock data ────────────────────────────────────────────
// When Supabase is unavailable we fall back to in-memory tables.

let memSports = [
    { id: 1, name: 'Football',   slug: 'football',   icon_url: null, display_order: 1 },
    { id: 2, name: 'Basketball', slug: 'basketball', icon_url: null, display_order: 2 },
    { id: 3, name: 'Tennis',     slug: 'tennis',     icon_url: null, display_order: 3 },
    { id: 4, name: 'Esports',    slug: 'esports',    icon_url: null, display_order: 4 },
];

let memLeagues = [
    { id: 1, sport_id: 1, country_code: 'GB', name: 'Premier League',      slug: 'premier-league', season: '2025/26', display_order: 1 },
    { id: 2, sport_id: 1, country_code: 'ES', name: 'La Liga',              slug: 'la-liga',        season: '2025/26', display_order: 2 },
    { id: 3, sport_id: 1, country_code: 'NS', name: 'NeoStrike Demo League',slug: 'neostrike-demo', season: '2026',    display_order: 99 },
];

// ── Synthetic event generator ─────────────────────────────────────────────────

let nextEventId = 1000;
let nextMarketId = 2000;
let nextSelectionId = 3000;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round2 = (v) => Math.round(v * 100) / 100;

function makeSelections(marketType, baseHomeOdds, baseDrawOdds, baseAwayOdds) {
    const now = Date.now();
    if (marketType === '1X2') {
        return [
            { id: nextSelectionId++, name: '1 (Home)', line: null, current_odds: baseHomeOdds, previous_odds: null, status: 'open' },
            { id: nextSelectionId++, name: 'X (Draw)', line: null, current_odds: baseDrawOdds, previous_odds: null, status: 'open' },
            { id: nextSelectionId++, name: '2 (Away)', line: null, current_odds: baseAwayOdds, previous_odds: null, status: 'open' },
        ];
    }
    if (marketType === 'OVER_UNDER_2_5') {
        return [
            { id: nextSelectionId++, name: 'Over 2.5',  line: 2.5, current_odds: 1.85, previous_odds: null, status: 'open' },
            { id: nextSelectionId++, name: 'Under 2.5', line: 2.5, current_odds: 1.95, previous_odds: null, status: 'open' },
        ];
    }
    if (marketType === 'BTTS') {
        return [
            { id: nextSelectionId++, name: 'Yes', line: null, current_odds: 1.75, previous_odds: null, status: 'open' },
            { id: nextSelectionId++, name: 'No',  line: null, current_odds: 2.05, previous_odds: null, status: 'open' },
        ];
    }
    return [];
}

function makeEvent(leagueId, homeTeam, awayTeam, startOffsetMs, homeOdds, drawOdds, awayOdds, status = 'upcoming') {
    const eventId = nextEventId++;
    const market1 = {
        id: nextMarketId++,
        event_id: eventId,
        type: '1X2',
        status: 'open',
        min_stake: 0.5,
        max_stake: 10000,
        selections: makeSelections('1X2', homeOdds, drawOdds, awayOdds),
    };
    const market2 = {
        id: nextMarketId++,
        event_id: eventId,
        type: 'OVER_UNDER_2_5',
        status: 'open',
        min_stake: 0.5,
        max_stake: 10000,
        selections: makeSelections('OVER_UNDER_2_5'),
    };
    const market3 = {
        id: nextMarketId++,
        event_id: eventId,
        type: 'BTTS',
        status: 'open',
        min_stake: 0.5,
        max_stake: 10000,
        selections: makeSelections('BTTS'),
    };

    return {
        id: eventId,
        league_id: leagueId,
        home_team: homeTeam,
        away_team: awayTeam,
        start_ts: new Date(Date.now() + startOffsetMs).toISOString(),
        status,
        provider_event_id: `mock-${eventId}`,
        stream_url: status === 'live' ? `https://stream.neostrike.io/mock/${eventId}` : null,
        created_at: new Date().toISOString(),
        markets: [market1, market2, market3],
    };
}

// Build a fixed set of in-memory events (the "NeoStrike Demo" event is always present)
let memEvents = [
    makeEvent(3, 'NeoStrike United', 'Demo FC', -1000 * 60 * 5, 2.10, 3.30, 3.70, 'live'),   // live
    makeEvent(1, 'Arsenal',          'Chelsea',      1000 * 60 * 60 * 2,  2.20, 3.40, 3.20), // upcoming
    makeEvent(1, 'Man City',         'Liverpool',    1000 * 60 * 60 * 5,  1.95, 3.50, 3.90), // upcoming
    makeEvent(2, 'Real Madrid',      'Barcelona',    1000 * 60 * 60 * 24, 2.30, 3.20, 3.00), // upcoming
    makeEvent(1, 'Tottenham',        'Man United',   1000 * 60 * 60 * 48, 2.60, 3.10, 2.70), // upcoming
    makeEvent(3, 'Alpha FC',         'Beta City',    1000 * 60 * 60 * 3,  3.00, 3.20, 2.40), // upcoming
];

// ── In-memory bets store ──────────────────────────────────────────────────────

let memBets = []; // { ...sb_bets row, legs: [...sb_bet_legs rows + selection snapshot] }

// ── Helper: get supabase client safely ───────────────────────────────────────

function db() {
    return supabaseService.client || null;
}

// ── Helpers to find selection / market / event from memEvents ────────────────

function findEventById(id) {
    return memEvents.find(e => e.id === parseInt(id, 10));
}

function findSelectionById(selectionId) {
    for (const ev of memEvents) {
        for (const mkt of ev.markets) {
            const sel = mkt.selections.find(s => s.id === parseInt(selectionId, 10));
            if (sel) return { selection: sel, market: mkt, event: ev };
        }
    }
    return null;
}

// ── Odds drift simulation ─────────────────────────────────────────────────────

// Map of eventId -> { intervalId, listeners: Set<fn> }
const oddsSubscriptions = new Map();

function driftOdds(event) {
    for (const mkt of event.markets) {
        if (mkt.status !== 'open') continue;
        for (const sel of mkt.selections) {
            if (sel.status !== 'open') continue;
            sel.previous_odds = sel.current_odds;
            const drift = 1 + (Math.random() - 0.5) * 0.10; // ±5%
            sel.current_odds = round2(clamp(sel.current_odds * drift, 1.05, 20));
        }
    }
}

function getOddsSnapshot(event) {
    return {
        event_id: event.id,
        ts: new Date().toISOString(),
        markets: event.markets.map(mkt => ({
            id: mkt.id,
            type: mkt.type,
            status: mkt.status,
            selections: mkt.selections.map(s => ({
                id: s.id,
                name: s.name,
                line: s.line,
                current_odds: s.current_odds,
                previous_odds: s.previous_odds,
                status: s.status,
            })),
        })),
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * listSports() → [{ id, name, slug, icon_url, display_order, event_count }]
 */
async function listSports() {
    try {
        const client = db();
        if (client) {
            const { data: sports, error } = await client.from('sports').select('*').order('display_order');
            if (!error && sports && sports.length) {
                // Attach event counts from memEvents (since sb_events may not exist yet)
                const eventsByLeague = {};
                for (const ev of memEvents) {
                    eventsByLeague[ev.league_id] = (eventsByLeague[ev.league_id] || 0) + 1;
                }
                const leagueSportMap = {};
                const { data: leagues } = await client.from('leagues').select('id, sport_id');
                if (leagues) leagues.forEach(l => { leagueSportMap[l.id] = l.sport_id; });

                const sportCounts = {};
                for (const [lid, count] of Object.entries(eventsByLeague)) {
                    const sid = leagueSportMap[lid];
                    if (sid) sportCounts[sid] = (sportCounts[sid] || 0) + count;
                }

                return sports.map(s => ({ ...s, event_count: sportCounts[s.id] || 0 }));
            }
        }
    } catch (err) {
        logger.warn('[Sportsbook] DB unavailable for listSports, using mem fallback', { error: err.message });
    }

    // Fallback: in-memory
    const eventsByLeague = {};
    for (const ev of memEvents) {
        eventsByLeague[ev.league_id] = (eventsByLeague[ev.league_id] || 0) + 1;
    }
    const sportCounts = {};
    for (const league of memLeagues) {
        const cnt = eventsByLeague[league.id] || 0;
        sportCounts[league.sport_id] = (sportCounts[league.sport_id] || 0) + cnt;
    }

    return memSports.map(s => ({ ...s, event_count: sportCounts[s.id] || 0 }));
}

/**
 * listLeagues(sportSlug) → [{ id, sport_id, country_code, name, slug, season, display_order }]
 */
async function listLeagues(sportSlug) {
    try {
        const client = db();
        if (client) {
            const { data: sport } = await client.from('sports').select('id').eq('slug', sportSlug).maybeSingle();
            if (sport) {
                const { data: leagues, error } = await client.from('leagues').select('*').eq('sport_id', sport.id).order('display_order');
                if (!error && leagues && leagues.length) return leagues;
            }
        }
    } catch (err) {
        logger.warn('[Sportsbook] DB unavailable for listLeagues, using mem fallback', { error: err.message });
    }

    const sport = memSports.find(s => s.slug === sportSlug);
    if (!sport) return [];
    return memLeagues.filter(l => l.sport_id === sport.id);
}

/**
 * listEvents(filter) → [event, ...]  (without full market detail)
 * filter: { league, status, from, to }
 */
async function listEvents(filter = {}) {
    let events = memEvents.map(ev => ({ ...ev, markets: ev.markets.slice(0, 1) })); // include first market only in list

    if (filter.status) {
        events = events.filter(e => e.status === filter.status);
    }
    if (filter.league) {
        // filter.league is a league slug
        const league = memLeagues.find(l => l.slug === filter.league);
        if (league) events = events.filter(e => e.league_id === league.id);
    }
    if (filter.from) {
        const from = new Date(filter.from);
        events = events.filter(e => new Date(e.start_ts) >= from);
    }
    if (filter.to) {
        const to = new Date(filter.to);
        events = events.filter(e => new Date(e.start_ts) <= to);
    }

    // Attach league info
    return events.map(ev => {
        const league = memLeagues.find(l => l.id === ev.league_id);
        const sport = league ? memSports.find(s => s.id === league.sport_id) : null;
        return { ...ev, league, sport };
    });
}

/**
 * getEvent(id) → full event with all markets and selections
 */
async function getEvent(id) {
    const event = findEventById(id);
    if (!event) return null;
    const league = memLeagues.find(l => l.id === event.league_id);
    const sport = league ? memSports.find(s => s.id === league.sport_id) : null;
    return { ...event, league, sport };
}

/**
 * subscribeOdds(eventId, onChange) → unsubscribeFn
 * Simulates odds drift every 30 seconds.
 */
function subscribeOdds(eventId, onChange) {
    const event = findEventById(eventId);
    if (!event) return () => {};

    if (!oddsSubscriptions.has(eventId)) {
        const listeners = new Set();
        const intervalId = setInterval(() => {
            driftOdds(event);
            const snapshot = getOddsSnapshot(event);
            for (const fn of listeners) {
                try { fn(snapshot); } catch (_) {}
            }
        }, 30000);
        oddsSubscriptions.set(eventId, { intervalId, listeners });
    }

    const sub = oddsSubscriptions.get(eventId);
    sub.listeners.add(onChange);

    // Send initial snapshot immediately
    setTimeout(() => {
        try { onChange(getOddsSnapshot(event)); } catch (_) {}
    }, 0);

    return () => {
        const sub = oddsSubscriptions.get(eventId);
        if (!sub) return;
        sub.listeners.delete(onChange);
        if (sub.listeners.size === 0) {
            clearInterval(sub.intervalId);
            oddsSubscriptions.delete(eventId);
        }
    };
}

/**
 * placeBet(bet) → { bet_id, status, potential_payout, message }
 * bet: { player_id, bet_type, stake, currency, legs: [{ selection_id, odds }] }
 */
async function placeBet(bet) {
    const { player_id, bet_type = 'SINGLE', stake, currency = 'EUR', legs = [] } = bet;

    if (!player_id) throw new Error('MISSING_PLAYER_ID');
    if (!stake || stake < 0.5) throw new Error('STAKE_TOO_LOW');
    if (!legs.length) throw new Error('NO_SELECTIONS');

    // Validate all selections exist and are open
    const resolvedLegs = [];
    for (const leg of legs) {
        const found = findSelectionById(leg.selection_id);
        if (!found) throw new Error(`SELECTION_NOT_FOUND:${leg.selection_id}`);
        if (found.selection.status !== 'open') throw new Error(`SELECTION_SUSPENDED:${leg.selection_id}`);
        if (found.market.status !== 'open') throw new Error(`MARKET_SUSPENDED:${leg.selection_id}`);
        resolvedLegs.push({ ...found, odds_at_placement: found.selection.current_odds });
    }

    // Calculate potential payout
    let combinedOdds = resolvedLegs.reduce((acc, l) => acc * l.odds_at_placement, 1);
    combinedOdds = round2(combinedOdds);
    const potential_payout = round2(stake * combinedOdds);

    const betId = `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const betRecord = {
        id: betId,
        player_id,
        bet_type,
        stake,
        currency,
        potential_payout,
        status: 'active',
        cash_out_value: null,
        placed_ts: new Date().toISOString(),
        settled_ts: null,
        legs: resolvedLegs.map(l => ({
            id: nextSelectionId++,
            bet_id: betId,
            selection_id: l.selection.id,
            selection_name: l.selection.name,
            event_home: l.event.home_team,
            event_away: l.event.away_team,
            market_type: l.market.type,
            odds_at_placement: l.odds_at_placement,
            status: 'pending',
        })),
    };

    memBets.push(betRecord);
    logger.info('[Sportsbook] Bet placed', { betId, player_id, stake, potential_payout });

    return {
        bet_id: betId,
        status: 'active',
        potential_payout,
        combined_odds: combinedOdds,
        message: 'Bet placed successfully',
    };
}

/**
 * cashOutQuote(betId) → { quote_id, cash_out_value, expires_at } or null
 */
async function cashOutQuote(betId) {
    const bet = memBets.find(b => b.id === betId);
    if (!bet) return null;
    if (bet.status !== 'active') return null;

    // Simple: 70% of potential payout
    const cashOutValue = round2((bet.potential_payout || 0) * 0.70);
    const quoteId = `co-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30000).toISOString(); // 30 sec validity

    return {
        quote_id: quoteId,
        bet_id: betId,
        cash_out_value: cashOutValue,
        expires_at: expiresAt,
    };
}

/**
 * acceptCashOut(betId, quoteId) → { success, cash_out_value }
 */
async function acceptCashOut(betId, quoteId) {
    const bet = memBets.find(b => b.id === betId);
    if (!bet) throw new Error('BET_NOT_FOUND');
    if (bet.status !== 'active') throw new Error('BET_NOT_ACTIVE');

    const cashOutValue = round2((bet.potential_payout || 0) * 0.70);
    bet.status = 'cashed_out';
    bet.cash_out_value = cashOutValue;
    bet.settled_ts = new Date().toISOString();

    logger.info('[Sportsbook] Cash out accepted', { betId, cashOutValue });
    return { success: true, cash_out_value: cashOutValue };
}

/**
 * getPlayerBets(playerId, filter) → [bet, ...]
 * filter: { status }
 */
async function getPlayerBets(playerId, filter = {}) {
    let bets = memBets.filter(b => b.player_id === playerId);
    if (filter.status) {
        bets = bets.filter(b => b.status === filter.status);
    }
    return bets.sort((a, b) => new Date(b.placed_ts) - new Date(a.placed_ts));
}

/**
 * settle(eventId) → { settled: count }
 * Randomly settles bets for an event's selections.
 */
async function settle(eventId) {
    const event = findEventById(eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');

    // Mark event finished
    event.status = 'finished';

    // Pick a random winner for 1X2 markets
    let settled = 0;
    for (const mkt of event.markets) {
        if (mkt.type === '1X2') {
            const winnerIdx = Math.floor(Math.random() * mkt.selections.length);
            mkt.selections.forEach((sel, i) => {
                sel.status = i === winnerIdx ? 'won' : 'lost';
            });
        }
        mkt.status = 'settled';
    }

    // Settle bets
    for (const bet of memBets) {
        if (bet.status !== 'active') continue;
        const relevantLegs = bet.legs.filter(l =>
            event.markets.some(m => m.selections.some(s => s.id === l.selection_id))
        );
        if (!relevantLegs.length) continue;

        for (const leg of relevantLegs) {
            const found = findSelectionById(leg.selection_id);
            leg.status = found ? found.selection.status : 'void';
        }

        const allLegsSettled = bet.legs.every(l => l.status !== 'pending');
        if (allLegsSettled) {
            const allWon = bet.legs.every(l => l.status === 'won');
            const anyVoid = bet.legs.some(l => l.status === 'void');
            bet.status = anyVoid ? 'void' : (allWon ? 'won' : 'lost');
            bet.settled_ts = new Date().toISOString();
            settled++;
        }
    }

    return { settled };
}

module.exports = {
    listSports,
    listLeagues,
    listEvents,
    getEvent,
    subscribeOdds,
    getOddsSnapshot,
    placeBet,
    cashOutQuote,
    acceptCashOut,
    getPlayerBets,
    settle,
    // expose mem stores for testing / admin
    _memEvents: () => memEvents,
    _memBets: () => memBets,
};
