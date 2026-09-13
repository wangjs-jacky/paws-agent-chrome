import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Server as SocketServer } from 'socket.io';
import tweetnacl from 'tweetnacl';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MACHINE_ID = 'paws-e2e-machine';
const STUDIO_MACHINE_ID = 'paws-studio-machine';
const RETIRED_MACHINE_ID = 'paws-retired-machine';
const SESSION_ID = 'paws-e2e-session';
const TOKEN = 'paws-e2e-token';

export async function startE2eFixtureServer(extensionDir, { injectContentScript = true, syntheticLinkedAccount = false } = {}) {
    const runtimeBundle = injectContentScript ? (await build({ entryPoints: [fileURLToPath(new URL('./fixtureRuntime.ts', import.meta.url))], bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text : '';
    const fixtureStorage = { local: {}, session: {} };
    const secret = tweetnacl.randomBytes(32);
    const state = {
        authRequests: 0,
        spawnRequests: 0,
        approvedSpawnRequests: 0,
        plainPrompts: [],
        sessionCreated: false,
        agentRequestPending: false,
        requestResolutionCalls: 0,
        browseRequests: [],
        studioActive: true,
        studioActiveAt: Date.now() - 1_000,
        extraRecentPath: null,
        extraRecentUpdatedAt: 0,
        failNextSend: false,
        failStorage: false,
        imageBytes: [],
    };
    const messages = [];
    let linkPublicKey = null;

    const server = createServer(async (request, response) => {
        setCorsHeaders(request, response);
        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }

        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        try {
            if (url.pathname === '/') {
                const contentScript = injectContentScript ? '<script src="/fixture-runtime.js"></script><script src="/content.js"></script>' : '';
                send(response, 200, `<!doctype html><html><head><title>Paws Extension E2E Fixture</title><style>body{font:18px/1.8 system-ui;max-width:900px;margin:60px auto;padding:0 32px 220px;background:#f8f6f0;color:#292724}article{background:white;padding:28px;border-radius:18px;margin:24px 0}button{padding:9px;margin:4px}label{display:block}</style></head><body><main><h1>Native Messaging：浏览器与本机之间的桥</h1><p role="note">${injectContentScript ? 'SIMULATED runtime / storage — 本地夹具，非已安装 MV3；所有账号和回复均为合成数据。' : 'Local synthetic article — real installed MV3 required.'}</p><article><h2>一、通信边界</h2><p id="native-messaging">浏览器扩展通过 Native Messaging 与本机进程交换 JSON 消息。桥接让浏览器在受控边界内调用本机工具。</p><p id="issue">Payment failed with code 42</p><p id="duplicate-one">相同段落用于验证定位歧义。</p><p id="duplicate-two">相同段落用于验证定位歧义。</p><p hidden id="hidden-secret">SYNTHETIC_HIDDEN_SECRET_MUST_NOT_CAPTURE</p><label>合成密码 <input id="secret-input" type="password" value="SYNTHETIC_PASSWORD"></label><div contenteditable="true">合成可编辑文本，不应采集</div></article><article><h2>二、模拟会话</h2><p id="conversation-user">用户：为什么远端工具需要设备授权？</p><p id="conversation-agent">Agent：权限检查在每一次工具调用之前发生。</p></article><section><button id="route-change">切换 SPA 页面</button><button id="route-restore">返回原页面</button><span id="route-status">/</span><button id="send-failure">下次发送模拟失败</button><button id="storage-failure">模拟存储失败</button><button id="storage-restore">恢复存储</button></section></main><script src="/fixture-controls.js"></script>${contentScript}</body></html>`, 'text/html; charset=utf-8');
                return;
            }
            if (url.pathname === '/fixture-runtime.js') { send(response, 200, runtimeBundle, 'text/javascript'); return; }
            if (url.pathname === '/fixture-controls.js') { send(response, 200, await readFile(new URL('./fixtureControls.js', import.meta.url)), 'text/javascript'); return; }
            if (url.pathname === '/__fixture-control' && request.method === 'POST') { const body = await readJson(request); for (const key of ['failNextSend', 'failStorage']) if (typeof body[key] === 'boolean') state[key] = body[key]; sendJson(response, { ok: true }); return; }
            if (url.pathname === '/__fixture-storage' && request.method === 'POST') {
                const body = await readJson(request); const area = fixtureStorage[body.area]; if (!area) throw new Error('invalid storage area');
                if (body.op === 'get') { sendJson(response, { [body.key]: area[body.key] }); return; }
                if (body.op === 'set') { if (state.failStorage && Object.keys(body.items).some(k => k.startsWith('paws.annotations.'))) { sendJson(response, 507, { error: 'synthetic quota' }); return; } Object.assign(area, body.items); }
                if (body.op === 'remove') delete area[body.key]; sendJson(response, { ok: true }); return;
            }
            const staticPath = url.pathname.slice(1);
            if (['content.js', 'panel.js', 'panel.html', 'styles.css', 'annotation-popup.css'].includes(staticPath)) {
                let content = await readFile(join(extensionDir, staticPath));
                if (staticPath === 'panel.html' && injectContentScript) content = content.toString().replace('<script src="panel.js">', '<script src="/fixture-runtime.js"></script><script src="panel.js">');
                const contentType = extname(staticPath) === '.js'
                    ? 'text/javascript; charset=utf-8'
                    : extname(staticPath) === '.css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
                send(response, 200, content, contentType);
                return;
            }
            if (url.pathname === '/__state') {
                sendJson(response, state);
                return;
            }
            // A synthetic destination for checking the extension's new-tab handoff,
            // not an authenticated Paws Web session page.
            if (url.pathname === `/session/${SESSION_ID}` && state.sessionCreated) {
                send(response, 200, `<!doctype html><html><head><title>Session navigation fixture</title></head><body><h1>Session navigation fixture</h1><p data-session-id="${SESSION_ID}">${SESSION_ID}</p></body></html>`, 'text/html; charset=utf-8');
                return;
            }
            if (url.pathname === '/v1/auth/account/request' && request.method === 'POST') {
                const body = await readJson(request);
                state.authRequests += 1;
                if (typeof body.publicKey !== 'string') throw new Error('publicKey is required');
                if (linkPublicKey !== body.publicKey) {
                    linkPublicKey = body.publicKey;
                    sendJson(response, { state: 'requested' });
                    return;
                }
                const encryptedSecret = encryptForPublicKey(secret, fromBase64(linkPublicKey));
                sendJson(response, {
                    state: 'authorized',
                    token: TOKEN,
                    response: toBase64(encryptedSecret),
                });
                return;
            }

            requireAuthorization(request);
            if (url.pathname.endsWith('/attachments/request-upload')) {
                await readJson(request);
                sendJson(response, { ref: 'fixture-image', method: 'PUT', uploadUrl: `${url.origin}/fixture-image-upload` }); return;
            }
            if (url.pathname === '/fixture-image-upload' && request.method === 'PUT') {
                const chunks = []; for await (const chunk of request) chunks.push(chunk);
                const bytes = Buffer.concat(chunks);
                const root = createHmac('sha512', 'Happy Blobs Master Seed').update(secret).digest();
                const key = createHmac('sha512', root.subarray(32)).update(Buffer.concat([Buffer.from([0]), Buffer.from('master')])).digest().subarray(0, 32);
                const plain = tweetnacl.secretbox.open(bytes.subarray(24), bytes.subarray(0, 24), key);
                if (!plain) throw new Error('image decryption failed');
                state.imageBytes.push(Buffer.from(plain));
                sendJson(response, { success: true }); return;
            }
            if (url.pathname === '/v1/codex-session-grants' && request.method === 'POST') {
                sendJson(response, { grant: 'g'.repeat(43), expiresAt: Date.now() + 60_000 });
                return;
            }
            if (url.pathname === '/v1/machines' && request.method === 'GET') {
                sendJson(response, machineRecords(secret, state));
                return;
            }
            if ((url.pathname === '/v1/sessions' || url.pathname === '/v2/sessions/active') && request.method === 'GET') {
                const history = historicalSessionRecords(secret, state);
                sendJson(response, { sessions: state.sessionCreated ? [sessionRecord(secret, state), ...history] : history });
                return;
            }
            if (url.pathname.startsWith('/v2/sessions/') && request.method === 'GET') {
                const id = decodeURIComponent(url.pathname.slice('/v2/sessions/'.length));
                const records = historicalSessionRecords(secret, state);
                if (state.sessionCreated) records.push(sessionRecord(secret, state));
                const session = records.find(record => record.id === id);
                sendJson(response, session ? 200 : 404, session ? { session } : { error: 'Session not found' });
                return;
            }
            if (url.pathname === `/v3/sessions/${SESSION_ID}/messages` && request.method === 'POST') {
                if (state.failNextSend) { state.failNextSend = false; sendJson(response, 503, { error: 'Synthetic send failure' }); return; }
                const body = await readJson(request);
                const item = body.messages?.at(-1);
                for (const file of (body.messages ?? []).slice(0, -1)) {
                    const content = decryptLegacy(fromBase64(file.content), secret);
                    if (content?.content?.data?.ev?.t !== 'file' || content.content.data.ev.ref !== 'fixture-image' || !state.imageBytes.length) throw new Error('attachment protocol invalid');
                    messages.push(rawMessage(`file-${messages.length + 1}`, messages.length + 1, file.localId, content, secret, Date.now()));
                }
                if (typeof item?.content !== 'string' || typeof item?.localId !== 'string') {
                    throw new Error('message payload is malformed');
                }
                const plainContent = decryptLegacy(fromBase64(item.content), secret);
                const prompt = plainContent?.content?.text;
                if (typeof prompt !== 'string') throw new Error('message could not be decrypted');
                state.plainPrompts.push(prompt);
                const now = Date.now();
                messages.push(rawMessage(`user-${messages.length + 1}`, messages.length + 1, item.localId, plainContent, secret, now));
                messages.push(rawMessage(`agent-${messages.length + 1}`, messages.length + 1, null, {
                    role: 'agent',
                    content: { type: 'text', text: 'E2E fixture reply: remote session is ready.\n\n## 展示验收\n\n**加粗内容**\n\n- 列表项目\n\n| 名称 | 状态 |\n| --- | --- |\n| Markdown | 正常 |\n\n```js\nconst answer = 42;\n```\n\n```mermaid\ngraph TD\nA[给出真实目标] --> B{任务复杂度}\nB -->|简单问答| C[快速回答]\nB -->|多步骤任务| D[分析需求与代码资料]\nD --> E[实施或调研]\nE --> F[运行测试或浏览器验证]\nF --> G{通过验收}\nG -->|否| H[定位问题并继续修复]\nH --> E\nG -->|是| I[交付结果与验证证据]\n```\n\n[危险链接](javascript:alert(1))\n\n<script>window.pawsUnsafeExecuted = true</script>' },
                }, secret, now + 1));
                sendJson(response, { success: true });
                return;
            }
            if (url.pathname === `/v3/sessions/${SESSION_ID}/messages` && request.method === 'GET') {
                sendJson(response, { messages });
                return;
            }

            send(response, 404, 'not found');
        } catch (error) {
            sendJson(response, error.message === 'unauthorized' ? 401 : 500, { error: error.message });
        }
    });

    const io = new SocketServer(server, {
        path: '/v1/updates',
        transports: ['websocket'],
        cors: { origin: true, credentials: false },
    });
    io.use((socket, next) => {
        next(socket.handshake.auth?.token === TOKEN ? undefined : new Error('unauthorized'));
    });
    io.on('connection', socket => {
        socket.on('rpc-call', (payload, acknowledge) => {
            try {
                const params = decryptLegacy(fromBase64(payload?.params), secret);
                if (payload?.method === `${SESSION_ID}:permission`) {
                    state.requestResolutionCalls += 1;
                    acknowledge({ ok: true, result: toBase64(encryptLegacy({ success: true }, secret)) });
                    return;
                }
                const browseMachineId = [MACHINE_ID, STUDIO_MACHINE_ID]
                    .find(machineId => payload?.method === `${machineId}:browseDirectory`);
                if (browseMachineId) {
                    const path = typeof params?.path === 'string' ? params.path : '';
                    state.browseRequests.push({ machineId: browseMachineId, path });
                    acknowledge({
                        ok: true,
                        result: toBase64(encryptLegacy(browseFixtureDirectory(browseMachineId, path), secret)),
                    });
                    return;
                }
                if (payload?.method !== `${MACHINE_ID}:spawn-happy-session`) {
                    acknowledge({ ok: false, error: 'RPC method not available' });
                    return;
                }
                state.spawnRequests += 1;
                if (params?.agent === 'codex' && params.codexSessionGrant !== 'g'.repeat(43)) {
                    acknowledge({ ok: false, error: 'Missing Codex session grant' });
                    return;
                }
                if (params?.approvedNewDirectoryCreation !== true) {
                    acknowledge({
                        ok: true,
                        result: toBase64(encryptLegacy({
                            type: 'requestToApproveDirectoryCreation',
                            directory: params?.directory ?? '/tmp/paws-e2e-project',
                        }, secret)),
                    });
                    return;
                }
                state.approvedSpawnRequests += 1;
                state.sessionCreated = true;
                acknowledge({
                    ok: true,
                    result: toBase64(encryptLegacy({ type: 'success', sessionId: SESSION_ID }, secret)),
                });
            } catch (error) {
                acknowledge({ ok: false, error: error.message });
            }
        });
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('E2E fixture did not bind');
    const origin = `http://127.0.0.1:${address.port}`;
    if (syntheticLinkedAccount) {
        fixtureStorage.local['paws-agent.credentials'] = JSON.stringify({ token: TOKEN, secret: toBase64(secret) });
        fixtureStorage.local['paws-agent.chrome.config'] = JSON.stringify({ serverUrl: origin, machineId: MACHINE_ID, directory: '/tmp/paws-e2e-project', directoriesByMachine: { [MACHINE_ID]: '/tmp/paws-e2e-project' }, sessionId: '' });
    }

    return {
        origin,
        state,
        emitAgentRequest() {
            state.agentRequestPending = true;
            io.emit('update', { body: { t: 'update-session', id: SESSION_ID } });
        },
        emitStudioActive(active) {
            state.studioActive = active;
            state.studioActiveAt = Date.now();
            io.emit('update', { body: { t: 'update-machine', id: STUDIO_MACHINE_ID } });
        },
        emitRecentDirectory(path) {
            state.extraRecentPath = path;
            state.extraRecentUpdatedAt = Date.now() + 1_000;
            io.emit('update', { body: { t: 'new-session', id: 'live-recent-e2e' } });
        },
        async close() {
            await new Promise(resolve => io.close(resolve));
            if (server.listening) await new Promise(resolve => server.close(resolve));
        },
    };
}

function machineRecords(secret, state) {
    const now = Date.now();
    return [
        machineRecord(secret, {
            id: MACHINE_ID,
            active: true,
            activeAt: now,
            metadata: { displayName: 'E2E Mac mini', host: 'e2e-mac-mini', homeDir: '/Users/e2e' },
        }),
        machineRecord(secret, {
            id: STUDIO_MACHINE_ID,
            active: state.studioActive,
            activeAt: state.studioActiveAt,
            metadata: { host: 'studio-mac.local', homeDir: '/Users/studio' },
        }),
        machineRecord(secret, {
            id: RETIRED_MACHINE_ID,
            active: false,
            activeAt: 1,
            metadata: { host: 'retired-mac.local', homeDir: '/Users/retired' },
        }),
    ];
}

function machineRecord(secret, { id, active, activeAt, metadata }) {
    const now = Date.now();
    return {
        id,
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active,
        activeAt,
        metadata: toBase64(encryptLegacy(metadata, secret)),
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
        dataEncryptionKey: null,
    };
}

function sessionRecord(secret, state) {
    const now = Date.now();
    return {
        id: SESSION_ID,
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active: true,
        activeAt: now,
        metadata: toBase64(encryptLegacy({ machineId: MACHINE_ID, path: '/tmp/paws-e2e-project' }, secret)),
        metadataVersion: 1,
        agentState: state.agentRequestPending ? toBase64(encryptLegacy({
            requests: {
                'fixture-bash-request': {
                    tool: 'Bash',
                    arguments: {
                        command: 'echo paws-e2e-safe-request',
                        cwd: '/tmp/paws-e2e-project',
                    },
                },
            },
        }, secret)) : null,
        agentStateVersion: state.agentRequestPending ? 1 : 0,
        dataEncryptionKey: null,
    };
}

function historicalSessionRecords(secret, state) {
    const now = Date.now();
    const records = [
        historicalSessionRecord(secret, 'recent-e2e', MACHINE_ID, '/Users/e2e/recent-project', now - 1_000),
        historicalSessionRecord(secret, 'older-e2e', MACHINE_ID, '/Users/e2e/older-project', now - 2_000),
        historicalSessionRecord(secret, 'duplicate-e2e', MACHINE_ID, '/Users/e2e/recent-project', now - 3_000),
        historicalSessionRecord(secret, 'recent-studio', STUDIO_MACHINE_ID, '/Users/studio/recent-art', now - 500),
    ];
    if (state.extraRecentPath) {
        records.unshift(historicalSessionRecord(
            secret,
            'live-recent-e2e',
            MACHINE_ID,
            state.extraRecentPath,
            state.extraRecentUpdatedAt,
        ));
    }
    return records;
}

function historicalSessionRecord(secret, id, machineId, path, updatedAt) {
    return {
        id,
        seq: 1,
        createdAt: updatedAt - 1_000,
        updatedAt,
        active: false,
        activeAt: updatedAt,
        metadata: toBase64(encryptLegacy({ machineId, path }, secret)),
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        dataEncryptionKey: null,
    };
}

function browseFixtureDirectory(machineId, requestedPath) {
    const home = machineId === STUDIO_MACHINE_ID ? '/Users/studio' : '/Users/e2e';
    const path = requestedPath === '' || requestedPath === '~' ? home : requestedPath;
    const trees = machineId === STUDIO_MACHINE_ID
        ? {
            '/Users/studio': [{ name: 'Work', path: '/Users/studio/Work', isProjectRoot: false }],
            '/Users/studio/Work': [],
        }
        : {
            '/Users/e2e': [{ name: 'Projects', path: '/Users/e2e/Projects', isProjectRoot: false }],
            '/Users/e2e/Projects': [{ name: 'paws-chrome', path: '/Users/e2e/Projects/paws-chrome', isProjectRoot: true }],
            '/Users/e2e/Projects/paws-chrome': [],
        };
    const directories = trees[path];
    if (!directories) return { success: false, error: 'Directory not found in E2E fixture' };
    const parent = path === home ? null : path.slice(0, path.lastIndexOf('/')) || home;
    return { success: true, path, parent, home, directories };
}

function rawMessage(id, seq, localId, content, secret, timestamp) {
    return {
        id,
        seq,
        content: { t: 'encrypted', c: toBase64(encryptLegacy(content, secret)) },
        localId,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function encryptForPublicKey(data, recipientPublicKey) {
    const ephemeral = tweetnacl.box.keyPair();
    const nonce = tweetnacl.randomBytes(tweetnacl.box.nonceLength);
    const encrypted = tweetnacl.box(data, nonce, recipientPublicKey, ephemeral.secretKey);
    return concat(ephemeral.publicKey, nonce, encrypted);
}

function encryptLegacy(value, secret) {
    const nonce = tweetnacl.randomBytes(tweetnacl.secretbox.nonceLength);
    return concat(nonce, tweetnacl.secretbox(encoder.encode(JSON.stringify(value)), nonce, secret));
}

function decryptLegacy(value, secret) {
    const opened = tweetnacl.secretbox.open(value.slice(tweetnacl.secretbox.nonceLength), value.slice(0, tweetnacl.secretbox.nonceLength), secret);
    return opened ? JSON.parse(decoder.decode(opened)) : null;
}

function concat(...values) {
    const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
    let offset = 0;
    for (const value of values) {
        result.set(value, offset);
        offset += value.length;
    }
    return result;
}

function fromBase64(value) {
    return new Uint8Array(Buffer.from(value, 'base64'));
}

function toBase64(value) {
    return Buffer.from(value).toString('base64');
}

function requireAuthorization(request) {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) throw new Error('unauthorized');
}

async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function setCorsHeaders(request, response) {
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Happy-Client');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(response, statusOrValue, maybeValue) {
    const status = typeof statusOrValue === 'number' ? statusOrValue : 200;
    const value = typeof statusOrValue === 'number' ? maybeValue : statusOrValue;
    send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
    if (response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': contentType });
    response.end(body);
}
