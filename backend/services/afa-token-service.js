'use strict';
/**
 * AFA Token Service
 *
 * Agent token lifecycle management:
 *   - Issue JWT tokens with policy_scope claims
 *   - Revoke tokens (instant)
 *   - List active/revoked tokens per tenant
 *   - Validate token status (for middleware)
 *
 * Tokens are stored in the `agent_tokens` table.
 * JWTs are signed with AFA_JWT_SECRET and carry: agent_id, tenant_id, policy_scope[], trust_tier, jti.
 */

const { signAgentToken } = require('../middleware/afa-auth');
const { logger } = require('./logger');
const crypto = require('crypto');

// Scope → Tier mapping from PRD Appendix A
const SCOPE_TIER_MAP = {
    'metrics:read':             'T1',
    'alerts:read':              'T1',
    'alerts:subscribe':         'T1',
    'audit:read':               'T1',
    'player:read':              'T1',
    'alerts:write:pre-auth':    'T2',
    'player:restrict:pre-auth': 'T2',
    'player:unrestrict:pre-auth': 'T2',
    'player:welfare:pre-auth':  'T2',
    'bonus:forfeit:pre-auth':   'T2',
    'bonus:modify:pre-auth':    'T2',
    'escalation:create':        'T2',
    'player:exclude:human-gated':     'T3',
    'bonus:issue:human-gated':        'T3',
    'bonus:template:forfeit:human-gated': 'T3',
    'compliance:submit:human-gated':  'T3',
};

const ALL_VALID_SCOPES = Object.keys(SCOPE_TIER_MAP);

class AfaTokenService {
    constructor(supabaseService) {
        this.db = supabaseService;
    }

    /**
     * Derive the highest trust tier from the given scope array.
     */
    static deriveTrustTier(scopes) {
        let maxTier = 'T1';
        for (const scope of scopes) {
            const tier = SCOPE_TIER_MAP[scope];
            if (tier === 'T3') return 'T3';
            if (tier === 'T2') maxTier = 'T2';
        }
        return maxTier;
    }

    /**
     * Validate that all scope strings are recognised.
     */
    static validateScopes(scopes) {
        const invalid = scopes.filter(s => !ALL_VALID_SCOPES.includes(s));
        return { valid: invalid.length === 0, invalidScopes: invalid };
    }

    /**
     * Issue a new agent token.
     *
     * @param {object} params
     * @param {string} params.agentId       Operator-chosen label for this agent
     * @param {string} params.tenantId      Brand/tenant ID
     * @param {string[]} params.policyScope Array of scope strings
     * @param {number} params.ttlHours      Token TTL in hours
     * @param {string} params.issuerId      Human operator who issued the token
     * @param {string[]} [params.ipAllowlist] Optional IP restriction list
     * @returns {{ token: string, jti: string, expiresAt: string }}
     */
    async issueToken({ agentId, tenantId, policyScope, ttlHours, issuerId, ipAllowlist = null }) {
        if (!this.db.client) throw new Error('Database not available');

        // Validate scopes
        const { valid, invalidScopes } = AfaTokenService.validateScopes(policyScope);
        if (!valid) {
            throw new Error(`Invalid scope strings: ${invalidScopes.join(', ')}`);
        }

        // Check max TTL from tenant config
        const config = await this.db.getTenantConfig(tenantId);
        const maxTtlHours = config?.afa_max_token_ttl_hours || 720; // 30 days default
        if (ttlHours > maxTtlHours) {
            throw new Error(`TTL exceeds maximum allowed (${maxTtlHours} hours)`);
        }

        // Derive trust tier from scopes
        const trustTier = AfaTokenService.deriveTrustTier(policyScope);

        // Generate JWT ID
        const jti = crypto.randomUUID();

        // Calculate expiry
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + ttlHours * 3600000);

        // Sign JWT
        const token = signAgentToken(
            {
                agent_id: agentId,
                tenant_id: tenantId,
                policy_scope: policyScope,
                trust_tier: trustTier,
                jti,
            },
            ttlHours * 3600  // seconds
        );

        // Insert token record
        const { error } = await this.db.client.from('agent_tokens').insert({
            jti,
            agent_id: agentId,
            tenant_id: String(tenantId),
            policy_scope: policyScope,
            trust_tier: trustTier,
            issued_by: issuerId,
            issued_at: issuedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            ip_allowlist: ipAllowlist,
            request_count: 0,
        });

        if (error) {
            logger.error('[AFA TokenService] Failed to insert token record', { error: error.message });
            throw new Error('Failed to persist token record');
        }

        // Audit log: token issued
        await this._auditLog(tenantId, agentId, 'TOKEN_ISSUED', {
            jti,
            policy_scope: policyScope,
            trust_tier: trustTier,
            ttl_hours: ttlHours,
            expires_at: expiresAt.toISOString(),
            issued_by: issuerId,
        });

        logger.info('[AFA TokenService] Token issued', { agentId, tenantId, trustTier, jti });

        return {
            token,
            jti,
            agent_id: agentId,
            tenant_id: tenantId,
            trust_tier: trustTier,
            policy_scope: policyScope,
            issued_at: issuedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
        };
    }

    /**
     * Revoke an agent token immediately.
     */
    async revokeToken(jti, revokerId, reason = 'Manual revocation') {
        if (!this.db.client) throw new Error('Database not available');

        const { data: tokenRecord, error: fetchError } = await this.db.client
            .from('agent_tokens')
            .select('agent_id, tenant_id, revoked_at')
            .eq('jti', jti)
            .maybeSingle();

        if (fetchError || !tokenRecord) {
            throw new Error('Token not found');
        }
        if (tokenRecord.revoked_at) {
            throw new Error('Token already revoked');
        }

        const { error } = await this.db.client
            .from('agent_tokens')
            .update({
                revoked_at: new Date().toISOString(),
                revoked_by: revokerId,
                revocation_reason: reason,
            })
            .eq('jti', jti);

        if (error) throw new Error('Failed to revoke token');

        // Audit log: token revoked
        await this._auditLog(tokenRecord.tenant_id, tokenRecord.agent_id, 'TOKEN_REVOKED', {
            jti,
            revoked_by: revokerId,
            reason,
        });

        logger.info('[AFA TokenService] Token revoked', { jti, revokerId });
        return { success: true };
    }

    /**
     * List tokens for a tenant.
     * @param {string} tenantId
     * @param {boolean} includeRevoked
     */
    async listTokens(tenantId, includeRevoked = false) {
        if (!this.db.client) return [];

        let query = this.db.client
            .from('agent_tokens')
            .select('jti, agent_id, tenant_id, policy_scope, trust_tier, issued_by, issued_at, expires_at, revoked_at, revoked_by, revocation_reason, last_used_at, request_count, ip_allowlist')
            .eq('tenant_id', String(tenantId))
            .order('issued_at', { ascending: false });

        if (!includeRevoked) {
            query = query.is('revoked_at', null);
        }

        const { data, error } = await query;
        if (error) {
            logger.error('[AFA TokenService] List tokens failed', { error: error.message });
            return [];
        }
        return data || [];
    }

    /**
     * Get a single token's full detail.
     */
    async getTokenDetail(jti) {
        if (!this.db.client) return null;

        const { data, error } = await this.db.client
            .from('agent_tokens')
            .select('*')
            .eq('jti', jti)
            .maybeSingle();

        if (error) return null;
        return data;
    }

    /**
     * Internal: write to agent_audit_log
     */
    async _auditLog(tenantId, agentId, eventType, details = {}) {
        try {
            if (!this.db.client) return;
            await this.db.client.from('agent_audit_log').insert({
                tenant_id: String(tenantId),
                agent_id: agentId,
                event_type: eventType,
                action_type: eventType,
                execution_result: details,
                policy_scope: details.policy_scope || [],
            });
        } catch (e) {
            logger.error('[AFA TokenService] Audit log write failed', { error: e.message });
        }
    }
}

module.exports = { AfaTokenService, SCOPE_TIER_MAP, ALL_VALID_SCOPES };
