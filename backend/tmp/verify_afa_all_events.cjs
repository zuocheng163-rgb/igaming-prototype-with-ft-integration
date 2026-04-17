require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const http = require('http');

const AFA_JWT_SECRET = 'afa-dev-secret-change-in-production';
const BASE_URL = 'http://localhost:5000';

async function verifyStream() {
    console.log('--- Starting Comprehensive AFA Stream Verification ---');

    const agentId = 'comp-test-agent-' + Date.now();
    const tenantId = '1';

    // 1. Generate Agent Token
    const payload = {
        agent_id: agentId,
        tenant_id: tenantId,
        policy_scope: ['metrics:read', 'alerts:read', 'player:read'],
        trust_tier: 'T1',
        jti: 'jti-' + Date.now()
    };
    const token = jwt.sign(payload, AFA_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    
    // 1b. Create SSE Subscription in DB
    const supabaseService = require('../services/supabase');
    const { AfaWebhookService } = require('../services/afa-webhook-service');
    const afaWebhookService = new AfaWebhookService(supabaseService);
    
    // All types we want to test
    const testTypes = ['KYC_UPDATE', 'LOGIN_V2', 'MANDATORY_BREAK', 'balance_update'];
    
    await afaWebhookService.createSubscription({
        tenantId,
        agentId,
        eventTypes: testTypes,
        isSse: true
    });
    console.log('Subscription created for agent:', agentId);

    const receivedEvents = new Set();

    // 2. Start listening to SSE stream
    const sseRequest = http.request(`${BASE_URL}/api/v1/ops/events/stream`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream'
        }
    }, (res) => {
        res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.event_type) {
                            console.log('RECEIVED EVENT:', data.event_type);
                            receivedEvents.add(data.event_type);
                            if (receivedEvents.size === testTypes.length) {
                                console.log('✅ SUCCESS: Received all test event types!');
                                process.exit(0);
                            }
                        }
                    } catch (e) {}
                }
            }
        });
    });
    sseRequest.end();

    await new Promise(r => setTimeout(r, 1000));

    // 3. Trigger events via RabbitMQ Loopback (by calling rabbitmq.publishEvent directly)
    const rabbitmq = require('../services/rabbitmq');
    
    console.log('Simulating events...');
    
    for (const type of testTypes) {
        console.log(`Publishing ${type}...`);
        await rabbitmq.publishEvent(null, { type, player_id: 'test01', brand_id: 1, amount: 10 }, type);
        await new Promise(r => setTimeout(r, 500));
    }

    // Timeout after 15s
    setTimeout(() => {
        console.error('❌ TIMEOUT: Only received:', Array.from(receivedEvents));
        process.exit(1);
    }, 15000);
}

verifyStream();
