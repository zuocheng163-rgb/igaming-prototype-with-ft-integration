require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const http = require('http');

const AFA_JWT_SECRET = 'afa-dev-secret-change-in-production';
const BASE_URL = 'http://localhost:5000';

async function verifyStream() {
    console.log('--- Starting AFA Stream Verification ---');

    // 1. Generate Agent Token
    const payload = {
        agent_id: 'test-agent-001',
        tenant_id: '1',
        policy_scope: ['metrics:read', 'alerts:read', 'player:read'],
        trust_tier: 'T1',
        jti: 'jti-' + Date.now()
    };
    const token = jwt.sign(payload, AFA_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    console.log('Generated token for agent:', payload.agent_id);

    // 1b. Create SSE Subscription in Supabase
    console.log('Creating SSE subscription in DB...');
    const supabaseService = require('../services/supabase');
    const { AfaWebhookService } = require('../services/afa-webhook-service');
    const afaWebhookService = new AfaWebhookService(supabaseService);
    
    const sub = await afaWebhookService.createSubscription({
        tenantId: payload.tenant_id,
        agentId: payload.agent_id,
        eventTypes: ['PAYMENT', 'CASINO', 'balance_update', 'payment_status'],
        isSse: true
    });
    console.log('Subscription created:', sub.id);

    // 2. Start listening to SSE stream
    console.log('Connecting to SSE stream...');
    const sseRequest = http.request(`${BASE_URL}/api/v1/ops/events/stream`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream'
        }
    }, (res) => {
        console.log('SSE Connected. Status:', res.statusCode);
        res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    console.log('RECEIVED EVENT:', data.event_type);
                    if (['PAYMENT', 'CASINO', 'balance_update'].includes(data.event_type)) {
                        console.log('✅ SUCCESS: Received real-time financial event:', data.event_type);
                        console.log('Event Payload:', JSON.stringify(data.data, null, 2));
                        process.exit(0);
                    }
                }
            }
        });
    });
    sseRequest.end();

    // 3. Trigger a financial event (Deposit)
    console.log('Waiting 2s before triggering deposit...');
    await new Promise(r => setTimeout(r, 2000));

    try {
        console.log('Triggering deposit via API...');
        const depositRes = await axios.post(`${BASE_URL}/api/v1/payments/submit`, {
            type: 'deposit',
            amount: 50,
            method: 'card',
            user_id: 'test01'
        }, {
            headers: {
                'x-api-key': 'fasttrack-demo-key', // From .env OPERATOR_API_KEY
                'x-brand-id': '1'
            }
        });
        console.log('Deposit submitted. Status:', depositRes.status);
    } catch (err) {
        console.error('Failed to trigger deposit:', err.response?.data || err.message);
        process.exit(1);
    }

    // Timeout after 10s
    setTimeout(() => {
        console.error('❌ TIMEOUT: Did not receive financial event in 10s');
        process.exit(1);
    }, 10000);
}

verifyStream();
