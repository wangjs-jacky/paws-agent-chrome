import assert from 'node:assert/strict';

const serverUrl = 'https://47.115.228.20:8443';
const sentinelPublicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const healthResponse = await fetch(`${serverUrl}/health`, withTimeout());
assert.equal(healthResponse.ok, true, `production health check failed (${healthResponse.status})`);
const health = await healthResponse.json();
assert.equal(health.status, 'ok', 'production health response is not healthy');

const linkResponse = await fetch(`${serverUrl}/v1/auth/account/request`, {
    ...withTimeout(),
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Happy-Client': 'paws-agent-chrome-production-check/0.0.2',
    },
    body: JSON.stringify({ publicKey: sentinelPublicKey }),
});
assert.equal(linkResponse.ok, true, `production account-link check failed (${linkResponse.status})`);
const link = await linkResponse.json();
assert.equal(link.state, 'requested', 'production account-link response is unexpected');

const realtimeResponse = await fetch(`${serverUrl}/v1/updates/?EIO=4&transport=polling`, withTimeout());
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
    sideEffects: 'one stable unauthenticated sentinel account-link row is upserted and one disposable Engine.IO session is created',
}, null, 2) + '\n');

function withTimeout() {
    return { signal: AbortSignal.timeout(10_000) };
}
