'use strict';
/**
 * AFA Actions Service
 *
 * Orchestrates T2 (pre-authorised) and T3 (human-gated) operations.
 * Enforces policy bounds (daily limits, transaction thresholds) for T2 actions.
 * Maintains the policy violation log.
 *
 * Actions:
 *   - bonus:forfeit:pre-auth
 *   - bonus:modify:pre-auth (extend)
 *   - player:restrict:pre-auth
 *   - player:welfare:pre-auth
 *   - escalation:create (T2 -> T3)
 */

const { logger } = require('./logger');
const { AfaError } = require('../middleware/afa-error');
const BonusManagementService = require('./bonus-management-service');

// Underlying platform services
const InterventionService = require('./intervention');
// Note: BonusManagementService is likely required too, checking if it exports static methods
// or if I need to use walletService.

class AfaActionsService {
    constructor(supabaseService, auditService, bonusService = null) {
        this.db = supabaseService;
        this.audit = auditService;
        this.bonusService = bonusService; // Injected for testing/flexibility
    }

    /**
     * Check if an action violates any defined policy limits.
     *
     * @param {string} brandId
     * @param {string} scopeName  e.g. 'bonus:forfeit:pre-auth'
     * @param {number} value      numeric value of the action (if applicable)
     * @returns {Promise<{allowed: boolean, reason?: string, limit?: number}>}
     */
    async checkPolicy(brandId, scopeName, value = null) {
        if (!this.db.client) return { allowed: true };

        // 1. Fetch active limits for this scope
        const { data: limits, error } = await this.db.client
            .from('afa_policy_limits')
            .select('*')
            .eq('brand_id', Number(brandId))
            .eq('scope_name', scopeName)
            .eq('is_active', true);

        if (error || !limits || limits.length === 0) {
            // No limits defined = allowed by default (conservative approach could be Deny, but PRD implies allow if scoped)
            return { allowed: true };
        }

        // 2. Enforce "Single Transaction Value" limit
        const singleLimit = limits.find(l => l.limit_key === 'max_single_value');
        if (singleLimit && value !== null && value > singleLimit.limit_value) {
            return {
                allowed: false,
                reason: `Value exceeds maximum single transaction limit of ${singleLimit.limit_value} ${singleLimit.currency}`,
                limit: singleLimit.limit_value,
            };
        }

        // 3. Enforce "Daily Value" limit
        const dailyValueLimit = limits.find(l => l.limit_key === 'max_daily_value');
        if (dailyValueLimit && value !== null) {
            // Calculate today's total for this scope
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: auditData, error: auditError } = await this.db.client
                .from('agent_audit_log')
                .select('execution_result')
                .eq('brand_id', String(brandId))
                .eq('action_type', scopeName) // mapping action_type to scope_name for consistency
                .eq('event_type', 'T2_ACTION')
                .gte('occurred_at', today.toISOString());

            if (!auditError && auditData) {
                const currentTotal = auditData.reduce((sum, entry) => {
                    const val = entry.execution_result?.value || 0;
                    return sum + Number(val);
                }, 0);

                if (currentTotal + value > dailyValueLimit.limit_value) {
                    return {
                        allowed: false,
                        reason: `Daily value limit reached. Current: ${currentTotal}. Limit: ${dailyValueLimit.limit_value}`,
                        limit: dailyValueLimit.limit_value,
                    };
                }
            }
        }

        // 4. Enforce "Daily Count" limit
        const dailyCountLimit = limits.find(l => l.limit_key === 'max_daily_count');
        if (dailyCountLimit) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { count, error: countError } = await this.db.client
                .from('agent_audit_log')
                .select('*', { count: 'exact', head: true })
                .eq('brand_id', String(brandId))
                .eq('action_type', scopeName)
                .eq('event_type', 'T2_ACTION')
                .gte('occurred_at', today.toISOString());

            if (!countError && (count || 0) >= dailyCountLimit.limit_value) {
                return {
                    allowed: false,
                    reason: `Daily request count limit reached: ${dailyCountLimit.limit_value}`,
                    limit: dailyCountLimit.limit_value,
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Log a policy violation.
     */
    async logViolation(brandId, agentId, scopeName, limitKey, attemptedValue, threshold, requestId) {
        if (!this.db.client) return;
        await this.db.client.from('afa_policy_violations').insert({
            brand_id: Number(brandId),
            agent_id: agentId,
            scope_name: scopeName,
            limit_key: limitKey,
            attempted_value: attemptedValue,
            limit_threshold: threshold,
            request_id: requestId,
        });
    }

    /**
     * T1: Fetch active and historical restrictions for a player.
     * Mocks fetching an active restriction if a recent one was applied.
     */
    async getPlayerRestrictions(brandId, playerId, statusFilter = null) {
        if (!this.db.client) return { active_restriction: null, history: [] };

        // For this proposal implementation, we query recent T2 restrict actions
        // from the audit log to mock an "active" restriction.
        const { data: restrictLogs } = await this.db.client
            .from('agent_audit_log')
            .select('*')
            .eq('brand_id', String(brandId))
            .eq('target_entity', playerId)
            .eq('action_type', 'player:restrict:pre-auth')
            .order('occurred_at', { ascending: false })
            .limit(10);

        let activeRestriction = null;
        let history = [];

        if (restrictLogs && restrictLogs.length > 0) {
            history = restrictLogs.map(log => ({
                id: log.id,
                type: log.execution_result?.restriction_type || 'UNKNOWN',
                applied_at: log.occurred_at,
                agent_id: log.agent_id,
                reason: log.agent_note || 'Agent applied restriction',
            }));

            // Mock an active restriction if the most recent restrict action was within 24 hours
            // and we haven't formally unrestricted them (simplification for the proposal).
            const lastLog = restrictLogs[0];
            const logDate = new Date(lastLog.occurred_at);
            const now = new Date();
            if ((now - logDate) < 24 * 60 * 60 * 1000) {
                activeRestriction = history[0];
            }
        }

        if (statusFilter === 'active') {
            return { active_restriction: activeRestriction };
        }

        return {
            active_restriction: activeRestriction,
            history: history,
        };
    }

    /**
     * T2: Lift an active restriction on a player.
     */
    async unrestrictPlayer(params) {
        const { brandId, agentId, playerId, reason, requestId, skipPolicy = false, agentNote } = params;

        if (!skipPolicy) {
            const policy = await this.checkPolicy(brandId, 'player:unrestrict:pre-auth');
            if (!policy.allowed) {
                await this.logViolation(brandId, agentId, 'player:unrestrict:pre-auth', 'max_daily_count', null, policy.limit, requestId);
                throw new AfaError('POLICY_VIOLATION', 'business_rule', 403, 'contact_operator_admin', { detail: policy.reason });
            }
        }

        // Mock checking for self-exclusion (in reality this checks the player model)
        const currentRestrictions = await this.getPlayerRestrictions(brandId, playerId, 'active');
        if (currentRestrictions.active_restriction && currentRestrictions.active_restriction.type === 'SELF_EXCLUSION') {
            throw new AfaError('RESTRICTION_SELF_EXCLUDED', 'business_rule', 409, 'escalate_to_human', { 
                detail: 'Cannot unrestrict a self-excluded player via automated API. Must be escalated.' 
            });
        }

        if (!currentRestrictions.active_restriction) {
            throw new AfaError('NO_ACTIVE_RESTRICTION', 'business_rule', 409, 'check_player_status', { 
                detail: 'The player does not currently have an active restriction to lift.' 
            });
        }

        // Execute: In reality this would clear the restriction field in the player_profiles or restrictions table
        logger.info('[AFA Actions] Unrestricting player', { playerId, agentId });

        return {
            success: true,
            player_id: playerId,
            status: 'unrestricted',
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * T2: Forfeit a bonus for a player.
     */
    async forfeitBonus(params) {
        const { brandId, agentId, playerId, bonusId, reason, requestId, skipPolicy = false } = params;

        // 1. Check Policy (Skip if admin-approved)
        if (!skipPolicy) {
            const policy = await this.checkPolicy(brandId, 'bonus:forfeit:pre-auth', null);
            if (!policy.allowed) {
                await this.logViolation(brandId, agentId, 'bonus:forfeit:pre-auth', 'policy', null, policy.limit, requestId);
                throw new AfaError('POLICY_VIOLATION', 'business_rule', 403, 'contact_operator_admin', { detail: policy.reason });
            }
        }

        // 2. Execute platform action
        // Mocking the call to BonusManagementService or WalletService
        // Real logic would be: await bonusService.forfeit(playerId, bonusId, reason, `agent:${agentId}`);
        logger.info('[AFA Actions] Forfeiting bonus', { playerId, bonusId, agentId });

        // Placeholder success response
        const result = {
            success: true,
            bonus_id: bonusId,
            player_id: playerId,
            status: 'forfeited',
            timestamp: new Date().toISOString(),
        };

        return result;
    }

    /**
     * T2: Apply a temporary player restriction.
     */
    async restrictPlayer(params) {
        const { brandId, agentId, playerId, type, duration, reason, requestId, skipPolicy = false } = params;

        if (!skipPolicy) {
            const policy = await this.checkPolicy(brandId, 'player:restrict:pre-auth');
            if (!policy.allowed) {
                await this.logViolation(brandId, agentId, 'player:restrict:pre-auth', 'max_daily_count', null, policy.limit, requestId);
                throw new AfaError('POLICY_VIOLATION', 'business_rule', 403, 'contact_operator_admin', { detail: policy.reason });
            }
        }

        // Apply restriction via InterventionService
        if (type === 'MANDATORY_BREAK') {
            await InterventionService.triggerMandatoryBreak(playerId, duration || 1, reason, Number(brandId));
        } else {
            await InterventionService.triggerRealityCheck(playerId, reason, type || 'REALITY_CHECK', Number(brandId));
        }

        return {
            success: true,
            player_id: playerId,
            restriction_type: type,
            status: 'applied',
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * T2: Add a welfare tag to a player profile.
     */
    async applyWelfareTag(params) {
        const { brandId, agentId, playerId, tag, note, requestId, skipPolicy = false } = params;

        if (!skipPolicy) {
            const policy = await this.checkPolicy(brandId, 'player:welfare:pre-auth');
            if (!policy.allowed) {
                await this.logViolation(brandId, agentId, 'player:welfare:pre-auth', 'max_daily_count', null, policy.limit, requestId);
                throw new AfaError('POLICY_VIOLATION', 'business_rule', 403, 'contact_operator_admin', { detail: policy.reason });
            }
        }

        // Execute: update player profile with welfare tag
        const { error } = await this.db.client
            .from('player_profiles')
            .update({
                welfare_status: tag,
                last_welfare_check: new Date().toISOString(),
                welfare_notes: note,
            })
            .eq('player_id', playerId)
            .eq('tenant_id', Number(brandId));

        if (error) throw new Error('Failed to update player profile');

        return {
            success: true,
            player_id: playerId,
            tag_applied: tag,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * T2: Create an escalation (T3 pending approval).
     */
    async createEscalation(params) {
        const { brandId, agentId, type, targetEntity, payload, reason, agentNote, requestId } = params;

        // Escalations are always allowed within the T2 scope as they are "proposals"
        const { data, error } = await this.db.client
            .from('pending_approvals')
            .insert({
                tenant_id: String(brandId),
                agent_id: agentId,
                action_type: type,
                target_entity: targetEntity,
                payload: payload,
                policy_reason: reason || 'Escalated by agent',
                agent_note: agentNote || null,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('[AFA Actions] DB Insert Error (Pending Approvals):', error);
            throw new Error('Failed to create escalation: ' + JSON.stringify(error));
        }

        return {
            success: true,
            approval_id: data.id,
            status: 'pending_approval',
            message: 'Action exceeds pre-authorised bounds. Escalated for human review.',
        };
    }

    /**
     * T3: Propose forfeiture of a bonus template across all active holders.
     */
    async proposeTemplateForfeit(params) {
        const { brandId, agentId, templateId, reason, agentNote, requestId } = params;

        // Mock checking for active instances of this bonus template
        // In reality: const { count } = await this.db.client.from('bonuses').select('*', { count: 'exact' }).eq('template_id', templateId).eq('status', 'active');
        const activeInstancesCount = 142; // Mock value for the proposal showing affected players

        if (activeInstancesCount === 0) {
            throw new AfaError('NO_ACTIVE_INSTANCES', 'business_rule', 409, 'check_bonus_metrics', { 
                detail: 'No active instances found for this bonus template.' 
            });
        }

        // Mock checking for existing pending approval
        const { data: existing } = await this.db.client.from('pending_approvals')
            .select('id')
            .eq('tenant_id', String(brandId))
            .eq('action_type', 'bonus:template:forfeit:human-gated')
            .eq('target_entity', templateId)
            .eq('status', 'pending');

        if (existing && existing.length > 0) {
            throw new AfaError('APPROVAL_ALREADY_PENDING', 'business_rule', 409, 'await_approval', { 
                detail: 'A pending forfeit approval for this template already exists — resolve or cancel it first.' 
            });
        }

        // T3 actions automatically trigger an escalation record
        return await this.createEscalation({
            brandId,
            agentId,
            type: 'bonus:template:forfeit:human-gated',
            targetEntity: templateId,
            payload: {
                template_id: templateId,
                affected_features: activeInstancesCount,
                reason: reason
            },
            reason: reason || agentNote,
            agentNote: agentNote,
            requestId
        });
    }

    /**
     * T3: Final execution of an approved bonus template forfeiture.
     */
    async executeTemplateForfeit(brandId, templateId, agentId, requestId) {
        logger.info('[AFA Actions] Executing template forfeit', { templateId, brandId, agentId });

        // Call the underlying platform service to bulk forfeit instances
        const result = await BonusManagementService.bulkForfeitByTemplate(brandId, templateId);

        return {
            success: result.success,
            template_id: templateId,
            status: 'bulk_forfeited',
            affected_instances_count: result.count,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = AfaActionsService;
