import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const serverUrl = 'https://47.115.228.20:8443';
const requestOptions = { signal: AbortSignal.timeout(10_000) };

const healthResponse = await fetch(`${serverUrl}/health`, requestOptions);
assert.equal(healthResponse.ok, true, `production health check failed (${healthResponse.status})`);
const health = await healthResponse.json();
assert.equal(health.status, 'ok', 'production health response is not healthy');

const linkResponse = await fetch(`${serverUrl}/v1/auth/account/request`, {
    ...requestOptions,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Happy-Client': 'paws-agent-chrome-production-check/0.0.2',
    },
    body: JSON.stringify({ publicKey: randomBytes(32).toString('base64') }),
});
assert.equal(linkResponse.ok, true, `production account-link check failed (${linkResponse.status})`);
const link = await linkResponse.json();
assert.equal(link.state, 'requested', 'production account-link response is unexpected');

const realtimeResponse = await fetch(`${serverUrl}/v1/updates/?EIO=4&transport=polling`, requestOptions);
assert.equal(realtimeResponse.ok, true, `production realtime check failed (${realtimeResponse.status})`);
const realtimeHandshake = await realtimeResponse.text();
assert.match(realtimeHandshake, /^0\{"sid":"[^"]+"/, 'production realtime endpoint did not return an Engine.IO handshake');

process.stdout.write(JSON.stringify({
    status: 'pass',
    serverUrl,
    checks: {
        tls: 'trusted by Node fetch',
        health: health.status,
        accountLink: link.state,
        realtime: 'Engine.IO handshake received',
    },
    sideEffects: 'one transient unauthenticated account-link request and one disposable Engine.IO session',
}, null, 2) + '\n');
