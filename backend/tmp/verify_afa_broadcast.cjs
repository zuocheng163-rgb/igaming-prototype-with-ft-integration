require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

const AFA_JWT_SECRET = 'afa-dev-secret-change-in-production';
const BASE_URL = 'http://localhost:5000';

async function verifyBroadcast() {
    console.log('--- Starting AFA Broadcast Verification ---');

    // Use a TOTALLY NEW agent ID that definitely has NO subscription in DB
    const agentId = 'monitor-agent-' + Date.now();
    const payload = {
        agent_id: agentId,
        tenant_id: '1',
        policy_scope: ['alerts:read', 'metrics:read'], // Monitoring scopes
        trust_tier: 'T1',
        jti: 'jti-' + Date.now()
    };
    const token = jwt.sign(payload, AFA_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

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
                        if (data.event_type === 'broadcast_test') {
                            console.log('✅ SUCCESS: Received event via Broadcast mode without manual subscription!');
                            process.exit(0);
                        }
                    } catch (e) {}
                }
            }
        });
    });
    sseRequest.end();

    await new Promise(r => setTimeout(r, 1000));

    // Trigger test event via HTTP to ensure it happens in the backend process
    const axios = require('axios');
    console.log('Publishing broadcast_test event via HTTP...');
    await axios.post(`${BASE_URL}/api/v1/ops/debug/trigger-event`, {
        type: 'broadcast_test',
        payload: { msg: 'Hello Broadcast via HTTP' },
        brandId: 1
    });

    setTimeout(() => {
        console.error('❌ TIMEOUT: Monitoring agent did not receive broadcast event');
        process.exit(1);
    }, 10000);
}

verifyBroadcast();
