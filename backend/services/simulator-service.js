const InterventionService = require('./intervention');
const ftService = require('./ft-integration');
const supabaseService = require('./supabase');
const { client: supabase } = supabaseService;
const { generateCorrelationId, logger, auditLog } = require('./logger');
const afaEvents = require('./afa-events');
const crypto = require('crypto');

// In-memory store for sandbox activity (Velocity Spike tracking)
const sandboxLogs = [];
const sandboxBalances = new Map(); // Store balances keyed by user_id

/**
 * Emit an event directly to the AFA broadcast channel (sandbox bypass).
 * In production, events flow FT -> webhook -> AFA. In sandbox, FT never calls back,
 * so we short-circuit directly into the AFA event bus here.
 */
function emitAfaEvent(eventType, payload, brandId = 1) {
    try {
        const broadcastKey = `sse:agent:broadcast:${brandId}`;
        const envelope = {
            event_id: crypto.randomUUID(),
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            brand_id: brandId,
            data: payload,
        };
        const listenerCount = afaEvents.listenerCount(broadcastKey);
        if (listenerCount > 0) {
            afaEvents.emit(broadcastKey, envelope);
            logger.info(`[Simulator] AFA broadcast: ${eventType} -> ${broadcastKey} (${listenerCount} listeners)`, { eventType });
        }
    } catch (err) {
        logger.warn('[Simulator] Failed to emit AFA event', { error: err.message });
    }
}

/**
 * SimulatorService
 * Isolated home for all demo-specific logic and mock data.
 * This keeps the core production services (supabase.js, wallet-service.js) clean.
 */
class SimulatorService {

    /**
     * Mock User Data for Demo Mode (FT Compliant)
     */
    static getDemoUser(userIdOrUsername) {
        const username = userIdOrUsername || 'demo_user';
        return {
            // Database IDs
            id: '550e8400-e29b-41d4-a716-446655440000', // Example fixed UUID
            brand_id: 1,
            user_id: username,

            // Core Identity
            username: username,
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'demo@neostrike.io',
            title: 'Ms',
            sex: 'female',
            birth_date: '1992-05-15',

            // Financials
            balance: 1000,
            currency: 'EUR',

            // Localization & Contact
            language: 'en',
            country: 'MT',
            city: 'Sliema',
            address: 'Triq It-Torri 123',
            postal_code: 'SLM 1010',
            mobile: '79123456',
            mobile_prefix: '356',
            full_mobile_number: '35679123456',

            // Operational Metadata
            registration_date: '2026-01-01T12:00:00Z',
            verified_at: '2026-01-01T14:00:00Z',
            origin: 'Web/Direct',
            market: 'International',
            registration_code: 'FASTTRACK2026',
            affiliate_reference: 'AFF_001',
            is_blocked: false,
            is_excluded: false,
            is_enabled: true,
            roles: ['PLAYER']
        };
    }

    /**
     * Force sync the sandbox memory cache from the actual database.
     * Useful when demo features directly modify the database while sandbox is active.
     */
    static async syncBalanceFromDB(uid) {
        if (!uid) return;
        try {
            // In demo environments, user\_id and username are often identical.
            // But we use the robust getUserById to fetch the latest balance securely.
            const user = await supabase.from('users').select('balance, bonus_balance').eq('username', uid).single();
            if (user && user.data) {
                sandboxBalances.set(uid, {
                    amount: parseFloat(user.data.balance || 0),
                    bonus: parseFloat(user.data.bonus_balance || 0)
                });
                logger.info(`[Simulator] Synced sandbox balance for ${uid} from DB`);
            }
        } catch (err) {
            logger.error(`[Simulator] Failed to sync sandbox balance for ${uid}`, err);
        }
    }

    /**
     * Mock Consents (FT Compliant Array Format)
     */
    static getDemoConsents() {
        return [
            { type: 'email', opted_in: true },
            { type: 'sms', opted_in: true },
            { type: 'telephone', opted_in: false },
            { type: 'postMail', opted_in: false },
            { type: 'siteNotification', opted_in: true },
            { type: 'pushNotification', opted_in: true }
        ];
    }

    /**
     * Mock Blocks (FT Compliant Format)
     */
    static getDemoBlocks() {
        return {
            blocks: [
                {
                    active: false,
                    type: 'Blocked',
                    note: 'Account status'
                },
                {
                    active: false,
                    type: 'Excluded',
                    note: 'Self-exclusion status'
                }
            ]
        };
    }

    /**
     * Mock Bonuses (FT Compliant Format)
     */
    static getDemoBonuses() {
        return [
            { bonus_code: 'WELCOME100', name: 'Welcome Bonus 100%', amount: 100 },
            { bonus_code: 'RELOAD50', name: 'Weekend Reload', amount: 50 },
            { bonus_code: 'FREESPIN10', name: '10 Free Spins', amount: 10 }
        ];
    }

    /**
     * Intercepts and handles demo-specific logic for middleware
     */
    static async handleSandboxRequest(req, res) {
        const { method, path: reqPath } = req;
        const path = reqPath.startsWith('/') ? reqPath : '/' + reqPath;
        logger.info(`[Simulator] Incoming: ${method} ${path}`);
        const correlationId = generateCorrelationId();
        const brandId = 1; // Default for demo

        // Try to identify user Early from Token because Sandbox runs before Auth
        if (!req.user) {
            const supabaseService = require('./supabase');
            const username = req.headers['x-username'];
            let token = req.headers['authorization'] || '';

            while (token.toLowerCase().startsWith('bearer ')) {
                token = token.substring(7).trim();
            }

            try {
                let user = null;
                if (token) {
                    user = await supabaseService.getUser(username || null, token);
                }
                
                // Sandbox JIT fallback: if token fails or isn't a real DB token, lookup by username
                if (!user && username) {
                    user = await supabaseService.getUserById(username);
                }
                
                if (user) req.user = user;
            } catch (e) {
                logger.warn('[Simulator] Early auth extraction failed', { error: e.message });
            }
        }

        // Helper to get/init balance (fetch from DB if not in memory)
        const getBalance = async (uid) => {
            // ALWAYS try to fetch from database first to ensure we aren't using stale in-memory data
            try {
                let query = supabase.from('users').select('id, balance, bonus_balance');
                if (uid && uid.includes('-')) {
                    query = query.eq('id', uid);
                } else {
                    query = query.eq('username', uid);
                }
                const { data: userData, error } = await query.single();

                if (!error && userData) {
                    const latest = {
                        amount: parseFloat(userData.balance || 0),
                        bonus: parseFloat(userData.bonus_balance || 0),
                        dbId: userData.id
                    };
                    sandboxBalances.set(uid, latest);
                    return latest;
                }
            } catch (err) {
                logger.error('[Simulator] Failed to fetch balance from DB, falling back to cache', err);
            }

            if (!sandboxBalances.has(uid)) {
                sandboxBalances.set(uid, { amount: 1000, bonus: 100 });
            }
            return sandboxBalances.get(uid);
        };

        // 1. Mock User Details: (GET) /api/userdetails/:userid
        const userDetailsMatch = path.match(/\/(?:api\/)?userdetails\/([^\/?#]+)/i);
        if (method === 'GET' && userDetailsMatch) {
            const userId = userDetailsMatch[1];
            logger.info(`[Simulator] Match: UserDetails for ${userId}`);
            res.json(this.getDemoUser(userId));
            return true;
        }

        // 2. Mock Registration: (POST) /api/register
        if (method === 'POST' && (path.endsWith('/register') || path.includes('/register'))) {
            const username = req.body.username || 'demo_user';
            const user = this.getDemoUser(username);
            logger.info(`[Simulator] Match: Registration for ${username}`);
            res.json({
                user_id: user.username,
                token: `token-${username}`,
                user: user
            });
            return true;
        }

        // 3. Mock Profile Update
        if (method === 'POST' && (path.endsWith('/user/update') || path.includes('/user/update'))) {
            logger.info(`[Simulator] Match: User Update`);
            res.json({
                success: true,
                user: {
                    ...req.body,
                    user_id: req.user?.username || 'demo_user',
                    id: req.user?.id || 'demo-uuid'
                }
            });
            return true;
        }

        // 4. Mock Consents: (GET/PUT) /api/userconsents/:userid
        const consentsMatch = path.match(/\/(?:api\/)?userconsents\/([^\/?#]+)/i);
        if (consentsMatch) {
            const userId = consentsMatch[1];
            if (method === 'GET') {
                logger.info(`[Simulator] Match: GET UserConsents for ${userId}`);
                res.json({ consents: this.getDemoConsents() });
            } else if (method === 'PUT') {
                logger.info(`[Simulator] Match: PUT UserConsents for ${userId}`);
                res.json({ success: true });
            }
            return true;
        }

        // 5. Mock Blocks: (GET/PUT) /api/userblocks/:userid
        const blocksMatch = path.match(/\/(?:api\/)?userblocks\/([^\/?#]+)/i);
        if (blocksMatch) {
            const userId = blocksMatch[1];
            if (method === 'GET') {
                logger.info(`[Simulator] Match: GET UserBlocks for ${userId}`);
                res.json(this.getDemoBlocks());
            } else if (method === 'PUT') {
                logger.info(`[Simulator] Match: PUT UserBlocks for ${userId}`);
                res.json({ success: true });
            }
            return true;
        }

        // 6. Mock Bonus List: (GET) /api/bonus/list AND /api/promotions/active
        if (method === 'GET' && (path.includes('/bonus/list') || path.includes('/promotions/active'))) {
            logger.info(`[Simulator] Match: GET Promotions/Bonus List`);

            // Aggressively prevent caching
            res.removeHeader('ETag');
            res.setHeader('Surrogate-Control', 'no-store');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // Fetch real active templates from the database
            const activeTemplates = await supabaseService.getActivePromotions(1);
            
            // Map templates to the format expected by the frontend
            const bonuses = (activeTemplates || []).map(t => ({
                id: String(t.id),
                bonus_code: t.bonus_code || `PROMO-${t.id}`,
                name: t.name,
                description: t.description || `Special offer: ${t.reward_value} EUR matching bonus.`,
                amount: t.reward_value || 0,
                type: t.reward_type
            }));

            const promoResponse = {
                promotions: bonuses.map(b => ({
                    id: b.id,
                    name: b.name,
                    description: b.description
                })),
                bonuses: bonuses,
                Data: bonuses,
                timestamp: Date.now()
            };
            res.json(promoResponse);
            return true;
        }

        // 7. Mock Debit (Slot Play): (POST) /api/debit
        if (method === 'POST' && (path.endsWith('/debit') || path.includes('/debit'))) {
            const { user_id, amount } = req.body;
            const uid = user_id || req.user?.id || req.user?.username || 'demo_user';
            logger.info(`[Simulator] Match: POST Debit for ${uid}`);

            const bal = await getBalance(uid);
            if ((bal.amount + bal.bonus) < amount) {
                return res.status(400).json({ error: 'INSUFFICIENT_FUNDS' });
            }

            const bonusBefore = bal.bonus;
            const realBefore = bal.amount;

            // Bonus-first wagering: consume bonus before real money
            let remaining = amount;
            if (bal.bonus >= remaining) {
                bal.bonus -= remaining;
                remaining = 0;
            } else {
                remaining -= bal.bonus;
                bal.bonus = 0;
                bal.amount -= remaining;
                remaining = 0;
            }

            // [FastTrack Integration] Identify user by human-readable ID (e.g. test01)
            const ftUserId = req.user?.user_id || req.user?.username || uid;

            // Track for Velocity Spike
            sandboxLogs.push({ user_id: uid, action: 'debit', timestamp: Date.now() });
            const lastMinute = Date.now() - 60000;
            const recentBets = sandboxLogs.filter(l => l.user_id === uid && l.action === 'debit' && l.timestamp > lastMinute);

            if (recentBets.length >= 5) {
                logger.warn(`[Simulator] Velocity Spike Detected for ${uid}`);
                InterventionService.handleRiskDetected(uid, {
                    riskLevel: 'MEDIUM',
                    reasons: ['isVelocitySpike']
                });
            }

            // Push to Audit Log for Operator Visibility
            await auditLog({
                correlationId,
                brandId,
                actor_id: uid,
                action: 'wallet:debit',
                entity_type: 'player',
                entity_id: bal.dbId,
                message: `Simulator Bet: ${amount} EUR on ${req.body.game_id || 'neostrike-demo'} (bonus: ${bonusBefore - bal.bonus} EUR, real: ${realBefore - bal.amount} EUR)`,
                metadata: {
                    request: req.body,
                    balance_before: realBefore,
                    balance_after: bal.amount,
                    bonus_before: bonusBefore,
                    bonus_after: bal.bonus,
                    source: 'simulator'
                }
            }).catch(e => logger.error('[Simulator] Audit Log: Debit Failed', e));

            // Persist to Transactions table
            await supabaseService.createTransaction({
                transaction_id: req.body.transaction_id || `bet-${Date.now()}`,
                brand_id: brandId,
                user_id: bal.dbId,
                type: 'Bet',
                balance_before: realBefore,
                balance_after: bal.amount,
                bonus_balance_before: bonusBefore,
                bonus_balance_after: bal.bonus,
                game_id: req.body.game_id || 'neostrike-demo',
                currency: 'EUR'
            }).catch(e => logger.error('[Simulator] Transaction Save Failed', e));

            // [FastTrack Integration] Push Casino Bet Event
            await ftService.pushEvent(ftUserId, 'casino', {
                transaction_id: req.body.transaction_id || `bet-${Date.now()}`,
                amount: amount,
                balance_before: realBefore,
                balance_after: bal.amount,
                game_id: req.body.game_id || 'neostrike-demo',
                type: 'Bet'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Casino Push Failed', e));

            await ftService.pushEvent(ftUserId, 'balance', {
                amount: bal.amount,
                bonus_amount: bal.bonus,
                currency: 'EUR'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Balance Push Failed', e));

            // Sync back to DB if we have a record
            if (bal.dbId) {
                await supabase.from('users').update({ 
                    balance: bal.amount,
                    bonus_balance: bal.bonus 
                }).eq('id', bal.dbId);
            }

            // [AFA] Emit directly to AFA broadcast (sandbox bypass — FT never calls back in dev)
            emitAfaEvent('casino', {
                type: 'Bet',
                player_id: uid,
                amount: amount,
                game_id: req.body.game_id || 'neostrike-demo',
                balance_before: realBefore,
                balance_after: bal.amount,
                bonus_before: bonusBefore,
                bonus_after: bal.bonus,
                currency: 'EUR',
                transaction_id: req.body.transaction_id,
                message: `Bet: ${amount} EUR on ${req.body.game_id || 'neostrike-demo'}`,
            }, brandId);

            res.json({
                transaction_id: `sandbox-tx-${Date.now()}`,
                balance: bal.amount,
                bonus_balance: bal.bonus,
                currency: 'EUR'
            });
            return true;
        }

        // 8. Mock Bonus Credit: (POST) /api/bonus/credit OR /api/promotions/claim
        if (method === 'POST' && (path.includes('/bonus/credit') || path.includes('/promotions/claim'))) {
            logger.info(`[Simulator] Bonus claim match: ${path}`);
            const { user_id, bonus_code, amount } = req.body;
            const uid = user_id || req.user?.username || 'test01';
            const bcode = bonus_code || 'WELCOME100';
            const bonusAmount = parseFloat(amount || 100);
            logger.info(`[Simulator] Match: POST Bonus Credit for ${uid}, bonus: ${bcode}, amount: ${bonusAmount}`);

            const bal = await getBalance(uid);
            await new Promise(r => setTimeout(r, 50)); // Small delay for replication lag if any
            bal.bonus += bonusAmount;

            // Push to Audit Log for Operator Visibility
            await auditLog({
                correlationId,
                brandId,
                actor_id: uid,
                action: 'wallet:bonus_credit',
                entity_type: 'player',
                entity_id: bal.dbId,
                message: `Simulator Bonus: ${bonusAmount} EUR (${bcode})`,
                metadata: {
                    request: req.body,
                    bonus_before: bal.bonus - bonusAmount,
                    bonus_after: bal.bonus,
                    source: 'simulator'
                }
            }).catch(e => logger.error('[Simulator] Audit Log: Bonus Failed', e));

            // [FastTrack Integration] Identify user by human-readable ID
            const ftUserId = req.user?.user_id || req.user?.username || uid;

            // Push FT Bonus Event
            await ftService.pushEvent(ftUserId, 'bonus', {
                bonus_id: '9821',
                user_bonus_id: `${ftUserId}-${bonus_code}-${Date.now()}`,
                type: 'WelcomeBonus',
                status: 'Created',
                amount: bonusAmount,
                bonus_code: bonus_code || 'WELCOME100',
                currency: 'EUR',
                product: 'Casino'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Bonus Push Failed', e));

            // Persist to Transactions table
            await supabaseService.createTransaction({
                transaction_id: `bon-${Date.now()}`,
                brand_id: brandId,
                user_id: bal.dbId,
                type: 'Bonus',
                amount: bonusAmount,
                status: 'Success',
                currency: 'EUR',
                metadata: { bonus_code: bcode }
            }).catch(e => logger.error('[Simulator] Bonus Transaction Save Failed', e));

            // Push Balance Update
            await ftService.pushEvent(ftUserId, 'balance', {
                amount: bal.amount,
                bonus_amount: bal.bonus,
                currency: 'EUR'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Balance Push Failed', e));

            // Sync back to DB if we have a record
            if (bal.dbId) {
                await supabase.from('users').update({ 
                    balance: bal.amount,
                    bonus_balance: bal.bonus 
                }).eq('id', bal.dbId);
            }

            // [AFA] Emit bonus event directly to AFA broadcast
            emitAfaEvent('bonus', {
                type: 'WelcomeBonus',
                player_id: uid,
                amount: bonusAmount,
                bonus_code: bcode,
                bonus_balance_after: bal.bonus,
                currency: 'EUR',
                message: `Bonus Credited: ${bonusAmount} EUR (${bcode})`,
            }, brandId);

            res.json({
                success: true,
                bonus_balance: bal.bonus,
                balance: bal.amount,
                currency: 'EUR'
            });
            return true;
        }

        // 9. Mock Credit (Slot Win): (POST) /api/credit
        if (method === 'POST' && path.endsWith('/credit')) {
            const { user_id, amount } = req.body;
            const uid = user_id || req.user?.id || req.user?.username || 'demo_user';
            logger.info(`[Simulator] Match: POST Credit`);

            const bal = await getBalance(uid);
            const balanceBefore = bal.amount;
            bal.amount += amount;

            // Push to Audit Log for Operator Visibility
            await auditLog({
                correlationId,
                brandId,
                actor_id: uid,
                action: 'wallet:credit',
                entity_type: 'player',
                entity_id: bal.dbId,
                message: `Simulator Win: ${amount} EUR on ${req.body.game_id || 'neostrike-demo'}`,
                metadata: {
                    request: req.body,
                    balance_before: balanceBefore,
                    balance_after: bal.amount,
                    source: 'simulator'
                }
            }).catch(e => logger.error('[Simulator] Audit Log: Credit Failed', e));

            // [FastTrack Integration] Identify user by human-readable ID
            const ftUserId = req.user?.user_id || req.user?.username || uid;

            // Push to FT (Awaited for stability)
            await supabaseService.createTransaction({
                transaction_id: req.body.transaction_id || `win-${Date.now()}`,
                brandId: brandId,
                user_id: bal.dbId, // Use the actual UUID from the database
                type: 'Win',
                balance_before: balanceBefore,
                balance_after: bal.amount,
                bonus_balance_before: bal.bonus,
                bonus_balance_after: bal.bonus,
                game_id: req.body.game_id || 'neostrike-demo',
                currency: 'EUR'
            }).catch(e => logger.error('[Simulator] Transaction Update Failed', e));

            // [FastTrack Integration] Push Casino Win Event
            await ftService.pushEvent(ftUserId, 'casino', {
                transaction_id: req.body.transaction_id || `win-${Date.now()}`,
                amount: amount,
                balance_before: balanceBefore,
                balance_after: bal.amount,
                game_id: req.body.game_id || 'neostrike-demo',
                type: 'Win'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Casino Win Failed', e));

            await ftService.pushEvent(ftUserId, 'balance', {
                amount: bal.amount,
                bonus_amount: bal.bonus,
                currency: 'EUR'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Balance Push Failed', e));

            // Sync back to DB if we have a record
            if (bal.dbId) {
                await supabase.from('users').update({ 
                    balance: bal.amount,
                    bonus_balance: bal.bonus 
                }).eq('id', bal.dbId);
            }

            // [AFA] Emit casino win directly to AFA broadcast
            emitAfaEvent('casino', {
                type: 'Win',
                player_id: uid,
                amount: amount,
                game_id: req.body.game_id || 'neostrike-demo',
                balance_before: balanceBefore,
                balance_after: bal.amount,
                currency: 'EUR',
                transaction_id: req.body.transaction_id,
                message: `Win: ${amount} EUR on ${req.body.game_id || 'neostrike-demo'}`,
            }, brandId);

            res.json({
                transaction_id: `sandbox-win-${Date.now()}`,
                balance: bal.amount,
                bonus_balance: bal.bonus,
                currency: 'EUR'
            });
            return true;
        }

        // 9. Mock Deposit: (POST) /api/deposit
        if (method === 'POST' && (path.endsWith('/deposit') || path.includes('/deposit')) && !path.includes('/v1/demo/')) {
            const { user_id, amount } = req.body;
            const uid = user_id || req.user?.id || req.user?.username || 'demo_user';
            const depositAmount = parseFloat(amount || 100);
            logger.info(`[Simulator] Match: POST Deposit for ${uid}, amount: ${depositAmount}`);


            const bal = await getBalance(uid);
            const balanceBefore = bal.amount;
            bal.amount += depositAmount;

            // Push to Audit Log for Operator Visibility
            await auditLog({
                correlationId,
                brandId,
                actor_id: uid,
                action: 'wallet:deposit',
                entity_type: 'player',
                entity_id: bal.dbId,
                message: `Simulator Deposit: ${depositAmount} EUR`,
                metadata: {
                    request: req.body,
                    balance_before: balanceBefore,
                    balance_after: bal.amount,
                    source: 'simulator'
                }
            }).catch(e => logger.error('[Simulator] Audit Log: Deposit Failed', e));

            // [FastTrack Integration] Identify user by human-readable ID
            const ftUserId = req.user?.user_id || req.user?.username || uid;

            // Push to FT (Awaited for stability)
            await ftService.pushEvent(ftUserId, 'payment', {
                transaction_id: `sb-deposit-${Date.now()}`,
                amount: depositAmount,
                status: 'Approved',
                currency: 'EUR',
                vendor_id: 'netent'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Payment Push Failed', e));

            // Persist to Transactions table
            await supabaseService.createTransaction({
                transaction_id: `dep-${Date.now()}`,
                brand_id: brandId,
                user_id: bal.dbId,
                type: 'Deposit',
                amount: depositAmount,
                status: 'Success',
                currency: 'EUR'
            }).catch(e => logger.error('[Simulator] Deposit Transaction Save Failed', e));

            await ftService.pushEvent(ftUserId, 'balance', {
                amount: bal.amount,
                bonus_amount: bal.bonus,
                currency: 'EUR'
            }, { correlationId, brandId }).catch(e => logger.error('[Simulator] FT Balance Push Failed', e));

            // Sync back to DB if we have a record
            if (bal.dbId) {
                await supabase.from('users').update({ 
                    balance: bal.amount,
                    bonus_balance: bal.bonus 
                }).eq('id', bal.dbId);
            }

            // [AFA] Emit deposit event directly to AFA broadcast
            emitAfaEvent('deposit', {
                type: 'Deposit',
                player_id: uid,
                amount: depositAmount,
                balance_before: balanceBefore,
                balance_after: bal.amount,
                currency: 'EUR',
                status: 'Approved',
                message: `Deposit: ${depositAmount} EUR`,
            }, brandId);

            res.json({
                success: true,
                transaction_id: `sandbox-deposit-${Date.now()}`,
                balance: bal.amount,
                bonus_balance: bal.bonus,
                currency: 'EUR'
            });
            return true;
        }

        // 10. Mock Balance: (GET) /api/balance
        if (method === 'GET' && (path.endsWith('/balance') || path.includes('/balance'))) {
            const userId = req.query?.user_id || req.user?.id || req.user?.username || 'demo_user';
            const bal = await getBalance(userId);

            // Prevent caching to ensure fresh balance data
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            res.json({
                amount: bal.amount,
                bonus_amount: bal.bonus,
                currency: 'EUR',
                balance: bal.amount,
                bonus_balance: bal.bonus
            });
            return true;
        }

        return false;
    }
}

module.exports = SimulatorService;
