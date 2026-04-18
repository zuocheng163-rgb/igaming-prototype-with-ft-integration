/**
 * Phase 4 Routes - Fraud & Trust Intelligence (F17-01 through F17-05)
 *
 * F17-01: Fraud Signals
 * F17-02: Collusion Graph
 * F17-03: ATO Alerts
 * F17-04: Bonus Abuse Patterns
 * F17-05: Player Trust Timeline
 */

const express = require('express');
const router = express.Router();
const supabaseService = require('../services/supabase');
const { logger } = require('../services/logger');
const { correlationMiddleware, authenticateRequest } = require('../middleware/auth');

router.use(correlationMiddleware);

// ============================================================
// Mock seed data — returned when fraud_signals table is empty
// ============================================================
const now = new Date();
const h = (hrs) => new Date(now - hrs * 3600000).toISOString();

const MOCK_FRAUD_SIGNALS = [
  { id: 'mock-1', brand_id: 1, player_id: 'test03', category: 'ato', severity: 'critical', status: 'open', created_at: h(1), updated_at: h(1), payload: { reason: 'Login from new country immediately after password reset', ip_address: '185.234.12.55', country: 'UA', new_device: true, failed_attempts: 9 } },
  { id: 'mock-2', brand_id: 1, player_id: 'highroller88', category: 'ato', severity: 'high', status: 'open', created_at: h(3), updated_at: h(3), payload: { reason: 'Multiple failed logins followed by access from new IP', ip_address: '92.45.11.200', country: 'RU', new_device: true, failed_attempts: 6 } },
  { id: 'mock-3', brand_id: 1, player_id: 'lucky_spin', category: 'ato', severity: 'high', status: 'acknowledged', created_at: h(8), updated_at: h(6), payload: { reason: 'Session cookie reuse from different IP block', ip_address: '103.21.55.4', country: 'CN', session_anomaly: true } },
  { id: 'mock-4', brand_id: 1, player_id: 'test03', category: 'bonus_abuse', severity: 'high', status: 'open', created_at: h(2), updated_at: h(2), payload: { reason: 'Immediate cashout after bonus wagering requirement met', pattern_type: 'Clear & Withdraw', bonus_codes: ['WELCOME100'], claimed_amount: 450, wagered_amount: 1000, withdrawal_attempts: 3 } },
  { id: 'mock-5', brand_id: 1, player_id: 'casinoking', category: 'bonus_abuse', severity: 'medium', status: 'open', created_at: h(5), updated_at: h(5), payload: { reason: 'Low-RTP game selection to meet wagering with minimal risk', pattern_type: 'Low-contrib farming', bonus_codes: ['RELOAD50'], claimed_amount: 200, wagered_amount: 1200 } },
  { id: 'mock-6', brand_id: 1, player_id: 'nightowl99', category: 'bonus_abuse', severity: 'medium', status: 'open', created_at: h(10), updated_at: h(10), payload: { reason: 'Suspected multi-account bonus claiming', pattern_type: 'Multi-account', bonus_codes: ['FREE20', 'WELCOME100'], claimed_amount: 160 } },
  { id: 'mock-7', brand_id: 1, player_id: 'PLR102', category: 'velocity', severity: 'high', status: 'open', created_at: h(4), updated_at: h(4), payload: { reason: '12 deposits in under 2 hours totalling €4,800', deposit_count: 12, total_amount: 4800, window_minutes: 110 } },
  { id: 'mock-8', brand_id: 1, player_id: 'PLR103', category: 'kyc_anomaly', severity: 'medium', status: 'open', created_at: h(12), updated_at: h(12), payload: { reason: 'Document submitted appears digitally altered', document_type: 'Passport', confidence_score: 0.38 } },
];

// ============================================================
// F17-01: Fraud Signals
// ============================================================

// GET /api/operator/fraud/signals - list fraud signals
router.get('/operator/fraud/signals', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { status, category, severity, player_id, limit = 50, offset = 0 } = req.query;
  try {
    let query = supabaseService.supabase
      .from('fraud_signals')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (severity) query = query.eq('severity', severity);
    if (player_id) query = query.eq('player_id', player_id);

    const { data, error } = await query;
    if (error) throw error;

    // Fall back to mock data when table is empty (demo/dev mode)
    let signals = (data && data.length > 0) ? data : MOCK_FRAUD_SIGNALS;

    // Apply in-memory filters on mock data
    if (data && data.length === 0) {
      if (status) signals = signals.filter(s => s.status === status);
      if (category) signals = signals.filter(s => s.category === category);
      if (severity) signals = signals.filter(s => s.severity === severity);
      if (player_id) signals = signals.filter(s => s.player_id === player_id);
    }

    // KPI strip aggregation
    const kpi = {
      total: signals.length,
      open: signals.filter(s => s.status === 'open').length,
      critical: signals.filter(s => s.severity === 'critical').length,
      high: signals.filter(s => s.severity === 'high').length
    };

    res.status(200).json({ signals, kpi });
  } catch (err) {
    logger.error('[Phase4] GET /operator/fraud/signals failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/fraud/signals - create fraud signal
router.post('/operator/fraud/signals', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { player_id, category, severity, payload } = req.body;
  if (!category) return res.status(400).json({ error: 'category is required' });

  const validCategories = ['velocity', 'ato', 'collusion', 'bonus_abuse', 'kyc_anomaly', 'payment_fraud'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
  }

  try {
    const { data, error } = await supabaseService.supabase
      .from('fraud_signals')
      .insert({
        brand_id: brandId,
        player_id,
        category,
        severity: severity || 'medium',
        payload: payload || {},
        status: 'open'
      })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ signal: data });
  } catch (err) {
    logger.error('[Phase4] POST /operator/fraud/signals failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/fraud/signals/:id - update signal (acknowledge, assign, escalate, suppress)
router.put('/operator/fraud/signals/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { status, assigned_to, suppression_rule, severity } = req.body;

  const validStatuses = ['open', 'acknowledged', 'escalated', 'suppressed', 'resolved'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const updates = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (suppression_rule !== undefined) updates.suppression_rule = suppression_rule;
    if (severity !== undefined) updates.severity = severity;

    const { data, error } = await supabaseService.supabase
      .from('fraud_signals')
      .update(updates)
      .eq('id', id)
      .eq('brand_id', brandId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Signal not found' });
    res.status(200).json({ signal: data });
  } catch (err) {
    logger.error('[Phase4] PUT /operator/fraud/signals/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F17-02: Collusion Graph
// ============================================================

// GET /api/operator/fraud/collusion-graph - return nodes and edges from shared attributes
router.get('/operator/fraud/collusion-graph', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { player_id, depth = 2 } = req.query;
  try {
    // Query collusion signals grouped by shared device/IP attributes in payload
    const { data: signals, error } = await supabaseService.supabase
      .from('fraud_signals')
      .select('player_id, payload, created_at')
      .eq('brand_id', brandId)
      .eq('category', 'collusion')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Build adjacency graph from shared payload attributes
    const playerSet = new Set();
    const edges = [];
    const edgeSet = new Set();

    (signals || []).forEach(signal => {
      if (!signal.player_id) return;
      playerSet.add(signal.player_id);

      // Extract shared identifiers from payload
      const sharedWith = signal.payload?.shared_with || [];
      const sharedAttr = signal.payload?.shared_attribute || 'unknown';

      sharedWith.forEach(peerId => {
        playerSet.add(peerId);
        const edgeKey = [signal.player_id, peerId].sort().join('::');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            source: signal.player_id,
            target: peerId,
            attribute: sharedAttr,
            weight: 1
          });
        } else {
          // Increment weight for repeated connections
          const existingEdge = edges.find(e => {
            const k = [e.source, e.target].sort().join('::');
            return k === edgeKey;
          });
          if (existingEdge) existingEdge.weight += 1;
        }
      });
    });

    // If filtering by specific player, prune to N-depth neighborhood
    let filteredNodes = Array.from(playerSet);
    let filteredEdges = edges;

    if (player_id) {
      const depthLimit = Math.min(parseInt(depth), 3);
      const visited = new Set([player_id]);
      let frontier = new Set([player_id]);

      for (let d = 0; d < depthLimit; d++) {
        const nextFrontier = new Set();
        edges.forEach(e => {
          if (frontier.has(e.source) && !visited.has(e.target)) {
            visited.add(e.target);
            nextFrontier.add(e.target);
          }
          if (frontier.has(e.target) && !visited.has(e.source)) {
            visited.add(e.source);
            nextFrontier.add(e.source);
          }
        });
        frontier = nextFrontier;
      }

      filteredNodes = Array.from(visited);
      filteredEdges = edges.filter(e => visited.has(e.source) && visited.has(e.target));
    }

    const nodes = filteredNodes.map(pid => ({
      id: pid,
      label: pid,
      is_focus: pid === player_id,
      signal_count: (signals || []).filter(s => s.player_id === pid).length
    }));

    res.status(200).json({
      nodes,
      edges: filteredEdges,
      meta: {
        total_nodes: nodes.length,
        total_edges: filteredEdges.length,
        depth: parseInt(depth)
      }
    });
  } catch (err) {
    logger.error('[Phase4] GET /operator/fraud/collusion-graph failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F17-03: ATO Alerts
// ============================================================

// GET /api/operator/fraud/ato-alerts - ATO specific alerts with KPI strip
router.get('/operator/fraud/ato-alerts', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { status, limit = 50, offset = 0 } = req.query;
  try {
    let query = supabaseService.supabase
      .from('fraud_signals')
      .select('*')
      .eq('brand_id', brandId)
      .eq('category', 'ato')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // Fall back to mock ATO signals when table is empty
    let alerts = (data && data.length > 0) ? data
      : MOCK_FRAUD_SIGNALS.filter(s => s.category === 'ato');
    if (status) alerts = alerts.filter(a => a.status === status);

    // KPI strip
    const kpi = {
      total: alerts.length,
      open: alerts.filter(a => a.status === 'open').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      escalated: alerts.filter(a => a.status === 'escalated').length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      resolved_last_24h: alerts.filter(a => {
        if (a.status !== 'resolved') return false;
        const updatedAt = new Date(a.updated_at);
        return (Date.now() - updatedAt.getTime()) < 24 * 60 * 60 * 1000;
      }).length
    };

    res.status(200).json({ alerts, kpi });
  } catch (err) {
    logger.error('[Phase4] GET /operator/fraud/ato-alerts failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F17-04: Bonus Abuse Patterns
// ============================================================

// GET /api/operator/fraud/bonus-abuse - bonus abuse patterns
router.get('/operator/fraud/bonus-abuse', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { limit = 50, offset = 0 } = req.query;
  try {
    const { data: signals, error } = await supabaseService.supabase
      .from('fraud_signals')
      .select('*')
      .eq('brand_id', brandId)
      .eq('category', 'bonus_abuse')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    // Fall back to mock bonus_abuse signals when table is empty
    const rawSignals = (signals && signals.length > 0) ? signals
      : MOCK_FRAUD_SIGNALS.filter(s => s.category === 'bonus_abuse');

    const toPattern = (signal) => ({
      id: signal.id,
      player_id: signal.player_id,
      severity: signal.severity,
      status: signal.status,
      // 'pattern' is what BonusAbusePanel renders; fallback chain covers all payload shapes
      pattern: signal.payload?.pattern_type || signal.payload?.pattern || signal.payload?.reason || 'Unknown Pattern',
      amount: signal.payload?.claimed_amount || signal.payload?.amount || 0,
      bonus_codes: signal.payload?.bonus_codes || [],
      claimed_amount: signal.payload?.claimed_amount || 0,
      wagered_amount: signal.payload?.wagered_amount || 0,
      withdrawal_attempts: signal.payload?.withdrawal_attempts || 0,
      created_at: signal.created_at,
      updated_at: signal.updated_at
    });

    const patterns = rawSignals.map(toPattern);

    // Burn-rate chart: 30-day mock aggregation bucketed by week
    const burn_rate = (() => {
      const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      return weeks.map((w, i) => ({
        date: w,
        WELCOME100: Math.round(800 + Math.random() * 400 - i * 50),
        RELOAD50:   Math.round(300 + Math.random() * 200 - i * 20),
        FREE20:     Math.round(150 + Math.random() * 100),
      }));
    })();

    // Top burning campaigns
    const top_campaigns = [
      { campaign_id: 'WELCOME100', campaign_name: 'Welcome 100%', player_count: 438, total_cost: 43800, ggr_ratio: 0.21 },
      { campaign_id: 'FREE20',     campaign_name: 'Free €20 No Deposit', player_count: 930, total_cost: 18600, ggr_ratio: 0.08 },
      { campaign_id: 'RELOAD50',   campaign_name: 'Weekend Reload 50%', player_count: 187, total_cost: 9350, ggr_ratio: 0.34 },
      { campaign_id: 'SPORTS10',   campaign_name: 'Sports Risk-Free €10', player_count: 295, total_cost: 2950, ggr_ratio: 0.45 },
    ];

    const kpi = {
      total: patterns.length,
      open: rawSignals.filter(s => s.status === 'open').length,
      estimated_exposure: patterns.reduce((sum, p) => sum + (p.claimed_amount || 0), 0)
    };

    res.status(200).json({ patterns, burn_rate, top_campaigns, kpi });
  } catch (err) {
    logger.error('[Phase4] GET /operator/fraud/bonus-abuse failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F17-05: Player Trust Timeline
// ============================================================

// GET /api/operator/players/:id/trust-timeline - player trust score over time
router.get('/operator/players/:id/trust-timeline', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    // Pull all fraud signals for this player, ordered chronologically
    const { data: signals, error: sigErr } = await supabaseService.supabase
      .from('fraud_signals')
      .select('id, category, severity, status, created_at, updated_at, payload')
      .eq('player_id', id)
      .eq('brand_id', brandId)
      .order('created_at', { ascending: true });

    if (sigErr) throw sigErr;

    // Severity score weights
    const severityWeights = { low: -5, medium: -15, high: -30, critical: -50 };
    const statusRecovery = { resolved: 20, suppressed: 5 };

    // Build timeline events from signals
    let score = 100;
    const timeline = [];

    (signals || []).forEach(signal => {
      const delta = severityWeights[signal.severity] || -10;
      score = Math.max(0, Math.min(100, score + delta));

      timeline.push({
        ts: signal.created_at,
        event_type: 'signal_raised',
        category: signal.category,
        severity: signal.severity,
        delta,
        score_after: score,
        signal_id: signal.id
      });

      if (signal.status === 'resolved' || signal.status === 'suppressed') {
        const recovery = statusRecovery[signal.status] || 0;
        score = Math.max(0, Math.min(100, score + recovery));
        timeline.push({
          ts: signal.updated_at,
          event_type: 'signal_' + signal.status,
          category: signal.category,
          severity: signal.severity,
          delta: recovery,
          score_after: score,
          signal_id: signal.id
        });
      }
    });

    // Sort timeline by timestamp
    timeline.sort((a, b) => new Date(a.ts) - new Date(b.ts));

    // Recalculate final score after sort
    let finalScore = 100;
    timeline.forEach(event => {
      finalScore = Math.max(0, Math.min(100, finalScore + event.delta));
      event.score_after = finalScore;
    });

    const trustBand = finalScore >= 80 ? 'high'
      : finalScore >= 50 ? 'medium'
      : finalScore >= 25 ? 'low'
      : 'critical';

    res.status(200).json({
      player_id: id,
      current_score: finalScore,
      trust_band: trustBand,
      signal_count: (signals || []).length,
      open_signals: (signals || []).filter(s => s.status === 'open').length,
      timeline
    });
  } catch (err) {
    logger.error('[Phase4] GET /operator/players/:id/trust-timeline failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Operator Event Stream - SSE for AFA Real-time Monitor
// ============================================================

const operatorEvents = require('../services/operator-events');

// GET /api/operator/events/stream - operator-auth SSE stream (no agent JWT needed)
router.get('/operator/events/stream', authenticateRequest, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const brandId = req.brandId || req.user?.brand_id || 1;

  // Send initial connected event
  try { res.write(`data: ${JSON.stringify({ type: 'connected', brand_id: brandId })}\n\n`); } catch (_) {}

  // Heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 25000);

  const handler = (event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch (_) {}
  };

  operatorEvents.on(`brand:${brandId}`, handler);

  req.on('close', () => {
    clearInterval(heartbeat);
    operatorEvents.off(`brand:${brandId}`, handler);
  });
});

// ============================================================
// Fraud Signal Simulation (dev/demo helper)
// ============================================================

// POST /api/operator/fraud/simulate - insert sample ATO + bonus_abuse signals
router.post('/operator/fraud/simulate', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { player_id = 'test03' } = req.body;

  const now = new Date().toISOString();
  const signals = [
    {
      brand_id: brandId,
      player_id,
      category: 'ato',
      severity: 'high',
      status: 'open',
      payload: {
        reason: 'Multiple failed login attempts followed by successful login from new IP',
        ip_address: '192.168.99.' + Math.floor(Math.random() * 254 + 1),
        failed_attempts: 7,
        new_device: true,
        country_mismatch: true,
      },
      created_at: now,
    },
    {
      brand_id: brandId,
      player_id,
      category: 'ato',
      severity: 'critical',
      status: 'open',
      payload: {
        reason: 'Password reset requested from unrecognised device immediately after account access',
        ip_address: '10.0.' + Math.floor(Math.random() * 254 + 1) + '.55',
        device_fingerprint_mismatch: true,
        session_anomaly: true,
      },
      created_at: now,
    },
    {
      brand_id: brandId,
      player_id,
      category: 'bonus_abuse',
      severity: 'high',
      status: 'open',
      payload: {
        reason: 'Wagering pattern consistent with bonus hunting — minimum bets on high-RTP games',
        bonus_code: 'WELCOME100',
        wager_velocity: 'low_variance',
        game_rtp_avg: 0.9875,
        suspected_multi_account: false,
      },
      created_at: now,
    },
    {
      brand_id: brandId,
      player_id,
      category: 'bonus_abuse',
      severity: 'medium',
      status: 'open',
      payload: {
        reason: 'Cashout immediately after bonus wagering requirement met — 3 occurrences',
        bonus_ids: ['9821', '9834', '9850'],
        pattern: 'immediate_cashout_post_wager',
        occurrences: 3,
      },
      created_at: now,
    },
  ];

  try {
    const { data, error } = await supabaseService.supabase
      .from('fraud_signals')
      .insert(signals)
      .select();

    if (error) throw error;

    // Emit to operator event bus so AFA Monitor updates in real-time
    for (const signal of data || []) {
      operatorEvents.emit(`brand:${brandId}`, {
        event_type: `fraud_signal_${signal.category}`,
        data: signal,
        brand_id: brandId,
        occurred_at: signal.created_at,
      });
    }

    logger.info('[Phase4] Fraud simulation inserted', { player_id, count: (data || []).length });
    res.status(201).json({ inserted: (data || []).length, signals: data });
  } catch (err) {
    logger.error('[Phase4] POST /operator/fraud/simulate failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
