'use strict';

const express = require('express');
const router = express.Router();
const { authenticateRequest } = require('../middleware/auth');
const provider = require('../services/sportsbook/mock-provider');
const { logger } = require('../services/logger');

// ── GET /api/v1/sports ────────────────────────────────────────────────────────
// List all sports with event counts
router.get('/sports', async (req, res) => {
    try {
        const sports = await provider.listSports();
        res.json({ sports });
    } catch (err) {
        logger.error('[Sportsbook] listSports failed', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
});

// ── GET /api/v1/sports/:slug/leagues ──────────────────────────────────────────
// List leagues for a sport
router.get('/sports/:slug/leagues', async (req, res) => {
    try {
        const leagues = await provider.listLeagues(req.params.slug);
        if (!leagues.length) {
            return res.status(404).json({ error: 'SPORT_NOT_FOUND' });
        }
        res.json({ leagues });
    } catch (err) {
        logger.error('[Sportsbook] listLeagues failed', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
});

// ── GET /api/v1/events ────────────────────────────────────────────────────────
// List events with optional filters: league, status, from, to
router.get('/events', async (req, res) => {
    try {
        const { league, status, from, to } = req.query;
        const events = await provider.listEvents({ league, status, from, to });
        res.json({ events, total: events.length });
    } catch (err) {
        logger.error('[Sportsbook] listEvents failed', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
});

// ── GET /api/v1/events/:id ────────────────────────────────────────────────────
// Single event with full markets
router.get('/events/:id', async (req, res) => {
    try {
        const event = await provider.getEvent(req.params.id);
        if (!event) {
            return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
        }
        res.json({ event });
    } catch (err) {
        logger.error('[Sportsbook] getEvent failed', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
});

// ── GET /api/v1/events/:id/stream ─────────────────────────────────────────────
// SSE live odds stream
router.get('/events/:id/stream', async (req, res) => {
    const eventId = parseInt(req.params.id, 10);
    const event = await provider.getEvent(eventId);
    if (!event) {
        return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const send = (payload) => {
        try {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (_) {}
    };

    // Keep-alive ping every 20s
    const pingInterval = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) {}
    }, 20000);

    const unsubscribe = provider.subscribeOdds(eventId, send);

    req.on('close', () => {
        clearInterval(pingInterval);
        unsubscribe();
    });
});

// ── POST /api/v1/bets ─────────────────────────────────────────────────────────
// Place a bet (requires player auth)
router.post('/bets', authenticateRequest, async (req, res) => {
    try {
        const player_id = req.user?.user_id || req.user?.username;
        if (!player_id) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        const { bet_type, stake, currency, legs } = req.body;

        if (!stake || !legs || !legs.length) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'stake and legs are required' });
        }

        const result = await provider.placeBet({
            player_id,
            bet_type: bet_type || 'SINGLE',
            stake: parseFloat(stake),
            currency: currency || 'EUR',
            legs,
        });

        res.status(201).json(result);
    } catch (err) {
        logger.error('[Sportsbook] placeBet failed', { error: err.message });
        const statusMap = {
            STAKE_TOO_LOW:        400,
            NO_SELECTIONS:        400,
            SELECTION_NOT_FOUND:  404,
            SELECTION_SUSPENDED:  409,
            MARKET_SUSPENDED:     409,
        };
        const code = Object.keys(statusMap).find(k => err.message.startsWith(k));
        res.status(statusMap[code] || 500).json({ error: err.message });
    }
});

// ── POST /api/v1/bets/:id/cash-out ────────────────────────────────────────────
// Request cash-out (get quote then accept)
router.post('/bets/:id/cash-out', authenticateRequest, async (req, res) => {
    try {
        const player_id = req.user?.user_id || req.user?.username;
        if (!player_id) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        const betId = req.params.id;
        const { accept, quote_id } = req.body;

        if (accept && quote_id) {
            // Accept the cash-out
            const result = await provider.acceptCashOut(betId, quote_id);
            return res.json(result);
        }

        // Otherwise: return a quote
        const quote = await provider.cashOutQuote(betId);
        if (!quote) {
            return res.status(404).json({ error: 'BET_NOT_FOUND_OR_NOT_ELIGIBLE' });
        }
        res.json(quote);
    } catch (err) {
        logger.error('[Sportsbook] cashOut failed', { error: err.message });
        res.status(err.message === 'BET_NOT_FOUND' ? 404 : 500).json({ error: err.message });
    }
});

// ── GET /api/v1/bets/me ───────────────────────────────────────────────────────
// Player's bet history
router.get('/bets/me', authenticateRequest, async (req, res) => {
    try {
        const player_id = req.user?.user_id || req.user?.username;
        if (!player_id) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }

        const { status } = req.query;
        const bets = await provider.getPlayerBets(player_id, { status });
        res.json({ bets, total: bets.length });
    } catch (err) {
        logger.error('[Sportsbook] getPlayerBets failed', { error: err.message });
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
});

// ── POST /api/v1/events/:id/settle (internal/admin) ──────────────────────────
// Settle all bets for an event
router.post('/events/:id/settle', authenticateRequest, async (req, res) => {
    try {
        if (req.role !== 'ADMIN' && !req.isOperator) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }
        const result = await provider.settle(req.params.id);
        res.json(result);
    } catch (err) {
        logger.error('[Sportsbook] settle failed', { error: err.message });
        res.status(err.message === 'EVENT_NOT_FOUND' ? 404 : 500).json({ error: err.message });
    }
});

module.exports = router;
