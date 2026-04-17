const supabaseService = require('./supabase');
const { logger } = require('./logger');

/**
 * ProviderConfigService
 * Manages operator-provider relationships and credentials.
 */
class ProviderConfigService {
    // Initialize a cache for configurations
    static configs = {};

    /**
     * Get provider configuration for an operator
     * @param {string} brandId
     * @param {string} provider (evolution, pragmatic, etc.)
     */
    static async getConfig(brandId, provider) {
        if (!this.configs[brandId]) {
            await this.loadConfigs(brandId);
        }
        return this.configs[brandId]?.[provider] || null;
    }

    static async loadConfigs(brandId) {
        try {
            const config = await supabaseService.getTenantConfig(brandId); // Assuming getTenantConfig exists and returns tenant config including provider_settings
            if (config && config.provider_settings) {
                this.configs[brandId] = config.provider_settings;
            } else {
                logger.warn(`Tenant config or provider settings not found for brandId`, { brandId });
                this.configs[brandId] = {}; // Initialize as empty to avoid repeated loading attempts
            }
            return data;
        } catch (err) {
            logger.error(`Error fetching provider config`, { err: err.message });
            return null;
        }
    }

    /**
     * Enable or disable a provider for an operator
     */
    static async setStatus(brandId, providerSlug, isActive) {
        const { error } = await supabaseService.client
            .from('operator_providers')
            .update({ is_active: isActive, updated_at: new Date() })
            .eq('brand_id', brandId)
            .eq('provider_slug', providerSlug);

        if (error) throw error;
        logger.info(`Provider status updated`, { brandId, providerSlug, isActive });
    }

    /**
     * Upsert provider credentials
     */
    static async saveCredentials(brandId, providerSlug, credentials) {
        // In production, credentials should be encrypted before storage
        const { error } = await supabaseService.client
            .from('operator_providers')
            .upsert({
                brand_id: brandId,
                provider_slug: providerSlug,
                credentials: credentials,
                is_active: true,
                updated_at: new Date()
            });

        if (error) throw error;
        logger.info(`Provider credentials saved`, { brandId, providerSlug });
    }

    /**
     * Check health of all providers for an operator
     */
    static async healthCheck(brandId) {
        const { data, error } = await supabaseService.client
            .from('operator_providers')
            .select('provider_slug, is_active, last_success_at')
            .eq('brand_id', brandId);

        if (error) throw error;
        return data.map(p => ({
            provider: p.provider_slug,
            status: p.is_active ? 'HEALTHY' : 'DISABLED',
            lastSync: p.last_success_at
        }));
    }

    static async getIntegrations(brandId) {
        const { data, error } = await supabaseService.client
            .from('operator_providers')
            .select('*')
            .eq('brand_id', brandId);

        if (error) throw error;
        
        // Mask credentials before sending to frontend
        return data.map(p => {
            const maskedCreds = {};
            if (p.credentials) {
                Object.keys(p.credentials).forEach(key => {
                    const val = p.credentials[key];
                    if (typeof val === 'string' && val.length > 8) {
                        maskedCreds[key] = `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
                    } else if (typeof val === 'string' && val.length > 0) {
                        maskedCreds[key] = '***';
                    } else {
                        maskedCreds[key] = val;
                    }
                });
            }
            return {
                ...p,
                credentials: maskedCreds
            };
        });
    }
}

module.exports = ProviderConfigService;
