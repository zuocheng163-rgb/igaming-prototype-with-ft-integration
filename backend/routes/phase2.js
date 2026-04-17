/**
 * Phase 2 Routes - Affiliates, CMS, and Themes (F15-01 through F15-04)
 *
 * F15-01: Affiliate Management
 * F15-02: CMS Pages & Translations
 * F15-03: Brand Themes
 */

const express = require('express');
const router = express.Router();
const supabaseService = require('../services/supabase');
const { logger } = require('../services/logger');
const { correlationMiddleware, authenticateRequest } = require('../middleware/auth');

router.use(correlationMiddleware);

// ============================================================
// F15-01: Affiliate Management
// ============================================================

// GET /api/operator/affiliates - list affiliates
router.get('/operator/affiliates', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliates')
      .select('*, affiliate_tiers(name, model)')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ affiliates: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/affiliates failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/affiliates - create affiliate
router.post('/operator/affiliates', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { name, contact_email, tier_id, status, revshare_pct, cpa_amount } = req.body;
  if (!name || !contact_email) {
    return res.status(400).json({ error: 'name and contact_email are required' });
  }
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliates')
      .insert({ brand_id: brandId, name, contact_email, tier_id, status: status || 'active', revshare_pct, cpa_amount })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ affiliate: data });
  } catch (err) {
    logger.error('[Phase2] POST /operator/affiliates failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/affiliates/:id - get single affiliate
router.get('/operator/affiliates/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliates')
      .select('*, affiliate_tiers(name, model)')
      .eq('id', id)
      .eq('brand_id', brandId)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Affiliate not found' });
    res.status(200).json({ affiliate: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/affiliates/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/affiliates/:id - update affiliate
router.put('/operator/affiliates/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { name, contact_email, tier_id, status, revshare_pct, cpa_amount } = req.body;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (contact_email !== undefined) updates.contact_email = contact_email;
    if (tier_id !== undefined) updates.tier_id = tier_id;
    if (status !== undefined) updates.status = status;
    if (revshare_pct !== undefined) updates.revshare_pct = revshare_pct;
    if (cpa_amount !== undefined) updates.cpa_amount = cpa_amount;

    const { data, error } = await supabaseService.supabase
      .from('affiliates')
      .update(updates)
      .eq('id', id)
      .eq('brand_id', brandId)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ affiliate: data });
  } catch (err) {
    logger.error('[Phase2] PUT /operator/affiliates/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/operator/affiliates/:id - delete affiliate
router.delete('/operator/affiliates/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    const { error } = await supabaseService.supabase
      .from('affiliates')
      .delete()
      .eq('id', id)
      .eq('brand_id', brandId);
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[Phase2] DELETE /operator/affiliates/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/affiliates/:id/links - list affiliate links
router.get('/operator/affiliates/:id/links', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliate_links')
      .select('*')
      .eq('affiliate_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ links: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/affiliates/:id/links failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/affiliates/:id/links - create affiliate link
router.post('/operator/affiliates/:id/links', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { label, utm_source, utm_campaign, utm_medium, country_whitelist, landing_path } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliate_links')
      .insert({
        affiliate_id: parseInt(id),
        label,
        utm_source,
        utm_campaign,
        utm_medium,
        country_whitelist: country_whitelist || [],
        landing_path: landing_path || '/'
      })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ link: data });
  } catch (err) {
    logger.error('[Phase2] POST /operator/affiliates/:id/links failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/affiliates/:id/conversions - list conversions for affiliate
router.get('/operator/affiliates/:id/conversions', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    // Join through clicks -> links -> affiliate
    const { data: links, error: linksErr } = await supabaseService.supabase
      .from('affiliate_links')
      .select('id')
      .eq('affiliate_id', id);
    if (linksErr) throw linksErr;

    if (!links || links.length === 0) {
      return res.status(200).json({ conversions: [] });
    }

    const linkIds = links.map(l => l.id);

    const { data: clicks, error: clicksErr } = await supabaseService.supabase
      .from('affiliate_clicks')
      .select('id')
      .in('link_id', linkIds);
    if (clicksErr) throw clicksErr;

    if (!clicks || clicks.length === 0) {
      return res.status(200).json({ conversions: [] });
    }

    const clickIds = clicks.map(c => c.id);

    const { data: conversions, error: convErr } = await supabaseService.supabase
      .from('affiliate_conversions')
      .select('*')
      .in('click_id', clickIds)
      .order('ts', { ascending: false });
    if (convErr) throw convErr;

    res.status(200).json({ conversions: conversions || [] });
  } catch (err) {
    logger.error('[Phase2] GET /operator/affiliates/:id/conversions failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/affiliates/payout-batches - list payout batches
router.get('/operator/affiliates/payout-batches', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    // Get affiliate IDs for this brand first
    const { data: affiliateIds, error: afErr } = await supabaseService.supabase
      .from('affiliates')
      .select('id')
      .eq('brand_id', brandId);
    if (afErr) throw afErr;

    const ids = (affiliateIds || []).map(a => a.id);
    if (ids.length === 0) return res.status(200).json({ batches: [] });

    const { data, error } = await supabaseService.supabase
      .from('affiliate_payout_batches')
      .select('*, affiliates(name)')
      .in('affiliate_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ batches: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/affiliates/payout-batches failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/affiliates/payout-batches - create payout batch
router.post('/operator/affiliates/payout-batches', authenticateRequest, async (req, res) => {
  const { affiliate_id, period_start, period_end, total_amount } = req.body;
  if (!affiliate_id || !period_start || !period_end) {
    return res.status(400).json({ error: 'affiliate_id, period_start, and period_end are required' });
  }
  try {
    const { data, error } = await supabaseService.supabase
      .from('affiliate_payout_batches')
      .insert({ affiliate_id, period_start, period_end, total_amount: total_amount || 0, status: 'pending' })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ batch: data });
  } catch (err) {
    logger.error('[Phase2] POST /operator/affiliates/payout-batches failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/affiliates/payout-batches/:batchId - update payout batch (approve/reject/pay)
router.put('/operator/affiliates/payout-batches/:batchId', authenticateRequest, async (req, res) => {
  const { batchId } = req.params;
  const { status } = req.body;
  const approver_operator_id = req.user?.username || req.user?.id || 'unknown';
  if (!status || !['pending', 'approved', 'paid', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be one of: pending, approved, paid, rejected' });
  }
  try {
    const updates = { status, approver_operator_id };
    if (status === 'paid') updates.paid_at = new Date().toISOString();

    const { data, error } = await supabaseService.supabase
      .from('affiliate_payout_batches')
      .update(updates)
      .eq('id', batchId)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ batch: data });
  } catch (err) {
    logger.error('[Phase2] PUT /operator/affiliates/payout-batches/:batchId failed', { error: err.message, batchId });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F15-02: CMS Pages
// ============================================================

// GET /api/operator/cms/pages - list CMS pages
router.get('/operator/cms/pages', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { status } = req.query;
  try {
    let query = supabaseService.supabase
      .from('content_pages')
      .select('*')
      .eq('brand_id', brandId)
      .order('updated_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.status(200).json({ pages: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/cms/pages failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/cms/pages - create CMS page
router.post('/operator/cms/pages', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { slug, default_locale, status, seo_title, seo_description, og_image, schema_json } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  try {
    const { data, error } = await supabaseService.supabase
      .from('content_pages')
      .insert({
        brand_id: brandId,
        slug,
        default_locale: default_locale || 'en',
        status: status || 'draft',
        seo_title,
        seo_description,
        og_image,
        schema_json
      })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ page: data });
  } catch (err) {
    logger.error('[Phase2] POST /operator/cms/pages failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/cms/pages/:id - update CMS page
router.put('/operator/cms/pages/:id', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { slug, default_locale, status, seo_title, seo_description, og_image, schema_json } = req.body;
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (slug !== undefined) updates.slug = slug;
    if (default_locale !== undefined) updates.default_locale = default_locale;
    if (status !== undefined) updates.status = status;
    if (seo_title !== undefined) updates.seo_title = seo_title;
    if (seo_description !== undefined) updates.seo_description = seo_description;
    if (og_image !== undefined) updates.og_image = og_image;
    if (schema_json !== undefined) updates.schema_json = schema_json;

    const { data, error } = await supabaseService.supabase
      .from('content_pages')
      .update(updates)
      .eq('id', id)
      .eq('brand_id', brandId)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ page: data });
  } catch (err) {
    logger.error('[Phase2] PUT /operator/cms/pages/:id failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operator/cms/pages/:id/translations - list translations
router.get('/operator/cms/pages/:id/translations', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseService.supabase
      .from('content_page_translations')
      .select('*')
      .eq('page_id', id);
    if (error) throw error;
    res.status(200).json({ translations: data });
  } catch (err) {
    logger.error('[Phase2] GET /operator/cms/pages/:id/translations failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/operator/cms/pages/:id/translations - create/upsert translation
router.post('/operator/cms/pages/:id/translations', authenticateRequest, async (req, res) => {
  const { id } = req.params;
  const { locale, title, body_mdx } = req.body;
  const author_operator_id = req.user?.username || req.user?.id || 'unknown';
  if (!locale || !title) return res.status(400).json({ error: 'locale and title are required' });
  try {
    const { data, error } = await supabaseService.supabase
      .from('content_page_translations')
      .upsert({
        page_id: parseInt(id),
        locale,
        title,
        body_mdx: body_mdx || '',
        author_operator_id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'page_id,locale' })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ translation: data });
  } catch (err) {
    logger.error('[Phase2] POST /operator/cms/pages/:id/translations failed', { error: err.message, id });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/cms/pages/:id/translations/:locale - update specific translation
router.put('/operator/cms/pages/:id/translations/:locale', authenticateRequest, async (req, res) => {
  const { id, locale } = req.params;
  const { title, body_mdx } = req.body;
  const author_operator_id = req.user?.username || req.user?.id || 'unknown';
  try {
    const updates = { author_operator_id, updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (body_mdx !== undefined) updates.body_mdx = body_mdx;

    const { data, error } = await supabaseService.supabase
      .from('content_page_translations')
      .update(updates)
      .eq('page_id', id)
      .eq('locale', locale)
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ translation: data });
  } catch (err) {
    logger.error('[Phase2] PUT /operator/cms/pages/:id/translations/:locale failed', { error: err.message, id, locale });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/content/footer_pages - public endpoint for footer CMS pages
router.get('/v1/content/footer_pages', async (req, res) => {
  const brandId = parseInt(req.query.brand_id || req.headers['x-brand-id'] || '1');
  const locale = req.query.locale || 'en';
  try {
    const { data: pages, error } = await supabaseService.supabase
      .from('content_pages')
      .select('id, slug, seo_title, content_page_translations!inner(title, body_mdx, locale)')
      .eq('brand_id', brandId)
      .eq('status', 'published')
      .eq('content_page_translations.locale', locale);
    if (error) throw error;
    res.status(200).json({ pages: pages || [] });
  } catch (err) {
    logger.error('[Phase2] GET /v1/content/footer_pages failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// F15-03: Brand Themes
// ============================================================

// GET /api/operator/settings/theme - get brand theme
router.get('/operator/settings/theme', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  try {
    const { data, error } = await supabaseService.supabase
      .from('brand_themes')
      .select('*')
      .eq('brand_id', brandId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    // Return defaults if not configured yet
    const theme = data || {
      brand_id: brandId,
      preset_name: 'default',
      custom_tokens: {},
      logo_url: null,
      background_image_url: null
    };

    res.status(200).json({ theme });
  } catch (err) {
    logger.error('[Phase2] GET /operator/settings/theme failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/operator/settings/theme - upsert brand theme
router.put('/operator/settings/theme', authenticateRequest, async (req, res) => {
  const brandId = req.brandId || req.user?.brand_id || 1;
  const { preset_name, custom_tokens, logo_url, background_image_url } = req.body;
  try {
    const { data, error } = await supabaseService.supabase
      .from('brand_themes')
      .upsert({
        brand_id: brandId,
        preset_name: preset_name || 'default',
        custom_tokens: custom_tokens || {},
        logo_url,
        background_image_url,
        updated_at: new Date().toISOString()
      }, { onConflict: 'brand_id' })
      .select()
      .single();
    if (error) throw error;
    res.status(200).json({ theme: data });
  } catch (err) {
    logger.error('[Phase2] PUT /operator/settings/theme failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Affiliate tracking redirect router (mounted at /r)
// This router is exported separately and must be mounted at /r in server.js
// ============================================================

const trackingRouter = express.Router();
trackingRouter.use(correlationMiddleware);

trackingRouter.get('/:linkId', async (req, res) => {
  const { linkId } = req.params;
  try {
    // Look up the link
    const { data: link, error } = await supabaseService.supabase
      .from('affiliate_links')
      .select('*')
      .eq('id', linkId)
      .single();

    if (error || !link) {
      return res.redirect('/'); // Fallback redirect for invalid links
    }

    // Record the click (fire-and-forget)
    supabaseService.supabase
      .from('affiliate_clicks')
      .insert({
        link_id: linkId,
        ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
        user_agent: req.headers['user-agent'] || null,
        referrer: req.headers['referer'] || null
      })
      .then(() => {})
      .catch(e => logger.error('[Phase2] Click recording failed', { error: e.message, linkId }));

    // Build redirect URL with UTM params
    const landingPath = link.landing_path || '/';
    const params = new URLSearchParams();
    if (link.utm_source) params.set('utm_source', link.utm_source);
    if (link.utm_campaign) params.set('utm_campaign', link.utm_campaign);
    if (link.utm_medium) params.set('utm_medium', link.utm_medium);
    params.set('aff', linkId);

    const qs = params.toString();
    const destination = qs ? `${landingPath}?${qs}` : landingPath;
    res.redirect(302, destination);
  } catch (err) {
    logger.error('[Phase2] Tracking redirect failed', { error: err.message, linkId });
    res.redirect('/');
  }
});

router.trackingRouter = trackingRouter;

module.exports = router;
