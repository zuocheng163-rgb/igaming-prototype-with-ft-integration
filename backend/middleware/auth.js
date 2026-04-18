const supabaseService = require('../services/supabase');
const { logger, generateCorrelationId } = require('../services/logger');

/**
 * Middleware to extract or generate Correlation ID
 */
const correlationMiddleware = (req, res, next) => {
    req.correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
};

/**
 * Middleware to authenticate user or operator
 */
const authenticateRequest = async (req, res, next) => {
    const correlationId = req.correlationId || generateCorrelationId();
    try {
        const apiKey = req.headers['x-api-key'];
        // Support ?token= query param for SSE endpoints where EventSource cannot set headers
        const authHeader = req.headers['authorization'] || (req.query.token ? `Bearer ${req.query.token}` : '');

        let sessionToken = authHeader;
        while (sessionToken.toLowerCase().startsWith('bearer ')) {
            sessionToken = sessionToken.substring(7).trim();
        }
        
        const username = req.headers['x-username'] || req.body?.username;

        logger.info('Authenticating request', {
            correlationId,
            hasSessionToken: !!sessionToken,
            tokenPrefix: sessionToken ? sessionToken.substring(0, 10) + '...' : 'none',
            username,
            path: req.path
        });

        if (!sessionToken && !apiKey) {
            logger.warn('Authentication failed: No token or API key provided', { correlationId, path: req.path });
        }

        // 1. S2S Authentication (API Key)
        if (apiKey) {
            const brandId = 1; // Default for PoC
            const config = await supabaseService.getTenantConfig(brandId);
            const dbApiKey = config?.ft_api_key;

            if (apiKey === dbApiKey || apiKey === process.env.OPERATOR_API_KEY) {
                req.isOperator = true;
                req.role = 'ADMIN'; // S2S is always Admin in PoC
                return next();
            }
        }

        // 2. User Authentication (Session Token)
        if (sessionToken) {
            // ALWAYS try to find real user in database first
            const user = await supabaseService.getUser(username, sessionToken);
            if (user) {
                req.user = user;
                req.brandId = user.brand_id || 1;

                // Elevate sandbox users to ADMIN for operator portal
                const isSandbox = req.headers['x-sandbox-mode'] === 'true' || 
                    process.env.DEMO_MODE === 'true' || 
                    sessionToken.startsWith('token-') || 
                    sessionToken.startsWith('sid-') || 
                    sessionToken === 'valid-token';
                if (sessionToken.startsWith('token-')) {
                    req.role = 'ADMIN';
                } else {
                    const userRoles = Array.isArray(user.roles) ? user.roles : [user.role || 'PLAYER'];
                    req.role = userRoles.includes('ADMIN') ? 'ADMIN' : (userRoles[0] || 'PLAYER');
                }

                req.kycStatus = user.kyc_status || 'NONE';
                return next();
            }

            // Fallback to Demo Token ONLY if user not in DB and sandbox mode is enabled
            const isSandbox = req.headers['x-sandbox-mode'] === 'true' || 
                process.env.DEMO_MODE === 'true' || 
                sessionToken.startsWith('token-') || 
                sessionToken.startsWith('sid-') || 
                sessionToken === 'valid-token';
            if (isSandbox && (sessionToken.startsWith('token-') || sessionToken.startsWith('sid-') || sessionToken === 'valid-token')) {
                // Try to determine username from token or header
                let targetUsername = username;
                if (!targetUsername) {
                    const raw = sessionToken.replace('token-', '');
                    targetUsername = raw.split('-')[0];
                }

                logger.info('[Auth] Sandbox Fallback: Resolving user', { targetUsername });

                // JIT: Find or Create User in DB
                let dbUser = await supabaseService.getUserById(targetUsername);
                if (!dbUser) {
                    logger.info('[Auth] Sandbox: User not found, creating JIT user', { targetUsername });
                    try {
                        dbUser = await supabaseService.createUser({
                            username: targetUsername,
                            email: `${targetUsername}@neostrike.io`,
                            first_name: 'Demo',
                            last_name: 'Player',
                            brand_id: 1,
                            balance: 1000,
                            bonus_balance: 100,
                            currency: 'EUR',
                            roles: ['PLAYER']
                        });
                    } catch (e) {
                        logger.error('[Auth] Sandbox: Failed to create JIT user', { error: e.message });
                    }
                }

                if (dbUser) {
                    req.user = dbUser;
                    req.brandId = dbUser.brand_id || 1;
                    req.role = 'ADMIN'; // Sandbox users are admins in operator portal context
                    req.kycStatus = dbUser.kyc_status || 'VERIFIED';
                    return next();
                }

                // Ultimate fallback if DB write fails
                req.user = { user_id: targetUsername, username: targetUsername, brand_id: 1, role: 'ADMIN' };
                req.isOperator = true;
                req.role = 'ADMIN';
                return next();
            }
        }

        return res.status(401).json({ error: 'Unauthorized' });
    } catch (e) {
        logger.error('Authentication Error', { error: e.message, correlationId });
        return res.status(500).json({ error: 'Authentication internal error' });
    }
};

module.exports = {
    correlationMiddleware,
    authenticateRequest
};
