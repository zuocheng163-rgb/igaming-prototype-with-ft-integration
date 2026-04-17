'use strict';
/**
 * AFA Auth Routes
 *
 * Agent token issuance, listing, and revocation.
 * These endpoints are protected by HUMAN admin auth (not agent JWT).
 * Only Super Admin or Compliance Officer roles can manage agent tokens.
 *
 * Mount: /api/v1/auth
 */

const express = require('express');
const router = express.Router();
const { correlationMiddleware, authenticateRequest } = require('../middleware/auth');
const { AfaError, afaErrorHandler } = require('../middleware/afa-error');
const { AfaTokenService, ALL_VALID_SCOPES } = require('../services/afa-token-service');
const AfaAuditService = require('../services/afa-audit-service');
const AfaActionsService = require('../services/afa-actions-service');
const supabaseService = require('../services/supabase');
const { logger } = require('../services/logger');

const tokenService = new AfaTokenService(supabaseService);
const auditService = new AfaAuditService(supabaseService);
const actionsService = new AfaActionsService(supabaseService);

// All auth management routes require human admin authentication
router.use(correlationMiddleware);

/**
 * RBAC: Require admin role for token management
 */
const requireAdmin = (req, res, next) => {
    if (req.role !== 'ADMIN') {
        const err = new AfaError('ADMIN_REQUIRED', 'auth', 403, 'contact_operator_admin', {
            hint: 'Agent token management requires Super Admin or Compliance Officer role'
        });
        return res.status(403).json(err.toJSON());
    }
    next();
};

/**
 * POST /v1/auth/agent-tokens
 * Issue a new agent token.
 *
 * Body: { agent_id, policy_scope[], ttl_hours, ip_allowlist? }
 */
router.post('/agent-tokens', authenticateRequest, requireAdmin, async (req, res) => {
    const startTime = Date.now();
    try {
        const { agent_id, policy_scope, ttl_hours, ip_allowlist } = req.body;

        // Validate required fields
        if (!agent_id || typeof agent_id !== 'string') {
            throw AfaError.validationFailed({ agent_id: 'Required string' });
        }
        if (!Array.isArray(policy_scope) || policy_scope.length === 0) {
            throw AfaError.validationFailed({ policy_scope: 'Required non-empty array of scope strings' });
        }
        if (!ttl_hours || typeof ttl_hours !== 'number' || ttl_hours < 1) {
            throw AfaError.validationFailed({ ttl_hours: 'Required positive integer (hours)' });
        }

        const tenantId = req.brandId || req.user?.brand_id || 1;
        const issuerId = req.user?.user_id || req.user?.username || 'unknown';

        const result = await tokenService.issueToken({
            agentId: agent_id,
            tenantId,
            policyScope: policy_scope,
            ttlHours: ttl_hours,
            issuerId,
            ipAllowlist: ip_allowlist || null,
        });

        logger.info('[AFA Auth] Token issued', {
            agentId: agent_id,
            tenantId,
            issuerId,
            processingMs: Date.now() - startTime,
        });

        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AfaError) {
            return res.status(err.httpStatus).json(err.toJSON());
        }
        logger.error('[AFA Auth] Token issuance failed', { error: err.message });
        const wrapped = AfaError.internal(err.message);
        return res.status(500).json(wrapped.toJSON());
    }
});

/**
 * GET /v1/auth/agent-tokens
 * List agent tokens for the current tenant.
 * Query: ?include_revoked=true
 */
router.get('/agent-tokens', authenticateRequest, requireAdmin, async (req, res) => {
    try {
        const tenantId = req.brandId || req.user?.brand_id || 1;

        if (req.query.view === 'approvals') {
            const approvals = await auditService.getPendingApprovals(tenantId);
            return res.json({
                approvals,
                total: approvals.length,
                tenant_id: tenantId,
            });
        }

        const includeRevoked = req.query.include_revoked === 'true';

        const tokens = await tokenService.listTokens(tenantId, includeRevoked);

        res.json({
            tokens,
            total: tokens.length,
            tenant_id: tenantId,
            available_scopes: ALL_VALID_SCOPES,
        });
    } catch (err) {
        logger.error('[AFA Auth] Token list failed', { error: err.message });
        const wrapped = AfaError.internal(err.message);
        return res.status(500).json(wrapped.toJSON());
    }
});

/**
 * GET /v1/auth/agent-tokens/:jti
 * Get single token detail.
 */
router.get('/agent-tokens/:jti', authenticateRequest, requireAdmin, async (req, res) => {
    try {
        const detail = await tokenService.getTokenDetail(req.params.jti);
        if (!detail) {
            const err = AfaError.notFound('agent_token', req.params.jti);
            return res.status(404).json(err.toJSON());
        }
        res.json(detail);
    } catch (err) {
        logger.error('[AFA Auth] Token detail failed', { error: err.message });
        const wrapped = AfaError.internal(err.message);
        return res.status(500).json(wrapped.toJSON());
    }
});

/**
 * DELETE /v1/auth/agent-tokens/:jti
 * Revoke an agent token immediately.
 *
 * Body: { reason? }
 */
router.delete('/agent-tokens/:jti', authenticateRequest, requireAdmin, async (req, res) => {
    try {
        const revokerId = req.user?.user_id || req.user?.username || 'unknown';
        const reason = req.body?.reason || 'Manual revocation from portal';

        await tokenService.revokeToken(req.params.jti, revokerId, reason);

        res.json({
            success: true,
            jti: req.params.jti,
            revoked_by: revokerId,
            revoked_at: new Date().toISOString(),
        });
    } catch (err) {
        if (err.message === 'Token not found') {
            const afaErr = AfaError.notFound('agent_token', req.params.jti);
            return res.status(404).json(afaErr.toJSON());
        }
        logger.error('[AFA Auth] Token revocation failed', { error: err.message });
        const wrapped = AfaError.internal(err.message);
        return res.status(500).json(wrapped.toJSON());
    }
});

/**
 * POST /v1/auth/approvals/:id/resolve
 * Resolve a pending T3 escalation request.
 *
 * Body: { resolution: 'approved' | 'rejected', reason? }
 */
router.post('/approvals/:id/resolve', authenticateRequest, requireAdmin, async (req, res) => {
    const startTime = Date.now();
    try {
        const { id } = req.params;
        const { resolution, reason } = req.body;
        const adminId = req.user?.user_id || req.user?.username || 'admin';
        const brandId = req.brandId || req.user?.brand_id || 1;

        if (!['approved', 'rejected'].includes(resolution)) {
            throw AfaError.validationFailed({ resolution: 'Must be approved or rejected' });
        }

        // 1. Fetch the pending request
        const approvals = await auditService.getPendingApprovals(brandId);
        const pending = approvals.find(a => a.id === id);

        if (!pending) {
            throw AfaError.notFound('pending_approval', id);
        }

        // 2. Resolve the record in DB
        const { data, error } = await supabaseService.client.from('pending_approvals')
            .update({
                status: resolution,
                resolved_at: new Date().toISOString(),
                approver_id: adminId,
                rejection_reason: resolution === 'rejected' ? reason || null : null
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        let executionResult = null;

        // 3. If approved, execute the corresponding action
        if (resolution === 'approved') {
            const payload = pending.payload || {};
            const actionType = pending.action_type;
            const agentId = pending.agent_id;
            const requestId = pending.request_id;

            logger.info('[AFA Ops] Executing approved action', { actionType, id, agentId });

            // Direct execution bypassing policy (skipPolicy: true)
            const commonParams = {
                brandId,
                agentId,
                playerId: payload.player_id,
                reason: payload.reason || reason || 'Approved by admin',
                requestId,
                skipPolicy: true
            };

            switch (actionType) {
                case 'player:restrict:pre-auth':
                    executionResult = await actionsService.restrictPlayer({
                        ...commonParams,
                        type: payload.type,
                        duration: payload.duration
                    });
                    break;
                case 'bonus:forfeit:pre-auth':
                    executionResult = await actionsService.forfeitBonus({
                        ...commonParams,
                        bonusId: payload.bonus_id
                    });
                    break;
                case 'player:welfare:pre-auth':
                    executionResult = await actionsService.applyWelfareTag({
                        ...commonParams,
                        tag: payload.tag,
                        note: payload.note
                    });
                    break;
                case 'bonus:template:forfeit:human-gated':
                    executionResult = await actionsService.executeTemplateForfeit(
                        brandId,
                        payload.template_id,
                        agentId,
                        requestId
                    );
                    break;
                default:
                    logger.warn('[AFA Ops] No execution handler for action type', { actionType });
            }

            // 4. Log the execution in the agent audit trail
            if (executionResult && executionResult.success) {
                await auditService.logAgentAction({
                    tenantId: brandId,
                    agentId: pending.agent_id,
                    eventType: 'T3_EXECUTED',
                    actionType: pending.action_type,
                    targetEntity: pending.target_entity,
                    agentNote: `Approved & executed by admin ${adminId}. ${reason || ''}`,
                    executionResult: executionResult,
                    policyScope: ['admin_override'],
                    httpStatus: 200,
                    requestId: pending.request_id
                });
            }
        }

        res.json({
            success: true,
            resolution,
            id,
            execution_result: executionResult,
            processing_ms: Date.now() - startTime
        });
    } catch (err) {
        if (err instanceof AfaError) {
            return res.status(err.httpStatus).json(err.toJSON());
        }
        logger.error('[AFA Ops] Approval resolution failed', { error: err.message });
        const wrapped = AfaError.internal(err.message);
        return res.status(500).json(wrapped.toJSON());
    }
});

// Error handler
router.use(afaErrorHandler);

module.exports = router;
