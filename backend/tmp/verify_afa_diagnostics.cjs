require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

const AFA_JWT_SECRET = 'afa-dev-secret-change-in-production';
const BASE_URL = 'http://localhost:5000';

async function verifyDiagnostics() {
    console.log('--- Starting AFA Diagnostics Verification ---');

    const agentId = 'diag-test-agent-' + Date.now();
    const payload = {
        agent_id: agentId,
        tenant_id: '1',
        policy_scope: ['metrics:read'],
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
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'connected') {
                        console.log('✅ SUCCESS: Received connection message with diagnostics!');
                        console.log('PID:', data.process_id);
                        console.log('Uptime:', data.uptime);
                        process.exit(0);
                    }
                }
            }
        });
    });
    sseRequest.end();

    setTimeout(() => {
        console.error('❌ TIMEOUT: Did not receive diagnostic connection message');
        process.exit(1);
    }, 5000);
}

verifyDiagnostics();
