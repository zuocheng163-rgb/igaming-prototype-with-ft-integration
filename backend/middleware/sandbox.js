const { logger } = require('../services/logger');
const SimulatorService = require('../services/simulator-service');

/**
 * SandboxMode Middleware
 * Bypasses real database/CRM calls when 'x-sandbox-mode' header is present
 * or when process.env.DEMO_MODE is enabled.
 */
const sandboxMiddleware = async (req, res, next) => {
    // Skip sandbox logic for Socket.IO connections
    if (req.path.startsWith('/socket.io')) {
        return next();
    }

    const isAfaPath = req.path.includes('/v1/ops/') || req.path.includes('/.well-known/');
    const isSandbox = (req.headers['x-sandbox-mode'] === 'true' || 
                      process.env.DEMO_MODE === 'true' || 
                      req.path.includes('/simulator/')) && !isAfaPath;

    if (isSandbox) {
        req.isSandbox = true;

        // Skip noisy logs for heartbeats
        if (!req.path.includes('/stats/') && !req.path.includes('/balance')) {
            logger.info(`[Sandbox] Intercepting request: ${req.method} ${req.path}`, { url: req.url });
        }

        // Delegate all mock handling to SimulatorService
        const handled = await SimulatorService.handleSandboxRequest(req, res);
        if (handled === true) return;

        // If not handled by simulator (like wallet actions), flag for service-level mocking
        if (req.method === 'POST' && (req.path.includes('/debit') || req.path.includes('/credit') || req.path.includes('/deposit'))) {
            req.useMockData = true;
            logger.info(`[Sandbox] Flagging request for service-level mocking: ${req.path}`);
        }
    }

    next();
};

module.exports = sandboxMiddleware;
