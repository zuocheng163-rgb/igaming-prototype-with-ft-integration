'use strict';
/**
 * AFA Auth Middleware
 *
 * Authenticates agent requests using JWT Bearer tokens.
 * Agent JWTs are signed by the server (AFA_JWT_SECRET) and carry:
 *   - agent_id, tenant_id, policy_scope[], trust_tier, jti
 *
 * On success, attaches req.agent with decoded claims.
 * On failure, returns structured AFA errors (never free-text).
 */

const jwt = require('jsonwebtoken');
const { AfaError } = require('./afa-error');
const { logger } = require('../services/logger');
const supabaseService = require('../services/supabase');

const AFA_JWT_SECRET = process.env.AFA_JWT_SECRET || 'afa-dev-secret-change-in-production';

/**
 * Primary agent authentication middleware.
 * Validates JWT, checks revocation, updates usage stats.
 *
 * After successful auth, req.agent contains:
 *   { agent_id, tenant_id, policy_scope[], trust_tier, jti, exp, iat }
 */
const authenticateAgent = async (req, res, next) => {
    try {
        // 1. Extract token from Authorization header or Query Parameter
        let token = '';
        const authHeader = req.headers['authorization'] || '';
        
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        } else if (req.query.token) {
            // Support query param for EventSource (SSE) which doesn't support headers
            token = req.query.token;
        }

        if (!token) {
            logger.warn('[AFA Auth] Authentication failed: No token provided', { url: req.url });
            throw AfaError.authMissing();
        }

        logger.info('[AFA Auth] Token extracted', { tokenPrefix: token.substring(0, 10) + '...' });

        // 2. Verify JWT signature and decode
        let decoded;
        const isSandbox = token.startsWith('token-') && (process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'development');
        
        if (isSandbox) {
            const raw = token.replace('token-', '');
            const username = raw.split('-')[0] || 'admin';
            decoded = {
                agent_id: username,
                tenant_id: 1, // Default for demo
                policy_scope: ['*'], // Full access in demo
                trust_tier: 'T1',
                jti: token,
                exp: Math.floor(Date.now() / 1000) + 86400, // 24h
                iat: Math.floor(Date.now() / 1000),
            };
            logger.info('[AFA Auth] Sandbox Fallback active', { agent_id: username, token });
        } else {
            try {
                decoded = jwt.verify(token, AFA_JWT_SECRET, {
                    algorithms: ['HS256'],
                });
            } catch (jwtErr) {
                if (jwtErr.name === 'TokenExpiredError') {
                    throw AfaError.authExpired();
                }
                throw AfaError.authInvalid(jwtErr.message);
            }
        }

        // 3. Validate required claims
        const { agent_id, tenant_id, policy_scope, trust_tier, jti } = decoded;
        if (!agent_id || !tenant_id || !jti) {
            throw AfaError.authInvalid('Missing required JWT claims: agent_id, tenant_id, jti');
        }

        // 4. Check revocation status against DB (Skip for Sandbox)
        if (!isSandbox && supabaseService.client) {
            const { data: tokenRecord, error } = await supabaseService.client
                .from('agent_tokens')
                .select('revoked_at, ip_allowlist')
                .eq('jti', jti)
                .maybeSingle();

            if (error) {
                logger.error('[AFA Auth] Token lookup error', { error: error.message, jti });
                // Fail open on DB errors to avoid locking agents out when DB is slow
                // (Revocation enforcement is best-effort; audit log catches anomalies)
            } else if (!tokenRecord) {
                throw AfaError.authInvalid('Token not found — it may have been deleted');
            } else if (tokenRecord.revoked_at) {
                // Log scope violation attempt
                await _logScopeViolation(tenant_id, agent_id, jti, 'REVOKED_TOKEN_USED');
                throw AfaError.authRevoked();
            } else if (tokenRecord.ip_allowlist && tokenRecord.ip_allowlist.length > 0) {
                // IP allowlist check
                const clientIp = req.ip || req.connection?.remoteAddress;
                if (!tokenRecord.ip_allowlist.includes(clientIp)) {
                    await _logScopeViolation(tenant_id, agent_id, jti, 'IP_NOT_ALLOWED');
                    throw new AfaError('IP_NOT_ALLOWED', 'auth', 403, 'contact_operator_admin', {
                        hint: 'Your IP is not in the allowlist for this agent token'
                    });
                }
            }

            // 5. Update usage stats (fire-and-forget — don't block the request)
            supabaseService.client
                .from('agent_tokens')
                .update({
                    last_used_at: new Date().toISOString(),
                    request_count: tokenRecord ? (tokenRecord.request_count || 0) + 1 : 1,
                })
                .eq('jti', jti)
                .then(() => {})
                .catch(err => logger.warn('[AFA Auth] Failed to update token usage', { error: err.message }));
        } else if (isSandbox) {
            logger.info('[AFA Auth] Skipping DB checks for Sandbox mode', { jti });
        }

        // 6. Attach agent claims to request
        req.agent = {
            agent_id,
            tenant_id,
            policy_scope: Array.isArray(policy_scope) ? policy_scope : [],
            trust_tier: trust_tier || 'T1',
            jti,
            exp: decoded.exp,
            iat: decoded.iat,
        };

        logger.info('[AFA Auth] Authentication successful', { agent_id: req.agent.agent_id, tenant_id: req.agent.tenant_id, scopeCount: req.agent.policy_scope.length });

        // 7. Set correlation context
        req.correlationId = req.headers['x-correlation-id'] || require('crypto').randomUUID();
        res.setHeader('X-Correlation-ID', req.correlationId);
        res.setHeader('X-Agent-ID', agent_id);

        next();
    } catch (err) {
        if (err instanceof AfaError) {
            if (req.correlationId) err.requestId = req.correlationId;
            return res.status(err.httpStatus).json(err.toJSON());
        }
        logger.error('[AFA Auth] Unexpected error', { error: err.message });
        const internal = AfaError.internal('Authentication service error');
        return res.status(500).json(internal.toJSON());
    }
};

/**
 * Log a scope/auth violation to the agent_audit_log
 */
async function _logScopeViolation(tenantId, agentId, jti, reason) {
    try {
        const supabaseService = require('../services/supabase');
        if (!supabaseService.client) return;
        await supabaseService.client.from('agent_audit_log').insert({
            tenant_id: tenantId,
            agent_id: agentId,
            event_type: 'SCOPE_VIOLATION',
            action_type: reason,
            policy_scope: [],
            execution_result: { jti },
        });
    } catch (e) {
        logger.error('[AFA Auth] Failed to log scope violation', { error: e.message });
    }
}

/**
 * Sign an agent JWT.
 * Used by the token issuance service.
 */
function signAgentToken(payload, expiresInSeconds) {
    return jwt.sign(payload, AFA_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: expiresInSeconds,
    });
}

module.exports = { authenticateAgent, signAgentToken, AFA_JWT_SECRET };
