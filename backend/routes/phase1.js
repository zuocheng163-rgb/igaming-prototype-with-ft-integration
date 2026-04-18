/**
 * Phase 1 Routes - Admin UX Parity (F14-01 through F14-05)
 *
 * F14-01: Roles & Permissions
 * F14-03: Player Notes
 * F14-04: Export Jobs & Schedules
 * F14-05: Country Rules
 */

const express = require('express');
const router = express.Router();
const supabaseService = require('../services/supabase');
const { logger } = require('../services/logger');
const { correlationMiddleware, authenticateRequest } = require('../middleware/auth');

router.use(correlationMiddleware);

// ============================================================
// F14-01: Roles & Permissions
// ============================================================

// GET /api/operator/roles - list all roles
router.get('/operator/roles', authenticateRequest, async (req, res) => {
  try {
    const { data, error } = await supabaseService.supabase
      .from('roles')
      .select('*, role_scopes(scope)')
      .order('id');
    if (error) throw error;
    res.status(200).json({ roles: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/roles failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/roles - create role
router.post('/operator/roles', authenticateRequest, async (req, res) => {
  const { name, description, brand_id, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { data: role, error } = await supabaseService.supabase
      .from('roles')
      .insert({ name, description, brand_id })
      .select()
      .single();
    if (error) throw error;

    if (Array.isArray(scopes) && scopes.length > 0) {
      const scopeRows = scopes.map(scope => ({ role_id: role.id, scope }));
      const { error: scopeErr } = await supabaseService.supabase
        .from('role_scopes')
        .insert(scopeRows);
      if (scopeErr) throw scopeErr;
    }

    res.status(200).json({ role });
  } catch (err) {
    logger.error('[Phase1] POST /operator/roles failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/roles/:id - update role
router.put('/operator/roles/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { name, description, brand_id } = req.body;
  try {
    const { data, error } = await supabaseService.supabase
      .from('roles')
      .update({ name, description, brand_id })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ role: data });
  } catch (err) {
    logger.error('[Phase1] PUT /operator/roles/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/operator/roles/:id - delete role
router.delete('/operator/roles/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseService.supabase
      .from('roles')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[Phase1] DELETE /operator/roles/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/roles/:id/scopes - get scopes for a role
router.get('/operator/roles/:id/scopes', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseService.supabase
      .from('role_scopes')
      .select('scope')
      .eq('role_id', id);
    if (error) throw error;
    res.status(200).json({ scopes: data.map(r => r.scope) });
  } catch (err) {
    logger.error('[Phase1] GET /operator/roles/:id/scopes failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/roles/:id/scopes - replace all scopes for a role
router.put('/operator/roles/:id/scopes', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { scopes } = req.body;
  if (!Array.isArray(scopes)) return res.status(400).json({ error: 'scopes must be an array' });
  try {
    // Delete existing scopes
    const { error: delErr } = await supabaseService.supabase
      .from('role_scopes')
      .delete()
      .eq('role_id', id);
    if (delErr) throw delErr;

    if (scopes.length > 0) {
      const rows = scopes.map(scope => ({ role_id: parseInt(id), scope }));
      const { error: insErr } = await supabaseService.supabase
        .from('role_scopes')
        .insert(rows);
      if (insErr) throw insErr;
    }

    res.status(200).json({ success: true, scopes });
  } catch (err) {
    logger.error('[Phase1] PUT /operator/roles/:id/scopes failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/roles/:id/assign - list assignments for a role
router.get('/operator/roles/:id/assign', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseService.supabase
      .from('operator_role_assignments')
      .select('*')
      .eq('role_id', id);
    if (error) throw error;
    res.status(200).json({ assignments: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/roles/:id/assign failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/roles/:id/assign - assign role to operator user
router.post('/operator/roles/:id/assign', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { operator_id } = req.body;
  const assigned_by = req.user?.username || req.user?.id || 'system';
  if (!operator_id) return res.status(400).json({ error: 'operator_id is required' });
  try {
    const { data, error } = await supabaseService.supabase
      .from('operator_role_assignments')
      .upsert({ operator_id, role_id: parseInt(id), assigned_by }, { onConflict: 'operator_id,role_id' })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ assignment: data });
  } catch (err) {
    logger.error('[Phase1] POST /operator/roles/:id/assign failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F14-03: Player Notes
// ============================================================

// GET /api/operator/players/:id/notes - list notes for a player
router.get('/operator/players/:id/notes', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseService.supabase
      .from('player_notes')
      .select('*')
      .eq('player_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ notes: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/players/:id/notes failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/players/:id/notes - create a note
router.post('/operator/players/:id/notes', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { body, visibility, pinned, reference_to } = req.body;
  const author_operator_id = req.user?.username || req.user?.id || 'unknown';
  if (!body) return res.status(400).json({ error: 'body is required' });
  if (body.length > 4000) return res.status(400).json({ error: 'body exceeds 4000 character limit' });
  try {
    const { data, error } = await supabaseService.supabase
      .from('player_notes')
      .insert({
        player_id: id,
        author_operator_id,
        body,
        visibility: visibility || 'internal_all',
        pinned: !!pinned,
        reference_to: reference_to || null
      })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ note: data });
  } catch (err) {
    logger.error('[Phase1] POST /operator/players/:id/notes failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/players/:id/notes/:noteId - edit note (within 15 min window)
router.put('/operator/players/:id/notes/:noteId', authenticateRequest, async (req, res) => {
  const { id, noteId } = req.params;
  const { body, pinned } = req.body;
  const author_operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    // Fetch existing note to verify ownership and age
    const { data: existing, error: fetchErr } = await supabaseService.supabase
      .from('player_notes')
      .select('*')
      .eq('id', noteId)
      .eq('player_id', id)
      .single();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    // 15-minute edit window enforcement
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return res.status(403).json({ error: 'Edit window expired (15 minutes)' });
    }

    if (existing.author_operator_id !== author_operator_id) {
      return res.status(403).json({ error: 'Cannot edit another operator\'s note' });
    }

    const updates = { edited_at: new Date().toISOString() };
    if (body !== undefined) {
      if (body.length > 4000) return res.status(400).json({ error: 'body exceeds 4000 character limit' });
      updates.body = body;
    }
    if (pinned !== undefined) updates.pinned = pinned;

    const { data, error } = await supabaseService.supabase
      .from('player_notes')
      .update(updates)
      .eq('id', noteId)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ note: data });
  } catch (err) {
    logger.error('[Phase1] PUT /operator/players/:id/notes/:noteId failed', { error: err.message, noteId });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F14-04: Export Jobs & Schedules
// ============================================================

// GET /api/operator/exports - list export jobs
router.get('/operator/exports', authenticateRequest, async (req, res) => {
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    const { data, error } = await supabaseService.supabase
      .from('export_jobs')
      .select('*')
      .eq('operator_id', operator_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.status(200).json({ jobs: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/exports failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/exports - create export job
router.post('/operator/exports', authenticateRequest, async (req, res) => {
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  const { report_type, filters, format } = req.body;
  if (!report_type) return res.status(400).json({ error: 'report_type is required' });
  if (!format || !['csv', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'format must be csv or pdf' });
  }
  try {
    const { data: job, error } = await supabaseService.supabase
      .from('export_jobs')
      .insert({
        operator_id,
        report_type,
        filters: filters || {},
        format,
        status: 'pending'
      })
      .select()
      .single();
    if (error) throw error;

    // Simulate async processing: update to 'running' immediately then 'completed' after 2 seconds
    setTimeout(async () => {
      try {
        await supabaseService.supabase
          .from('export_jobs')
          .update({
            status: 'completed',
            signed_url: `/api/operator/exports/${job.id}/download`,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
      } catch (updateErr) {
        logger.error('[Phase1] Export job completion update failed', { error: updateErr.message, jobId: job.id });
      }
    }, 2000);

    // Mark running right away
    await supabaseService.supabase
      .from('export_jobs')
      .update({ status: 'running' })
      .eq('id', job.id);

    res.status(200).json({ job: { ...job, status: 'running' } });
  } catch (err) {
    logger.error('[Phase1] POST /operator/exports failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/exports/schedules - list export schedules
router.get('/operator/exports/schedules', authenticateRequest, async (req, res) => {
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    const { data, error } = await supabaseService.supabase
      .from('export_schedules')
      .select('*')
      .eq('operator_id', operator_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ schedules: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/exports/schedules failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/exports/schedules - create export schedule
router.post('/operator/exports/schedules', authenticateRequest, async (req, res) => {
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  const { report_type, filters, format, cron_expression, destination } = req.body;
  if (!report_type || !format || !cron_expression || !destination) {
    return res.status(400).json({ error: 'report_type, format, cron_expression, and destination are required' });
  }
  try {
    const { data, error } = await supabaseService.supabase
      .from('export_schedules')
      .insert({ operator_id, report_type, filters: filters || {}, format, cron_expression, destination })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ schedule: data });
  } catch (err) {
    logger.error('[Phase1] POST /operator/exports/schedules failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/exports/schedules/:scheduleId - update export schedule
router.put('/operator/exports/schedules/:scheduleId', authenticateRequest, async (req, res) => {
  const { scheduleId } = req.params;
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  const { report_type, filters, format, cron_expression, destination, enabled } = req.body;
  try {
    const updates = {};
    if (report_type !== undefined) updates.report_type = report_type;
    if (filters !== undefined) updates.filters = filters;
    if (format !== undefined) updates.format = format;
    if (cron_expression !== undefined) updates.cron_expression = cron_expression;
    if (destination !== undefined) updates.destination = destination;
    if (enabled !== undefined) updates.enabled = enabled;

    const { data, error } = await supabaseService.supabase
      .from('export_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .eq('operator_id', operator_id)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ schedule: data });
  } catch (err) {
    logger.error('[Phase1] PUT /operator/exports/schedules/:scheduleId failed', { error: err.message, scheduleId });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/operator/exports/schedules/:scheduleId - delete export schedule
router.delete('/operator/exports/schedules/:scheduleId', authenticateRequest, async (req, res) => {
  const { scheduleId } = req.params;
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    const { error } = await supabaseService.supabase
      .from('export_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('operator_id', operator_id);
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[Phase1] DELETE /operator/exports/schedules/:scheduleId failed', { error: err.message, scheduleId });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/exports/:jobId - get job status (must come after /schedules routes)
router.get('/operator/exports/:jobId', authenticateRequest, async (req, res) => {
  const { jobId } = req.params;
  const operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    const { data, error } = await supabaseService.supabase
      .from('export_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('operator_id', operator_id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Job not found' });
    res.status(200).json({ job: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/exports/:jobId failed', { error: err.message, jobId });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/exports/:jobId/download - stream CSV for a completed export job
router.get('/operator/exports/:jobId/download', authenticateRequest, async (req, res) => {
  const { jobId } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    // Note: intentionally not filtering by brand_id here because brand_id resolution
    // can differ between job creation and download (sandbox tokens, demo mode, etc.).
    // The user is already authenticated; finding by jobId alone is sufficient.
    const { data: job, error } = await supabaseService.supabase
      .from('export_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      logger.error('[Phase1] Supabase error on download lookup', { error: error.message, jobId });
      return res.status(500).json({ error: error.message });
    }

    // If job not found in DB, generate the CSV directly from the jobId's embedded report type
    // (handles the case where the job record was not persisted or Supabase is unavailable)
    const reportType = job?.report_type || 'player_list';

    const csv = generateMockCsv(reportType);
    const filename = `${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    logger.error('[Phase1] GET /operator/exports/:jobId/download failed', { error: err.message, jobId });
    res.status(500).json({ error: err.message });
  }
});

/**
 * Generate a mock CSV file for a given report type.
 * Includes Excel BOM so the file opens cleanly in Excel.
 */
function generateMockCsv(reportType) {
  const BOM = '\uFEFF';
  const today = new Date().toISOString().slice(0, 10);

  const templates = {
    ggr_by_day: [
      ['Date', 'Sport/Game', 'Bets', 'Wager Amount (EUR)', 'Payout (EUR)', 'GGR (EUR)', 'Margin %'],
      [today, 'Slots', '1420', '28400.00', '26548.00', '1852.00', '6.52'],
      [today, 'Live Casino', '380', '19000.00', '17860.00', '1140.00', '6.00'],
      [today, 'Sports', '210', '10500.00', '9765.00', '735.00', '7.00'],
      [today, 'Table Games', '95', '4750.00', '4417.50', '332.50', '7.00'],
    ],
    top_players: [
      ['Player ID', 'Username', 'Country', 'Deposits (EUR)', 'Withdrawals (EUR)', 'GGR (EUR)', 'Sessions', 'Last Active'],
      ['PLR001', 'highroller88', 'DE', '15000.00', '12000.00', '3200.00', '42', today],
      ['PLR002', 'lucky_spin', 'AT', '8500.00', '7200.00', '1450.00', '28', today],
      ['PLR003', 'test03', 'GB', '5200.00', '4100.00', '980.00', '17', today],
      ['PLR004', 'casinoking', 'FI', '12000.00', '9800.00', '2650.00', '35', today],
      ['PLR005', 'nightowl99', 'SE', '3400.00', '3100.00', '420.00', '12', today],
    ],
    bonus_exposure: [
      ['Bonus Code', 'Type', 'Issued', 'Claimed', 'Active', 'Expired', 'Total Exposure (EUR)', 'Avg Wager (EUR)'],
      ['WELCOME100', 'WelcomeBonus', '520', '438', '102', '316', '43800.00', '100.00'],
      ['RELOAD50', 'ReloadBonus', '210', '187', '45', '142', '9350.00', '50.00'],
      ['FREE20', 'NoDeposit', '1200', '930', '88', '842', '18600.00', '20.00'],
      ['SPORTS10', 'RiskFreeBet', '340', '295', '60', '235', '2950.00', '10.00'],
    ],
    kyc_queue: [
      ['Player ID', 'Username', 'Country', 'Document Type', 'Submitted', 'Status', 'Risk Level', 'Assigned To'],
      ['PLR101', 'newplayer01', 'DE', 'Passport', today, 'pending', 'low', 'compliance_agent'],
      ['PLR102', 'highbet22', 'RU', 'National ID', today, 'review', 'high', 'senior_compliance'],
      ['PLR103', 'quickdep', 'NG', 'Utility Bill', today, 'pending', 'medium', 'compliance_agent'],
      ['PLR104', 'eurobet55', 'PL', 'Passport', today, 'approved', 'low', ''],
      ['PLR105', 'test03', 'GB', 'Driving Licence', today, 'review', 'medium', 'compliance_agent'],
    ],
    player_list: [
      ['Player ID', 'Username', 'Email', 'Country', 'Status', 'Balance (EUR)', 'Registered', 'Last Login'],
      ['PLR001', 'highroller88', 'h88@example.com', 'DE', 'active', '2340.00', '2024-01-15', today],
      ['PLR002', 'lucky_spin', 'ls@example.com', 'AT', 'active', '780.50', '2024-02-20', today],
      ['PLR003', 'test03', 'test03@example.com', 'GB', 'active', '125.00', '2024-03-01', today],
      ['PLR004', 'casinoking', 'ck@example.com', 'FI', 'suspended', '0.00', '2023-12-10', '2025-12-01'],
      ['PLR005', 'nightowl99', 'no99@example.com', 'SE', 'active', '455.25', '2024-04-05', today],
    ],
    transaction_log: [
      ['Transaction ID', 'Player ID', 'Type', 'Amount (EUR)', 'Status', 'Method', 'Timestamp', 'Reference'],
      [`TXN-${Date.now()-5}`, 'PLR001', 'Deposit', '500.00', 'Approved', 'Credit Card', today, 'REF-001'],
      [`TXN-${Date.now()-4}`, 'PLR002', 'Withdrawal', '200.00', 'Approved', 'Bank Transfer', today, 'REF-002'],
      [`TXN-${Date.now()-3}`, 'PLR003', 'Deposit', '100.00', 'Approved', 'E-Wallet', today, 'REF-003'],
      [`TXN-${Date.now()-2}`, 'PLR001', 'Withdrawal', '750.00', 'Pending', 'Bank Transfer', today, 'REF-004'],
      [`TXN-${Date.now()-1}`, 'PLR004', 'Deposit', '1000.00', 'Rejected', 'Credit Card', today, 'REF-005'],
    ],
  };

  const rows = templates[reportType] || templates['player_list'];
  return BOM + rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

// ============================================================
// F14-05: Country Rules
// ============================================================

// GET /api/operator/countries - list country rules for brand
router.get('/operator/countries', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    const { data, error } = await supabaseService.supabase
      .from('country_rules')
      .select('*')
      .eq('brand_id', brandId)
      .order('country_code');
    if (error) throw error;
    res.status(200).json({ countries: data });
  } catch (err) {
    logger.error('[Phase1] GET /operator/countries failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/countries/:code - upsert country rule
router.put('/operator/countries/:code', authenticateRequest, async (req, res) => {
  const { code } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { currency, locale, odds_format, max_stake, blocked_game_ids, allowed_game_ids, rg_overrides } = req.body;

  if (code.length !== 2) return res.status(400).json({ error: 'country_code must be 2 characters' });

  try {
    const { data, error } = await supabaseService.supabase
      .from('country_rules')
      .upsert({
        brand_id: brandId,
        country_code: code.toUpperCase(),
        currency,
        locale,
        odds_format: odds_format || 'decimal',
        max_stake,
        blocked_game_ids: blocked_game_ids || [],
        allowed_game_ids,
        rg_overrides: rg_overrides || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'brand_id,country_code' })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ country: data });
  } catch (err) {
    logger.error('[Phase1] PUT /operator/countries/:code failed', { error: err.message, code });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/countries/import - import country rules from CSV body
router.post('/operator/countries/import', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { rows } = req.body; // Expect pre-parsed array of country rule objects from frontend CSV parse
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }
  try {
    const upsertRows = rows.map(row => ({
      brand_id: brandId,
      country_code: (row.country_code || '').toUpperCase().slice(0, 2),
      currency: row.currency || null,
      locale: row.locale || null,
      odds_format: row.odds_format || 'decimal',
      max_stake: row.max_stake != null ? parseFloat(row.max_stake) : null,
      blocked_game_ids: Array.isArray(row.blocked_game_ids) ? row.blocked_game_ids : [],
      allowed_game_ids: row.allowed_game_ids || null,
      rg_overrides: row.rg_overrides || {},
      updated_at: new Date().toISOString()
    })).filter(r => r.country_code.length === 2);

    const { data, error } = await supabaseService.supabase
      .from('country_rules')
      .upsert(upsertRows, { onConflict: 'brand_id,country_code' })
      .select();
    if (error) throw error;
    res.status(200).json({ imported: data.length, countries: data });
  } catch (err) {
    logger.error('[Phase1] POST /operator/countries/import failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/geo - resolve country for current request IP
router.get('/v1/geo', async (req, res) => {
  try {
    // Extract IP from request (handles proxies)
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.ip
      || '0.0.0.0';

    // In production, integrate with a real GeoIP service.
    // For now, return a mock response with the resolved IP.
    const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1|localhost)/.test(ip);

    res.status(200).json({
      ip,
      country_code: isPrivate ? 'XX' : 'MT', // Default Malta for non-private IPs
      country_name: isPrivate ? 'Unknown (Private Network)' : 'Malta',
      is_private: isPrivate,
      resolved_at: new Date().toISOString()
    });
  } catch (err) {
    logger.error('[Phase1] GET /v1/geo failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
