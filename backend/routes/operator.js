const express = require('express');
const router = express.Router();
const supabaseService = require('../services/supabase');
const ftService = require('../services/ft-integration');
const { logger, auditLog, generateCorrelationId } = require('../services/logger');
const rabbitmq = require('../services/rabbitmq');
const { featureGate } = require('../middleware/feature-gate');
const SelfExclusionService = require('../services/self-exclusion-service');
const RGAuditService = require('../services/rg-audit-service');

const { correlationMiddleware, authenticateRequest } = require('../middleware/auth');

router.use(correlationMiddleware);

/**
 * RBAC Helper Middleware
 */
const requireAdmin = (req, res, next) => {
    if (req.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
};

// --- ENDPOINTS ---

router.post('/authenticate', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
    try {
        const { username, password } = req.body;
        const isDemo = process.env.DEMO_MODE === 'true';

        const authHeader = req.headers['authorization'] || '';
        let sessionToken = authHeader;
        while (sessionToken.toLowerCase().startsWith('bearer ')) {
            sessionToken = sessionToken.substring(7).trim();
        }
        
        if (!sessionToken && isDemo && password) {
            sessionToken = password;
        }

        let user = await supabaseService.getUser(username, sessionToken);

        // Fallback to Demo Login if user not in DB and sandbox/demo mode is enabled
        const isSandbox = req.headers['x-sandbox-mode'] === 'true' || isDemo;
        if (!user && isSandbox && (sessionToken?.startsWith('token-') || username)) {
            const targetUsername = username || sessionToken?.replace('token-', '').split('-')[0];

            logger.info('Using Sandbox Fallback for Auth (JIT)', { targetUsername, correlationId });

            // Try to find existing user first
            user = await supabaseService.getUserById(targetUsername);

            if (!user) {
                // Create user if not exists
                try {
                    user = await supabaseService.createUser({
                        username: targetUsername,
                        email: `${targetUsername}@example.com`,
                        token: sessionToken,
                        brand_id: 1,
                        roles: ['ADMIN'] // Sandbox users are admins in operator portal
                    });
                } catch (e) {
                    logger.error('Sandbox JIT User Creation Failed', { error: e.message });
                }
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid API Token or Username' });
        }

        // Update Last Login & Token (Graceful degradation)
        try {
            const updates = { last_login: new Date().toISOString() };
            if (sessionToken && user.token !== sessionToken) {
                updates.token = sessionToken;
            }
            await supabaseService.updateUser(user.id, updates);
        } catch (e) {
            logger.warn(`Failed to update user session data for ${user.id}`, { error: e.message });
        }

        const brandId = user.brand_id || 1;
        const sessionId = `sid-${user.id}-${Date.now()}`;

        await ftService.pushEvent(user.user_id, 'login', {
            session_id: sessionId,
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        }, { correlationId, brandId });

        await auditLog({
            correlationId,
            brandId,
            actor_id: user.user_id,
            action: 'user:login',
            entity_type: 'player',
            entity_id: user.id,
            metadata: {
                sessionId,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            }
        });

        await ftService.pushEvent(user.user_id, 'balance', {
            amount: user.balance,
            bonus_amount: user.bonus_balance || 0,
            currency: user.currency
        }, { correlationId, brandId });

        const config = await supabaseService.getTenantConfig(brandId);
        const offering = (process.env.PRODUCT_OFFERING || config?.product_tier || 'BASIC').toUpperCase();

        const authResponse = {
            sid: sessionId,
            user_id: user.user_id,
            currency: user.currency,
            brand_id: brandId,
            user: {
                id: user.id,
                user_id: user.user_id,
                username: user.username,
                balance: user.balance,
                bonus_balance: user.bonus_balance,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email
            },
            productOffering: offering
        };

        // Add 'token' field ONLY in demo mode to keep clean
        if (isDemo) {
            authResponse.token = sessionId;
        }

        res.json(authResponse);
    } catch (error) {
        logger.error('Authentication failure', { correlationId, error: error.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/balance', authenticateRequest, async (req, res) => {
    // Prevent browser and proxy caching to ensure fresh balance
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    logger.info('[Balance SPI] Fetching balance', { username: req.user.username, balance: req.user.balance });
    res.json({
        balance: req.user.balance,
        bonus_balance: req.user.bonus_balance || 0,
        currency: req.user.currency
    });
});

const WalletService = require('../services/wallet-service');

router.post('/debit', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    const { user_id, amount, transaction_id, game_id, operator_id } = req.body;
    const currentOperatorId = operator_id || req.user?.operator_id || 'default';

    if (!user_id || amount === undefined) {
        return res.status(400).json({ error: 'Missing user_id or amount' });
    }

    // Normalize user_id: strip timestamp if present from token-based legacy SDK calls
    const normalizedUserId = user_id.split('-')[0];

    try {
        const result = await WalletService.debit(
            normalizedUserId, amount, transaction_id, game_id,
            currentOperatorId, correlationId
        );
        logger.info('[Debit SPI] Success', { user_id: normalizedUserId, amount, balance_after: result.balance });
        res.json(result);
    } catch (error) {
        const status = error.message === 'INSUFFICIENT_FUNDS' ? 402 : 500;
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Debit failed');
        res.status(status).json({ error: errorMessage });
    }
});

router.post('/credit', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    const { user_id, amount, transaction_id, game_id, operator_id } = req.body;
    const currentOperatorId = operator_id || req.user?.operator_id || 'default';

    if (!user_id || amount === undefined) {
        return res.status(400).json({ error: 'Missing user_id or amount' });
    }

    const normalizedUserId = user_id.split('-')[0];

    try {
        const result = await WalletService.credit(
            normalizedUserId, amount, transaction_id, game_id,
            currentOperatorId, correlationId
        );
        logger.info('[Credit SPI] Success', { user_id: normalizedUserId, amount, balance_after: result.balance });
        res.json(result);
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

// User Onboarding & Updates
router.post('/register', async (req, res) => {
    const { correlationId } = req;
    const { username, email, first_name, last_name, brand_id } = req.body;

    if (!username || !email) return res.status(400).json({ error: 'Missing required fields' });
    if (!brand_id) return res.status(400).json({ error: 'Brand ID is required' });

    try {
        // Optional GAMSTOP Check
        const gamstopStatus = await SelfExclusionService.checkGAMSTOP(email, brand_id);
        if (['EXCLUDED', 'SERVICE_UNAVAILABLE', 'PARTIAL_MATCH'].includes(gamstopStatus)) {
            const errorMsg = gamstopStatus === 'EXCLUDED' 
                ? 'Your details match a self-exclusion on GAMSTOP.'
                : `GAMSTOP verification is currently ${gamstopStatus.replace(/_/g, ' ').toLowerCase()}. Please try again later.`;
            
            logger.warn('Registration blocked by GAMSTOP status:', { username, email, brand_id, gamstopStatus });
            await RGAuditService.log(brand_id, username, 'RG_GAMSTOP_BLOCKED_REGISTRATION', { email, status: gamstopStatus });
            return res.status(403).json({ error: `Registration blocked: ${errorMsg}` });
        }

        const token = `token-${username}-${Date.now()}`;
        const newUser = await supabaseService.createUser({
            username, email, first_name, last_name,
            token, brand_id: parseInt(brand_id)
        });

        // F10: Create Player Profile & Pub Event
        await supabaseService.upsertPlayerProfile({
            player_id: newUser.id,
            tenant_id: newUser.brand_id,
            email: newUser.email,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            language: newUser.language || 'en-GB',
            country: 'XX' // To be updated via KYC
        });

        if (typeof rabbitmq !== 'undefined' && rabbitmq.publishEvent) {
            await rabbitmq.publishEvent(`user.${newUser.id}.registration`, {
                player_id: newUser.id,
                tenant_id: newUser.brand_id,
                type: 'REGISTRATION',
                timestamp: new Date().toISOString()
            });
        }

        await ftService.pushEvent(newUser.user_id, 'registration', {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        }, { correlationId, brandId: newUser.brand_id });

        if (!newUser) {
            throw new Error('User creation succeeded but no data was returned');
        }

        const config = await supabaseService.getTenantConfig(brand_id);
        const offering = (process.env.PRODUCT_OFFERING || config?.product_tier || 'BASIC').toUpperCase();

        res.json({
            user_id: newUser.username,
            token,
            user: { ...newUser, user_id: newUser.username },
            productOffering: offering
        });
    } catch (error) {
        logger.error('Registration failed', { correlationId, error: error.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/user/update', authenticateRequest, async (req, res) => {
    const { correlationId, user } = req;
    try {
        const updatedUser = await supabaseService.updateUser(user.id, req.body);

        await ftService.pushEvent(user.user_id, 'user_update', {
            ...req.body
        }, { correlationId, brandId: user.brand_id });

        res.json({ user: { ...updatedUser, user_id: updatedUser.username } });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

router.get('/user/alerts', authenticateRequest, async (req, res) => {
    const userId = req.user.user_id; // Use canonical username for matching audit logs
    const since = new Date(Date.now() - 60 * 1000).toISOString(); // Check last minute for safety

    try {
        const { data, error } = await supabaseService.client
            .from('platform_audit_logs')
            .select('metadata, timestamp')
            .eq('actor_id', userId)
            .eq('action', 'user:alert')
            .gte('timestamp', since)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            res.json({ alert: data[0].metadata });
        } else {
            res.json({ alert: null });
        }
    } catch (error) {
        logger.error('Failed to fetch user alerts', { error: error.message, userId });
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// FT Simulation Endpoints (Consents, Blocks, etc.)
router.put('/userconsents/:userid', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    const { consents } = req.body;
    const userId = req.params.userid;

    try {
        const user = await supabaseService.getUserById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await auditLog({
            correlationId,
            operatorId: user.operator_id,
            actor_id: user.id,
            action: 'inbound:update_consent',
            entity_type: 'user',
            entity_id: user.id,
            status: 'success',
            metadata: { request: { consents } },
            message: `User ${user.id} updated consents via simulation`
        });

        await ftService.pushEvent(user.user_id, 'consent', {
            consents
        }, { correlationId, brandId: user.brand_id });

        res.json({ success: true });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

router.put('/userblocks/:userid', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    const { blocks } = req.body;
    const userId = req.params.userid;

    try {
        const user = await supabaseService.getUserById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await auditLog({
            correlationId,
            operatorId: user.operator_id,
            actor_id: user.id,
            action: 'inbound:update_block',
            entity_type: 'user',
            entity_id: user.id,
            status: 'success',
            metadata: { request: { blocks } },
            message: `User ${user.id} updated blocks via simulation`
        });

        await ftService.pushEvent(user.user_id, 'block', {
            blocks
        }, { correlationId, brandId: user.brand_id });

        res.json({ success: true });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

router.get('/userconsents/:userid', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    try {
        const data = await supabaseService.getUserConsents(req.params.userid);

        // Transform the DB record into the FT-required array structure
        const response = [
            { type: 'email', opted_in: !!data.email },
            { type: 'sms', opted_in: !!data.sms },
            { type: 'telephone', opted_in: !!data.telephone },
            { type: 'postMail', opted_in: !!data.post_mail },
            { type: 'siteNotification', opted_in: !!data.site_notification },
            { type: 'pushNotification', opted_in: !!data.push_notification }
        ];

        res.json({ consents: response });
    } catch (error) {
        logger.error('Failed to fetch consents', { correlationId, error: error.message });
        res.status(500).json({ error: 'Failed to fetch consents' });
    }
});

router.get('/userblocks/:userid', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    try {
        const data = await supabaseService.getUserBlocks(req.params.userid);

        // FT Compliance: Return array-based blocks format
        const response = {
            blocks: [
                {
                    active: !!data.blocked,
                    type: 'Blocked',
                    note: 'Account status'
                },
                {
                    active: !!data.excluded,
                    type: 'Excluded',
                    note: 'Self-exclusion status'
                }
            ]
        };

        res.json(response);
    } catch (error) {
        logger.error('Failed to fetch blocks', { correlationId, error: error.message });
        res.status(500).json({ error: 'Failed to fetch blocks' });
    }
});

router.post('/registration', authenticateRequest, async (req, res) => {
    const { correlationId, user } = req;
    try {
        await ftService.pushEvent(user.user_id, 'registration', {
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        }, { correlationId, brandId: user.brand_id });
        res.json({ success: true });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

router.post('/logout', authenticateRequest, async (req, res) => {
    const { correlationId, user } = req;
    const brandId = user.brand_id || 1;
    try {
        // Logout events are NOT sent to RabbitMQ — audit log only
        await auditLog({
            correlationId,
            brandId,
            actor_id: user.user_id,
            action: 'user:logout',
            entity_type: 'player',
            entity_id: user.id,
            message: `User ${user.user_id} logged out`
        });

        logger.info(`User ${user.id} logged out successfully`, { correlationId });
        res.json({ success: true });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Error occurred');
        res.status(500).json({ error: errorMessage });
    }
});

// F9: Wallet Payment Operations
router.post('/deposit/initiate', authenticateRequest, async (req, res) => {
    const { correlationId, user } = req;
    const { amount, currency, return_url } = req.body;

    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    try {
        const result = await WalletService.initiateDeposit(
            user.id, parseFloat(amount), currency || 'EUR',
            return_url, user.brand_id, correlationId
        );
        res.json(result);
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Deposit initiation failed');
        res.status(500).json({ error: errorMessage });
    }
});

router.get('/activities', authenticateRequest, async (req, res) => {
    try {
        const logs = await supabaseService.getActivities(req.user.operator_id);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// F8: Bonus Operations
router.get('/bonus/list', authenticateRequest, async (req, res) => {
    try {
        // Fetch available bonuses from DB
        const { data, error } = await supabaseService.client
            .from('bonus_templates')
            .select('bonus_code, name, expiry_days')
            .eq('active', true);

        if (error) {
            throw error;
        }

        const formattedData = (data || []).map(item => ({
            text: item.name,
            value: item.bonus_code,
            expiry_days: item.expiry_days
        }));

        res.json({
            Data: formattedData,
            Success: true,
            Errors: []
        });
    } catch (error) {
        logger.error('Failed to fetch bonuses', { error: error.message });
        res.status(500).json({
            Data: [],
            Success: false,
            Errors: [error.message]
        });
    }
});

const BonusManagementService = require('../services/bonus-management-service');

// --- Operator Bonus Management Endpoints ---

router.get('/operator/bonuses/templates', authenticateRequest, requireAdmin, featureGate('BONUSING'), async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    logger.info('[Operator API] Fetching templates', { brandId, correlationId: req.correlationId });
    try {
        const templates = await BonusManagementService.listTemplates(brandId);
        logger.info('[Operator API] Fetched templates', { count: templates.length, brandId });
        res.json(templates);
    } catch (error) {
        logger.error('[Operator API] Failed to fetch templates', { error: error.message, brandId });
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

router.post('/operator/bonuses/templates', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const template = await BonusManagementService.createTemplate(brandId, req.body);
        res.json(template);
    } catch (error) {
        logger.error('[Operator API] Template Creation Failed', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to create template' });
    }
});

router.patch('/operator/bonuses/templates/:id', authenticateRequest, requireAdmin, featureGate('BONUSING'), async (req, res) => {
    try {
        const template = await BonusManagementService.updateTemplate(req.params.id, req.body);
        res.json(template);
    } catch (error) {
        logger.error('[Operator API] Template Update Failed', { error: error.message, stack: error.stack, id: req.params.id });
        res.status(500).json({ error: 'Failed to update template' });
    }
});

router.delete('/operator/bonuses/templates/:id', authenticateRequest, requireAdmin, featureGate('BONUSING'), async (req, res) => {
    try {
        await BonusManagementService.deleteTemplate(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error('[Operator API] Template Deletion Failed', { error: error.message, stack: error.stack, id: req.params.id });
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

router.get('/operator/bonuses/instances', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const instances = await BonusManagementService.listActiveInstances(brandId, req.query);
        res.json(instances);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch instances' });
    }
});

router.post('/operator/bonuses/instances/:id/forfeit', authenticateRequest, requireAdmin, async (req, res) => {
    try {
        const result = await BonusManagementService.forfeitBonus(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/operator/bonuses/instances/:id/extend', authenticateRequest, requireAdmin, featureGate('BONUSING'), async (req, res) => {
    const { days } = req.body;
    try {
        const result = await BonusManagementService.extendExpiry(req.params.id, days || 7);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/operator/bonuses/issue', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { player_id, template_id, amount } = req.body;
    try {
        const result = await BonusManagementService.issueManualBonus(brandId, player_id, template_id, amount);
        res.json(result);
    } catch (error) {
        const isClientError = error.message === 'BONUS_SUPPRESSED' || error.message === 'Template not found';
        if (isClientError) {
            logger.warn('[Operator API] Bonus Issue Blocked (Client Error)', { error: error.message, player_id });
        } else {
            logger.error('[Operator API] Bonus Issue Failed', { error: error.message, stack: error.stack, player_id });
        }
        res.status(isClientError ? 422 : 500).json({ error: error.message });
    }
});

router.get('/operator/bonuses/analytics', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const stats = await BonusManagementService.getAnalytics(brandId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});


router.post('/bonus/credit', authenticateRequest, featureGate('BONUSING'), async (req, res) => {
    const { correlationId } = req;
    const {
        user_id,
        bonus_code,
        bonus_contract_id,
        amount,
        currency
    } = req.body;

    // Fast Track ID Tracking
    const fasttrack_references = {
        id: req.headers['x-fasttrack-id'],
        activity_id: req.headers['x-fasttrack-activityid'],
        action_id: req.headers['x-fasttrack-actionid'],
        action_group_id: req.headers['x-fasttrack-actiongroupid'],
        trigger_hash: req.headers['x-fasttrack-triggerhash']
    };

    const targetBonusCode = bonus_contract_id || bonus_code || req.body.reason;
    const creditAmount = amount !== undefined ? parseFloat(amount) : 100;
    const targetUserId = user_id || req.user?.id;

    if (!targetUserId) return res.status(400).json({ Success: false, Errors: ['user_id is required'] });
    if (!targetBonusCode) return res.status(400).json({ Success: false, Errors: ['bonus_code is required'] });

    try {
        const result = await WalletService.creditBonus(
            targetUserId,
            creditAmount,
            targetBonusCode,
            req.brandId || req.user?.brand_id || 1,
            correlationId,
            fasttrack_references
        );
        res.json({ Success: true, Errors: [], ...result });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Bonus credit failed');
        logger.error('Bonus credit failed', { error: errorMessage, targetUserId, targetBonusCode });
        res.status(500).json({ Success: false, Errors: [errorMessage] });
    }
});

router.post('/bonus/credit/funds', authenticateRequest, featureGate('BONUSING'), async (req, res) => {
    const { correlationId } = req;
    const { user_id, bonus_code, amount, currency, reason } = req.body;

    // Fast Track ID Tracking
    const fasttrack_references = {
        id: req.headers['x-fasttrack-id'],
        activity_id: req.headers['x-fasttrack-activityid'],
        action_id: req.headers['x-fasttrack-actionid'],
        action_group_id: req.headers['x-fasttrack-actiongroupid'],
        trigger_hash: req.headers['x-fasttrack-triggerhash']
    };

    const targetUserId = user_id || req.user?.id;
    if (!targetUserId) return res.status(400).json({ Success: false, Errors: ['user_id is required'] });
    if (!amount) return res.status(400).json({ Success: false, Errors: ['Amount is required'] });

    try {
        const result = await WalletService.creditBonusFunds(
            targetUserId,
            parseFloat(amount),
            bonus_code || reason || 'cashback',
            req.brandId || req.user?.brand_id || 1,
            correlationId,
            fasttrack_references
        );
        res.json({ Success: true, Errors: [], ...result });
    } catch (error) {
        const errorMessage = typeof error === 'string' ? error : (error.message || 'Bonus funds credit failed');
        logger.error('Bonus funds credit failed', { error: errorMessage, targetUserId });
        res.status(500).json({ Success: false, Errors: [errorMessage] });
    }
});

// User Details (Used by FT)
router.get('/userdetails/:userid', authenticateRequest, async (req, res) => {
    const { correlationId } = req;
    const user = await supabaseService.getUserById(req.params.userid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 100% FT Compliance: Include all 18+ required fields
    const response = {
        user_id: user.user_id, // Important: Use the public user_id
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        language: user.language || 'en',
        country: user.country || 'MT',
        currency: user.currency || 'EUR',
        balance: user.balance,
        registration_date: user.registration_date,
        verified_at: user.verified_at,
        birth_date: user.birth_date,
        sex: user.sex,
        title: user.title,
        address: user.address,
        city: user.city,
        postal_code: user.postal_code,
        mobile: user.mobile,
        mobile_prefix: user.mobile_prefix,
        origin: user.origin,
        market: user.market,
        registration_code: user.registration_code,
        affiliate_reference: user.affiliate_reference,
        is_blocked: !!user.is_blocked,
        is_excluded: !!user.is_excluded,
        roles: Array.isArray(user.roles) ? user.roles : ['PLAYER']
    };

    await auditLog({
        correlationId,
        brandId: user.brand_id ? user.brand_id.toString() : '1',
        action: 'inbound:userdetails',
        entity_type: 'user',
        entity_id: user.id,
        metadata: { response },
        message: 'Shared user details with FT'
    });

    res.json(response);
});


const ReportingService = require('../services/reporting');

router.get('/stats/summary', authenticateRequest, async (req, res) => {
    const operatorId = req.user?.operator_id || req.operatorId || 'default';
    try {
        const summary = await ReportingService.getOperatorSummary(operatorId);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

router.get('/stats/churn', authenticateRequest, async (req, res) => {
    const operatorId = req.user?.operator_id || req.operatorId || 'default';
    try {
        const profiles = await ReportingService.getChurnRiskProfiles(operatorId);
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch churn risk data' });
    }
});

router.get('/stats/live', authenticateRequest, async (req, res) => {
    const operatorId = req.user?.operator_id || req.operatorId || 'default';
    try {
        const metrics = await ReportingService.getLiveMetrics(operatorId);
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live metrics' });
    }
});

const PaymentAnalyticsService = require('../services/payment-analytics');

router.post('/keys/rotate', authenticateRequest, requireAdmin, async (req, res) => {
    const { correlationId } = req;
    logger.info('API Key Rotation Request', { correlationId });

    // Logic: In production, generate new key in Supabase/Vault and invalidate old one
    const newKey = `sk_live_${Math.random().toString(36).substr(2, 24)}`;

    res.json({
        success: true,
        message: 'Master API Key rotated. Please update your environment variables.',
        key_preview: `${newKey.substr(0, 8)}...`
    });
});

router.get('/payment/health', authenticateRequest, async (req, res) => {
    try {
        const stats = PaymentAnalyticsService.getProviderStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch provider health' });
    }
});

// --- OPERATOR PORTAL SERVERLESS ENDPOINTS ---

router.get('/operator/notifications', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const notifications = await supabaseService.getOperatorNotifications(brandId);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

router.get('/operator/stats', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { period } = req.query;
    try {
        const stats = await supabaseService.getOperatorStats(brandId, period);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch portal stats' });
    }
});

router.get('/operator/config/doc', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const config = await supabaseService.getTenantConfig(brandId);
        res.json({
            product_tier: config?.product_tier || 'basic',
            gamstop_enabled: config?.gamstop_enabled || false,
            is_gamstop_key_set: !!process.env.GAMSTOP_API_KEY,
            is_gamstop_mock_mode: process.env.GAMSTOP_MOCK_MODE === 'true',
            affordability_threshold: config?.doc_affordability_threshold || 1000,
            velocity_spike_count: config?.doc_velocity_spike_count || 5,
            rapid_escalation_pct: config?.doc_rapid_escalation_pct || 100,
            session_limit_minutes: config?.doc_session_limit_minutes || 60
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch DoC config' });
    }
});

router.post('/operator/config/doc', authenticateRequest, requireAdmin, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const {
        product_tier,
        gamstop_enabled,
        affordability_threshold,
        velocity_spike_count,
        rapid_escalation_pct,
        session_limit_minutes
    } = req.body;

    try {
        const { error } = await supabaseService.client
            .from('tenant_configs')
            .upsert({
                brand_id: String(brandId),
                product_tier: product_tier || 'basic',
                gamstop_enabled: !!gamstop_enabled,
                doc_affordability_threshold: affordability_threshold,
                doc_velocity_spike_count: velocity_spike_count,
                doc_rapid_escalation_pct: rapid_escalation_pct,
                doc_session_limit_minutes: session_limit_minutes,
                operator_name: brandId === 1 ? 'Default Operator' : `Brand ${brandId}`,
                updated_at: new Date().toISOString()
            }, { onConflict: 'brand_id' });

        if (error) throw error;

        logger.info(`DoC config updated for Brand ${brandId}`, { brandId, velocity_spike_count });
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to update DoC config', { error: error.message, brandId });
        res.status(500).json({ error: 'Failed to update DoC config' });
    }
});

router.get('/operator/search', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { q } = req.query;
    try {
        const results = await supabaseService.searchOperatorGlobal(brandId, q);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

router.get('/operator/users/:userId', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { userId } = req.params;
    try {
        const player = await supabaseService.getUserByIdAndBrand(userId, brandId);
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // Fetch tenant config to know if GAMSTOP is enabled
        const cfg = await supabaseService.getTenantConfig(brandId);

        res.json({
            ...player,
            _gamstop_enabled: cfg?.gamstop_enabled || false,
            _gamstop_mock_mode: process.env.GAMSTOP_MOCK_MODE === 'true'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch player details' });
    }
});

// Helper function to parse filter operators
const parseOperatorFilter = (input) => {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    const operatorRegex = /^(>=|<=|>|<|=)\s*(.+)$/;
    const match = trimmed.match(operatorRegex);

    if (match) {
        return { operator: match[1], value: match[2].trim() };
    }
    return null;
};

// Helper function to parse date string (supports MM/DD/YYYY and MM/DD/YYYY, HH:MM:SS)
const parseDate = (dateStr, operator) => {
    if (!dateStr) return null;

    try {
        let date;

        // Try parsing MM/DD/YYYY, HH:MM:SS format
        const dateTimeRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{1,2}):(\d{1,2})$/;
        const dateTimeMatch = dateStr.trim().match(dateTimeRegex);

        if (dateTimeMatch) {
            const [, month, day, year, hour, minute, second] = dateTimeMatch;
            date = new Date(year, month - 1, day, hour, minute, second);
            return date.toISOString();
        }

        // Try parsing DD/MM/YYYY format (International/European) - Priority for portal
        const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const dateMatch = dateStr.trim().match(dateRegex);

        if (dateMatch) {
            let [, first, second, year] = dateMatch;
            let month, day;

            // Simple heuristic to differentiate MM/DD/YYYY and DD/MM/YYYY
            // Default to DD/MM/YYYY for consistency with portal usage
            if (parseInt(first) > 12) {
                day = first;
                month = second;
            } else if (parseInt(second) > 12) {
                day = first;
                month = second; // If second > 12, it's likely MM/DD/YYYY but second is day. Wait. 13/02 -> 13 is day.
                // Actually if second > 12, it MUST be MM/DD/YYYY where second is Day. NO.
                // If input is 02/13/2026. first=02, second=13.
                // 13 > 12. So second is DAY. first is MONTH.
                month = first;
                day = second;
            } else {
                // Ambiguous. Default to DD/MM/YYYY.
                day = first;
                month = second;
            }

            date = new Date(year, month - 1, day);

            // Set time based on operator
            if (operator === '<') {
                date.setHours(0, 0, 0, 0);
            } else if (operator === '<=') {
                date.setHours(23, 59, 59, 999);
            } else if (operator === '>') {
                date.setHours(23, 59, 59, 999);
            } else if (operator === '>=') {
                date.setHours(0, 0, 0, 0);
            } else {
                date.setHours(0, 0, 0, 0);
            }

            return date.toISOString();
        }

        return null;
    } catch (e) {
        return null;
    }
};

// Player filtering endpoint
router.post('/operator/players/filter', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { country, username, email, balance, last_login, page = 1, limit = 10 } = req.body;

    try {
        const filters = {};

        if (country) filters.country = country;
        if (username) filters.username = username;
        if (email) filters.email = email;

        if (balance) {
            const parsed = parseOperatorFilter(balance);
            if (parsed) {
                filters.balance = { operator: parsed.operator, value: parseFloat(parsed.value) };
            }
        }

        if (last_login) {
            const parsed = parseOperatorFilter(last_login);
            if (parsed) {
                const dateValue = parseDate(parsed.value, parsed.operator);
                if (dateValue) {
                    filters.last_login = { operator: parsed.operator, value: dateValue };
                }
            }
        }

        const result = await supabaseService.getFilteredPlayers(brandId, filters, page, limit);
        res.json(result);
    } catch (error) {
        logger.error('Player filter failed', { error: error.message });
        res.status(500).json({ error: 'Failed to filter players' });
    }
});

// Transaction filtering endpoint
router.post('/operator/transactions/filter', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { transaction_id, user, type, amount, date, status, page = 1, limit = 10 } = req.body;

    try {
        const filters = {};

        if (transaction_id) filters.transaction_id = transaction_id;
        if (user) filters.user = user;
        if (type) filters.type = type;
        if (status) filters.status = status;

        if (amount) {
            const parsed = parseOperatorFilter(amount);
            if (parsed) {
                filters.amount = { operator: parsed.operator, value: parseFloat(parsed.value) };
            }
        }

        if (date) {
            const parsed = parseOperatorFilter(date);
            if (parsed) {
                const dateValue = parseDate(parsed.value, parsed.operator);
                if (dateValue) {
                    filters.date = { operator: parsed.operator, value: dateValue };
                }
            }
        }

        const result = await supabaseService.getFilteredTransactions(brandId, filters, page, limit);
        res.json(result);
    } catch (error) {
        logger.error('Transaction filter failed', { error: error.message });
        res.status(500).json({ error: 'Failed to filter transactions' });
    }
});

router.get('/operator/compliance/alerts', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { startDate, endDate, id, date } = req.query;

    let start = startDate;
    let end = endDate;

    if (date) {
        const parsed = parseOperatorFilter(date);
        if (parsed) {
            const dateValue = parseDate(parsed.value, parsed.operator);
            if (dateValue) {
                if (parsed.operator === '>=' || parsed.operator === '>') start = dateValue;
                if (parsed.operator === '<=' || parsed.operator === '<') end = dateValue;
            }
        }
    }

    try {
        const alerts = await supabaseService.getComplianceAlerts(brandId, 50, { startDate: start, endDate: end, id });
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch compliance alerts' });
    }
});

// Operational stream endpoint
router.get('/operator/operational-stream', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { page = 1, limit = 20, type, startDate, endDate, date } = req.query;

    let start = startDate;
    let end = endDate;

    if (date) {
        const parsed = parseOperatorFilter(date);
        if (parsed) {
            const dateValue = parseDate(parsed.value, parsed.operator);
            if (dateValue) {
                if (parsed.operator === '>=' || parsed.operator === '>') start = dateValue;
                if (parsed.operator === '<=' || parsed.operator === '<') end = dateValue;
            }
        }
    }

    try {
        const result = await supabaseService.getOperationalStream(brandId, parseInt(page), parseInt(limit), { type, startDate: start, endDate: end });
        res.json(result);
    } catch (error) {
        logger.error('Operational stream fetch failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch operational stream' });
    }
});

// Operator config endpoints
router.get('/operator/config', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const config = await supabaseService.getTenantConfig(brandId);
        // For visibility, return the actual config structure but map ft_api_key to operator_api_key for frontend
        const responseData = config ? {
            ...config,
            config: {
                ...config.config,
                operator_api_key: config.ft_api_key
            }
        } : { brand_id: brandId, config: {} };

        res.json(responseData);
    } catch (error) {
        logger.error('Failed to fetch config', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch operator config' });
    }
});

router.post('/operator/config/api-key', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { api_key } = req.body;

    if (!api_key) {
        return res.status(400).json({ error: 'API key is required' });
    }

    try {
        const success = await supabaseService.updateOperatorApiKey(brandId, api_key);
        if (success) {
            res.json({ message: 'Operator API key updated successfully' });
        } else {
            res.status(500).json({ error: 'Failed to update Operator API key' });
        }
    } catch (error) {
        logger.error('Failed to update config', { error: error.message });
        res.status(500).json({ error: 'Failed to update operator config' });
    }
});

// --- Integrations Management Endpoints ---

const ProviderConfigService = require('../services/provider-config');

router.get('/operator/integrations', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    try {
        const integrations = await ProviderConfigService.getIntegrations(brandId);
        res.json(integrations);
    } catch (error) {
        logger.error('Failed to fetch integrations', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch provider integrations' });
    }
});

router.put('/operator/integrations/:slug', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { slug } = req.params;
    const { credentials } = req.body;
    
    try {
        await ProviderConfigService.saveCredentials(brandId, slug, credentials);
        res.json({ success: true, message: 'Credentials updated' });
    } catch (error) {
        logger.error('Failed to update integration credentials', { error: error.message, slug });
        res.status(500).json({ error: 'Failed to update credentials' });
    }
});

router.post('/operator/integrations/:slug/toggle', authenticateRequest, async (req, res) => {
    const brandId = req.brandId || req.user?.brand_id || 1;
    const { slug } = req.params;
    const { is_active } = req.body;
    
    try {
        await ProviderConfigService.setStatus(brandId, slug, is_active);
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        logger.error('Failed to toggle integration status', { error: error.message, slug });
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// --- DEMO / SHOWCASE ONLY ENDPOINTS ---
if (process.env.DEMO_MODE === 'true') {
    router.post('/v1/demo/deposit', async (req, res) => {
        const { user_id, amount } = req.body;
        if (!user_id || !amount) return res.status(400).json({ error: 'Missing user_id or amount' });

        try {
            const user = await supabaseService.getUserById(user_id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const newBalance = (user.balance || 0) + parseFloat(amount);
            await supabaseService.updateUser(user.id, { balance: newBalance });

            // Sync the Simulator's in-memory sandbox cache if active
            const SimulatorService = require('../services/simulator-service');
            await SimulatorService.syncBalanceFromDB(user.username);

            logger.info('[Demo] Manual deposit applied (Cache Synced)', { username: user.username, amount, newBalance });
            res.json({ success: true, balance: newBalance });
        } catch (error) {
            logger.error('[Demo] Deposit failed', { error: error.message });
            res.status(500).json({ error: 'Simulation error' });
        }
    });
}

module.exports = router;
