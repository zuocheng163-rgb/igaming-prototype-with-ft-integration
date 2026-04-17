const supabaseService = require('./supabase');
const { logger } = require('./logger');

/**
 * BonusManagementService handles operator-level bonus operations:
 * 1. Template CRUD
 * 2. Active Bonus Instance Management (Forfeit, Extend)
 * 3. Manual & Bulk Issuance
 * 4. Analytics aggregation
 */
const getTenantId = (brandId) => {
    // brand_id 1 maps to 37562b54-0c91-491c-b996-2efb68e7baf3 as per tenant_configs
    if (brandId === 1 || brandId === '1') return '37562b54-0c91-491c-b996-2efb68e7baf3';
    return null; // Handle other brands as needed
};

class BonusManagementService {
    /**
     * Templates
     */
    static async listTemplates(brandId) {
        const { data, error } = await supabaseService.client
            .from('bonus_templates')
            .select('*')
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    static async createTemplate(brandId, templateData) {
        const { data, error } = await supabaseService.client
            .from('bonus_templates')
            .insert([{
                ...templateData,
                brand_id: brandId,
                tenant_id: getTenantId(brandId),
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async updateTemplate(templateId, updates) {
        const { data, error } = await supabaseService.client
            .from('bonus_templates')
            .update(updates)
            .eq('id', templateId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async deleteTemplate(templateId) {
        const { error } = await supabaseService.client
            .from('bonus_templates')
            .delete()
            .eq('id', templateId);

        if (error) throw error;
        return { success: true };
    }

    /**
     * Active Bonus Instances
     */
    static async listActiveInstances(brandId, filters = {}) {
        let query = supabaseService.client
            .from('bonus_instances')
            .select('*')
            .eq('brand_id', brandId);

        // Default to active states if no state filter provided
        if (filters.state) {
            query = query.eq('state', filters.state);
        } else {
            query = query.in('state', ['CREATED', 'ONGOING']);
        }
        if (filters.player_id) query = query.eq('player_id', filters.player_id);

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    static async forfeitBonus(instanceId) {
        const { data: instance, error: fetchError } = await supabaseService.client
            .from('bonus_instances')
            .select('*')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) throw new Error('Bonus instance not found');

        // Update instance state
        const { error: updateError } = await supabaseService.client
            .from('bonus_instances')
            .update({
                state: 'FORFEITED',
                updated_at: new Date().toISOString()
            })
            .eq('id', instanceId);

        if (updateError) throw updateError;

        // Log event
        await supabaseService.client.from('bonus_events').insert([{
            bonus_instance_id: instanceId,
            player_id: instance.player_id,
            brand_id: instance.brand_id,
            tenant_id: instance.tenant_id || getTenantId(instance.brand_id),
            event_type: 'FORFEITED',
            amount: 0,
            metadata: { reason: 'Operator Forfeit' }
        }]);

        // Deduct from player's bonus balance
        const user = await supabaseService.getUserById(instance.player_id);
        if (user) {
            const newBonusBalance = Math.max(0, (user.bonus_balance || 0) - (instance.amount_credited || 0));
            await supabaseService.updateUser(user.id, { bonus_balance: newBonusBalance });
        }

        return { success: true };
    }

    static async bulkForfeitByTemplate(brandId, templateId) {
        // Fetch all ongoing/created/active bonus instances for this template
        const { data: instances, error: fetchError } = await supabaseService.client
            .from('bonus_instances')
            .select('*')
            .eq('brand_id', brandId)
            .eq('bonus_template_id', templateId)
            .in('state', ['CREATED', 'ONGOING']);

        if (fetchError) throw fetchError;
        if (!instances || instances.length === 0) return { success: true, count: 0 };

        // Process each instance via the standard forfeiture logic
        let processedCount = 0;
        for (const instance of instances) {
            try {
                // This handles state update, event logging, and player balance deduction
                await this.forfeitBonus(instance.id);
                processedCount++;
            } catch (err) {
                logger.error('[Bonus Ops] Bulk forfeit failed for instance', { instanceId: instance.id, error: err.message });
            }
        }

        return { success: true, count: processedCount };
    }

    static async extendExpiry(instanceId, days) {
        const { data: instance, error: fetchError } = await supabaseService.client
            .from('bonus_instances')
            .select('*')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) throw new Error('Bonus instance not found');

        const currentExpiry = instance.expires_at ? new Date(instance.expires_at) : new Date();
        const newExpiry = new Date(currentExpiry.getTime() + (days * 24 * 60 * 60 * 1000));

        const { error: updateError } = await supabaseService.client
            .from('bonus_instances')
            .update({
                expires_at: newExpiry.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', instanceId);

        if (updateError) throw updateError;

        return { success: true, new_expiry: newExpiry.toISOString() };
    }

    /**
     * Manual & Bulk Issuance
     */
    static async issueManualBonus(brandId, playerId, templateId, customAmount) {
        const { data: template, error: templateError } = await supabaseService.client
            .from('bonus_templates')
            .select('*')
            .eq('id', templateId)
            .single();

        if (templateError || !template) throw new Error('Template not found');

        const amount = customAmount || template.max_amount || 10;

        // Check for bonus suppression
        const { data: profile } = await supabaseService.client
            .from('player_profiles')
            .select('bonus_suppressed')
            .eq('player_id', playerId)
            .maybeSingle();

        if (profile?.bonus_suppressed) {
            logger.warn('Bonus issuance blocked: Player is under bonus suppression', { playerId, templateId });
            throw new Error('BONUS_SUPPRESSED');
        }

        const WalletService = require('./wallet-service');
        return await WalletService.creditBonus(playerId, amount, template.bonus_code, brandId, `manual-${Date.now()}`);
    }

    static async getAnalytics(brandId) {
        // Summary stats for bonuses
        const { data: instances } = await supabaseService.client
            .from('bonus_instances')
            .select('amount_credited, state, wagering_progress, wagering_required')
            .eq('brand_id', brandId);

        if (!instances) return {};

        const stats = {
            total_credited: 0,
            active_count: 0,
            completed_count: 0,
            forfeited_count: 0,
            expired_count: 0,
            avg_wagering_completion: 0
        };

        let completionSum = 0;
        let completionCount = 0;

        instances.forEach(ins => {
            stats.total_credited += Number(ins.amount_credited);
            if (ins.state === 'ONGOING' || ins.state === 'CREATED') stats.active_count++;
            else if (ins.state === 'COMPLETED') stats.completed_count++;
            else if (ins.state === 'FORFEITED') stats.forfeited_count++;
            else if (ins.state === 'EXPIRED') stats.expired_count++;

            if (ins.wagering_required > 0) {
                const progress = Math.min(1, Number(ins.wagering_progress) / Number(ins.wagering_required));
                completionSum += progress;
                completionCount++;
            }
        });

        stats.avg_wagering_completion = completionCount > 0 ? (completionSum / completionCount) : 0;

        return stats;
    }
}

module.exports = BonusManagementService;
