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


// F13-AFA: Agent-Friendly API Layer
app.use('/api/v1/ops', require('./routes/afa'));
app.use('/api/v1/auth', require('./routes/afa-auth'));

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

    // Helper to format game_id (e.g. pragmatic:gates-of-olympus -> Gates Of Olympus, Pragmatic Play)
    const parseGameId = (gId) => {
      if (!gId || gId === 'Lucky Slot') return { provider: 'NeoStrike', name: 'Lucky Slot' };
      if (gId === 'neostrike-demo') return { provider: 'NeoStrike', name: 'NeoStrike Demo Slot' };
      
      let [prov, ...rest] = gId.split(':');
      let rawName = rest.join(':') || prov;
      if (!rest.length) {
        prov = "NeoStrike"; 
        rawName = gId;
      }
      
      let providerName = prov.charAt(0).toUpperCase() + prov.slice(1);
      if (prov === 'pragmatic') providerName = 'Pragmatic Play';
      if (prov === 'netent') providerName = 'NetEnt';
      if (prov === 'playngo') providerName = "Play'n GO";
      
      let gameName = rawName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { provider: providerName, name: gameName };
    };

    // Map logs to ticker format
    const wins = (data || []).map(log => {
      const parsed = parseGameId(log.metadata?.request?.game_id);
      return {
        id: log.id,
        player_handle: log.actor_id.substring(0, 3) + '***' + log.actor_id.slice(-2),
        game_name: parsed.name,
        provider: parsed.provider,
        thumbnail_url: '',
        win_amount: log.metadata?.request?.amount || 0,
        currency: 'EUR',
        timestamp: log.timestamp
      };
    });

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
