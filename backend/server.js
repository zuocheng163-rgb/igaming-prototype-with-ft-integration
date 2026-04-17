const { logger, setDbLogHook } = require('./services/logger');

// Track and trace deprecation warnings to find the source of url.parse()
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') {
    logger.error(`[DeprecationWarning] ${warning.message}`, { stack: warning.stack });
  }
});

const dotenv = require('dotenv');
try { dotenv.config(); } catch (e) { /* .env not present in production, use Vercel env vars */ }

const express = require('express');
const http = require('http');
const cors = require('cors');
const supabaseService = require('./services/supabase');
const operatorRoutes = require('./routes/operator');
const phase1Routes = require('./routes/phase1');
const phase2Routes = require('./routes/phase2');
const phase4Routes = require('./routes/phase4');
// const { initSocket } = require('./services/socket');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sandboxMiddleware = require('./middleware/sandbox');

// Initialize Observability Bridge
setDbLogHook(supabaseService.saveAuditLog);

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Vercel)
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// 1. Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  contentSecurityPolicy: false // Disable CSP for PoC to avoid blocking resources
}));

// Robust CORS for local development and production
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-brand-id', 'x-api-key', 'x-username', 'x-sandbox-mode', 'x-correlation-id', 'Accept']
}));

// Explicit Preflight Handler (Ensure OPTIONS always returns 200 before other middleware)
app.options(/.*/, cors()); // Express 5: Use RegExp literal for robust catch-all

app.use(express.json());

// 2. Global Rate Limiting (General Protection)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(globalLimiter);

// 3. Strict Rate Limiting for sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 auth attempts per hour
  message: 'Too many authentication attempts, please try again later'
});

// Initialize WebSocket - REMOVED for Serverless Architecture
// initSocket(server);

// 1. Request logging middleware (MOVE TO TOP)
app.use((req, res, next) => {
  logger.info(`[Incoming] ${req.method} ${req.path}`, {
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  next();
});

const { featureGate } = require('./middleware/feature-gate');

// 2. Sandbox Switch
app.use(sandboxMiddleware);


// Routes
app.use('/api/authenticate', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/user', require('./routes/user'));
app.use('/api', operatorRoutes);
app.use('/api/v1/games', featureGate('GAMES'), require('./routes/games'));
app.use('/api/v1/kyc', featureGate('KYC'), require('./routes/kyc'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/providers', featureGate('PROVIDERS'), require('./routes/providers'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/v1/payments', require('./routes/payments'));

// F13-AFA: Agent-Friendly API Layer
app.use('/api/v1/ops', require('./routes/afa'));
app.use('/api/v1/auth', require('./routes/afa-auth'));

// Phase 1: Admin UX Parity (F14-01 through F14-05)
app.use('/api', phase1Routes);

// Phase 2: Affiliates, CMS, Themes (F15-01 through F15-04)
app.use('/api', phase2Routes);
app.use('/r', phase2Routes.trackingRouter);

// Phase 4: Fraud & Trust Intelligence (F17-01 through F17-05)
app.use('/api', phase4Routes);

// Phase 3: Sportsbook Alpha (F16-01 through F16-05)
app.use('/api/v1', require('./routes/sportsbook'));
app.get('/.well-known/agent.json', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(require('./agent-manifest.json'));
});

// F12-C: Public Live Wins Ticker Endpoint
app.get('/api/live-wins', async (req, res) => {
  try {
    const { period = 'daily', limit = 20 } = req.query;
    const { data, error } = await supabaseService.client
      .from('platform_audit_logs')
      .select('id, actor_id, metadata, timestamp')
      .eq('action', 'wallet:credit')
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    // Map logs to ticker format
    const wins = (data || []).map(log => ({
      id: log.id,
      player_handle: log.actor_id.substring(0, 3) + '***' + log.actor_id.slice(-2),
      game_name: log.metadata?.request?.game_id || 'Lucky Slot',
      provider: 'NeoStrike',
      thumbnail_url: '',
      win_amount: log.metadata?.request?.amount || 0,
      currency: 'EUR',
      timestamp: log.timestamp
    }));

    res.json({ wins });
  } catch (err) {
    logger.error('Failed to fetch live wins', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch wins' });
  }
});

app.get('/', (req, res) => {
  res.send('iGaming Integration Platform Backend Running');
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Professional Error Handling
app.use((err, req, res, next) => {
  logger.error('Unhandled Exception', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ error: 'Internal Server Error' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

module.exports = app;
