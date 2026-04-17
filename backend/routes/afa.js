'use strict';
/**
 * AFA Main Router
 *
 * Central route handler for all agent-facing AFA endpoints.
 * Provides: Metrics API, Alerts API, Audit API, OpenAPI schema.
 *
 * All routes require agent JWT auth (via afa-auth middleware).
 * Each endpoint enforces scope via afa-policy middleware.
 * Rate limiting is applied per API group.
 *
 * Mount: /api/v1/ops
 */

const express = require('express');
const router = express.Router();

// Middleware
const { authenticateAgent } = require('../middleware/afa-auth');
const { requireScope } = require('../middleware/afa-policy');
const { metricsLimiter, alertsLimiter, auditLimiter } = require('../middleware/afa-rate-limit');
const { AfaError, afaErrorHandler } = require('../middleware/afa-error');
const { correlationMiddleware } = require('../middleware/auth');

// Services
const supabaseService = require('../services/supabase');
const AfaMetricsService = require('../services/afa-metrics-service');
const AfaAlertsService = require('../services/afa-alerts-service');
const AfaAuditService = require('../services/afa-audit-service');
const AfaActionsService = require('../services/afa-actions-service');
const { AfaWebhookService } = require('../services/afa-webhook-service');
const { generateOpenApiSpec } = require('../services/openapi-spec');
const { logger } = require('../services/logger');

// Service instances
const metricsService = new AfaMetricsService(supabaseService);
const alertsService = new AfaAlertsService(supabaseService);
const auditService = new AfaAuditService(supabaseService);
const webhookService = new AfaWebhookService(supabaseService);
const actionsService = new AfaActionsService(supabaseService, auditService);

// =========================================================================
// Discovery (unauthenticated)
// =========================================================================

/**
 * GET /v1/ops/openapi.json
 * OpenAPI 3.1 schema — no auth required.
 */
router.get('/openapi.json', (req, res) => {
    const spec = generateOpenApiSpec();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(spec);
});

// =========================================================================
// All remaining routes require agent JWT auth + correlation ID
// =========================================================================
router.use(correlationMiddleware);
router.use(authenticateAgent);

// Helper: log T1 read to audit (fire-and-forget)
function logT1Read(req, actionType) {
    auditService.logAgentAction({
        tenantId: req.agent.tenant_id,
        agentId: req.agent.agent_id,
        eventType: 'T1_READ',
        actionType,
        policyScope: req.agent.policy_scope,
        httpStatus: 200,
        requestId: req.correlationId,
    }).catch(() => {});
}

// =========================================================================
// METRICS API  (T1 — metrics:read)
// =========================================================================

router.get('/metrics/summary', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getSummary(req.agent.tenant_id, {
            period: req.query.period,
            compare_period: req.query.compare_period,
        });
        logT1Read(req, 'metrics/summary');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/metrics/ggr', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getGGR(req.agent.tenant_id, {
            period: req.query.period,
            granularity: req.query.granularity,
        });
        logT1Read(req, 'metrics/ggr');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/metrics/players', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getPlayers(req.agent.tenant_id, {
            period: req.query.period,
            country: req.query.country,
            risk_band: req.query.risk_band,
        });
        logT1Read(req, 'metrics/players');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/metrics/payments', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getPayments(req.agent.tenant_id, {
            period: req.query.period,
            psp: req.query.psp,
            method: req.query.method,
        });
        logT1Read(req, 'metrics/payments');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/metrics/bonuses', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getBonuses(req.agent.tenant_id, {
            period: req.query.period,
            bonus_type: req.query.bonus_type,
            template_id: req.query.template_id,
        });
        logT1Read(req, 'metrics/bonuses');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/metrics/rg', metricsLimiter, requireScope('metrics:read'), async (req, res, next) => {
    try {
        const result = await metricsService.getRG(req.agent.tenant_id, {
            period: req.query.period,
            risk_band: req.query.risk_band,
        });
        logT1Read(req, 'metrics/rg');
        res.json(result);
    } catch (err) { next(err); }
});

// =========================================================================
// PLAYERS API (T1 — player:read)
// =========================================================================

router.get('/players/:id/restrictions', metricsLimiter, requireScope('player:read'), async (req, res, next) => {
    try {
        const result = await actionsService.getPlayerRestrictions(
            req.agent.tenant_id,
            req.params.id,
            req.query.status
        );
        logT1Read(req, 'players/restrictions');
        res.json(result);
    } catch (err) { next(err); }
});

// =========================================================================
// ALERTS API  (T1 read — alerts:read)
// =========================================================================

router.get('/alerts', alertsLimiter, requireScope('alerts:read'), async (req, res, next) => {
    try {
        const result = await alertsService.listAlerts(req.agent.tenant_id, {
            status: req.query.status,
            category: req.query.category,
            risk_band: req.query.risk_band,
            player_id: req.query.player_id,
            since: req.query.since,
            limit: parseInt(req.query.limit) || 20,
            cursor: req.query.cursor,
        });
        logT1Read(req, 'alerts/list');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/alerts/:id', alertsLimiter, requireScope('alerts:read'), async (req, res, next) => {
    try {
        const alert = await alertsService.getAlertDetail(req.params.id, req.agent.tenant_id);
        if (!alert) {
            throw AfaError.notFound('alert', req.params.id);
        }
        logT1Read(req, 'alerts/detail');
        res.json(alert);
    } catch (err) { next(err); }
});

// =========================================================================
// ALERTS SUBSCRIPTIONS  (T1 — alerts:subscribe)
// =========================================================================

router.post('/alerts/subscriptions', alertsLimiter, requireScope('alerts:subscribe'), async (req, res, next) => {
    try {
        const { callback_url, event_types, filter, stream } = req.body;
        const isSse = stream === 'sse';

        if (!event_types || !Array.isArray(event_types) || event_types.length === 0) {
            throw AfaError.validationFailed({ event_types: 'Required non-empty array' });
        }

        const subscription = await webhookService.createSubscription({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            callbackUrl: callback_url,
            eventTypes: event_types,
            filter: filter || {},
            isSse,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'SUBSCRIPTION_CREATED',
            actionType: 'alerts/subscriptions',
            executionResult: { subscription_id: subscription.id, event_types },
            policyScope: req.agent.policy_scope,
            httpStatus: 201,
            requestId: req.correlationId,
        });

        res.status(201).json(subscription);
    } catch (err) { next(err); }
});

router.delete('/alerts/subscriptions/:id', alertsLimiter, requireScope('alerts:subscribe'), async (req, res, next) => {
    try {
        await webhookService.deleteSubscription(req.params.id, req.agent.agent_id);
        res.json({ success: true, id: req.params.id });
    } catch (err) { next(err); }
});

// =========================================================================
// ALERTS STATUS UPDATE  (T2 — alerts:write:pre-auth)
// =========================================================================

router.patch('/alerts/:id/status', alertsLimiter, requireScope('alerts:write:pre-auth'), async (req, res, next) => {
    try {
        const { status, agent_note } = req.body;
        if (!status) {
            throw AfaError.validationFailed({ status: 'Required: acknowledged | resolved | escalated' });
        }

        const startTime = Date.now();
        const result = await alertsService.updateAlertStatus(
            req.params.id,
            req.agent.tenant_id,
            { status, agent_note },
            req.agent.agent_id
        );

        // Audit log for T2 action
        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T2_ACTION',
            actionType: 'alerts/status',
            targetEntity: req.params.id,
            agentNote: agent_note,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 200,
            processingMs: Date.now() - startTime,
            requestId: req.correlationId,
        });

        res.json(result);
    } catch (err) { next(err); }
});

// =========================================================================
// ACTIONS API (T2 - Pre-authorised write operations)
// =========================================================================

/**
 * POST /actions/players/:id/restrict
 * T2 — Apply a temporary restriction (Reality Check or Break)
 */
router.post('/actions/players/:id/restrict', alertsLimiter, requireScope('player:restrict:pre-auth'), async (req, res, next) => {
    try {
        const { type, duration, reason, agent_note } = req.body;
        const result = await actionsService.restrictPlayer({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            playerId: req.params.id,
            type, duration, reason,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T2_ACTION',
            actionType: 'player:restrict:pre-auth',
            targetEntity: req.params.id,
            agentNote: agent_note || reason,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 200,
            requestId: req.correlationId,
        });

        res.json(result);
    } catch (err) { next(err); }
});

/**
 * POST /actions/players/:id/unrestrict
 * T2 — Lift a temporary restriction
 */
router.post('/actions/players/:id/unrestrict', alertsLimiter, requireScope('player:unrestrict:pre-auth'), async (req, res, next) => {
    try {
        const { reason, agent_note } = req.body;
        const result = await actionsService.unrestrictPlayer({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            playerId: req.params.id,
            reason,
            agentNote: agent_note,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T2_ACTION',
            actionType: 'player:unrestrict:pre-auth',
            targetEntity: req.params.id,
            agentNote: agent_note || reason,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 200,
            requestId: req.correlationId,
        });

        res.json(result);
    } catch (err) { next(err); }
});

/**
 * POST /actions/bonuses/:id/forfeit
 * T2 — Forfeit a bonus for a player
 */
router.post('/actions/bonuses/:id/forfeit', alertsLimiter, requireScope('bonus:forfeit:pre-auth'), async (req, res, next) => {
    try {
        const { player_id, reason, agent_note } = req.body;
        const result = await actionsService.forfeitBonus({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            playerId: player_id,
            bonusId: req.params.id,
            reason,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T2_ACTION',
            actionType: 'bonus:forfeit:pre-auth',
            targetEntity: req.params.id,
            agentNote: agent_note || reason,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 200,
            requestId: req.correlationId,
        });

        res.json(result);
    } catch (err) { next(err); }
});

/**
 * POST /actions/players/:id/welfare-tag
 * T2 — Add welfare tag/check to player profile
 */
router.post('/actions/players/:id/welfare-tag', alertsLimiter, requireScope('player:welfare:pre-auth'), async (req, res, next) => {
    try {
        const { tag, note, agent_note } = req.body;
        const result = await actionsService.applyWelfareTag({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            playerId: req.params.id,
            tag, note,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T2_ACTION',
            actionType: 'player:welfare:pre-auth',
            targetEntity: req.params.id,
            agentNote: agent_note || note,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 200,
            requestId: req.correlationId,
        });

        res.json(result);
    } catch (err) { next(err); }
});

/**
 * POST /actions/escalations
 * T2 — Create a T3 pending approval request
 */
router.post('/actions/escalations', alertsLimiter, requireScope('escalation:create'), async (req, res, next) => {
    try {
        const { type, target_entity, payload, reason, agent_note } = req.body;
        const result = await actionsService.createEscalation({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            type, targetEntity: target_entity, payload, reason,
            agentNote: agent_note,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T3_PROPOSED',
            actionType: 'escalation:create',
            targetEntity: target_entity,
            agentNote: agent_note || reason,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 201,
            requestId: req.correlationId,
        });

        res.status(201).json(result);
    } catch (err) { next(err); }
});

/**
 * POST /actions/bonuses/templates/:id/forfeit
 * T3 — Propose forfeiture of a bonus template
 */
router.post('/actions/bonuses/templates/:id/forfeit', alertsLimiter, requireScope('bonus:template:forfeit:human-gated'), async (req, res, next) => {
    try {
        const { reason, agent_note } = req.body;
        const result = await actionsService.proposeTemplateForfeit({
            brandId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            templateId: req.params.id,
            reason,
            agentNote: agent_note,
            requestId: req.correlationId,
        });

        await auditService.logAgentAction({
            tenantId: req.agent.tenant_id,
            agentId: req.agent.agent_id,
            eventType: 'T3_PROPOSED',
            actionType: 'bonus:template:forfeit:human-gated',
            targetEntity: req.params.id,
            agentNote: agent_note || reason,
            executionResult: result,
            policyScope: req.agent.policy_scope,
            httpStatus: 201,
            requestId: req.correlationId,
        });

        res.status(201).json(result);
    } catch (err) { next(err); }
});

// =========================================================================
// EVENTS API (SSE - Real-time stream)
// =========================================================================

/**
 * GET /events/stream
 * SSE Event Stream (requires agent auth)
 */
router.get('/events/stream', alertsLimiter, async (req, res) => {
    // Standard SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const subId = `sse:${req.agent.tenant_id}:${req.agent.agent_id}`;
    
    // Heartbeat every 30s with instance stats
    const heartbeat = setInterval(() => {
        const stats = webhookService.getStats();
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', ...stats })}\n\n`);
    }, 30000);

    // Initial message with process diagnostics
    const stats = webhookService.getStats();
    res.write(`data: ${JSON.stringify({ 
        type: 'connected', 
        agent_id: req.agent.agent_id,
        process_id: stats.pid,
        uptime: stats.uptime_seconds
    })}\n\n`);

    const off = webhookService.onSseEvent(req.agent.tenant_id, req.agent.agent_id, (event) => {
        // Only deliver events for this agent's brand/tenant
        if (String(event.brand_id) === String(req.agent.tenant_id)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    });

    // F13-AFA: Broadcast Fallback for Monitoring (e.g., Claude CoWork)
    // If agent has read-level scopes, automatically subscribe to all events for this brand
    const isMonitor = req.agent.policy_scope && (
        req.agent.policy_scope.includes('alerts:read') || 
        req.agent.policy_scope.includes('metrics:read') ||
        req.agent.policy_scope.includes('*')
    );
    
    let offBroadcast = () => {};
    if (isMonitor) {
        const broadcastTenantId = 'broadcast';
        const broadcastAgentId = String(req.agent.tenant_id);
        const broadcastKey = `sse:agent:${broadcastTenantId}:${broadcastAgentId}`;
        
        logger.info(`[AFA SSE] Setting up broadcast for ${req.agent.agent_id}`, { broadcastKey, isMonitor });

        offBroadcast = webhookService.onSseEvent(broadcastTenantId, broadcastAgentId, (event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
    }

    req.on('close', () => {
        clearInterval(heartbeat);
        off();
        offBroadcast();
        res.end();
    });
});

// =========================================================================
// AUDIT API  (T1 — audit:read)
// =========================================================================

router.get('/audit/agent-actions', auditLimiter, requireScope('audit:read'), async (req, res, next) => {
    try {
        const result = await auditService.getAgentActions(
            req.agent.tenant_id,
            {
                agent_id: req.query.agent_id,
                action_type: req.query.action_type,
                event_type: req.query.event_type,
                since: req.query.since,
                until: req.query.until,
            },
            req.query.cursor,
            parseInt(req.query.limit) || 50
        );
        logT1Read(req, 'audit/agent-actions');
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/audit/agent-actions/:id', auditLimiter, requireScope('audit:read'), async (req, res, next) => {
    try {
        const action = await auditService.getActionDetail(req.params.id);
        if (!action) {
            throw AfaError.notFound('agent_action', req.params.id);
        }
        logT1Read(req, 'audit/agent-actions/detail');
        res.json(action);
    } catch (err) { next(err); }
});

router.get('/audit/pending-approvals', auditLimiter, requireScope('audit:read'), async (req, res, next) => {
    try {
        const approvals = await auditService.getPendingApprovals(req.agent.tenant_id);
        logT1Read(req, 'audit/pending-approvals');
        res.json({ pending_approvals: approvals, total: approvals.length });
    } catch (err) { next(err); }
});

router.get('/audit/policy-log', auditLimiter, requireScope('audit:read'), async (req, res, next) => {
    try {
        const log = await auditService.getPolicyLog(req.agent.tenant_id);
        logT1Read(req, 'audit/policy-log');
        res.json({ events: log, total: log.length });
    } catch (err) { next(err); }
});

// =========================================================================
// Immutability guarantee: DELETE on audit endpoints returns 405
// =========================================================================
router.delete(/\/audit\/.*/, (req, res) => {
    const err = AfaError.methodNotAllowed();
    err.requestId = req.correlationId;
    return res.status(405).json(err.toJSON());
});

// =========================================================================
// Error handler (must be last)
// =========================================================================
router.use(afaErrorHandler);

module.exports = router;
