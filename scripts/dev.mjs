import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const port = Number.parseInt(process.env.PAWS_EXTENSION_DEV_PORT ?? '37651', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PAWS_EXTENSION_DEV_PORT 必须是 1 到 65535 的端口号');
const origin = `http://127.0.0.1:${port}`;
const waiters = new Set();
const watchedDirectories = ['src', 'static', 'scripts'];
let building = false;
let rebuildQueued = false;
let initialBuild = true;
let timer;

const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || request.url !== '/wait') {
        response.writeHead(404).end();
        return;
    }
    waiters.add(response);
    const timeout = setTimeout(() => response.writeHead(204).end(), 25_000);
    response.on('close', () => {
        clearTimeout(timeout);
        waiters.delete(response);
    });
});

function notifyReload() {
    for (const response of waiters) response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"reload":true}');
    waiters.clear();
}

function runBuild() {
    return new Promise(resolve => {
        const child = spawn(process.execPath, ['scripts/build.mjs'], {
            env: {
                ...process.env,
                PAWS_EXTENSION_DEV_RELOAD_URL: origin,
                PAWS_EXTENSION_INCLUDE_LOCALHOST: '1',
            },
            stdio: 'inherit',
        });
        child.on('exit', code => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
}

async function rebuild() {
    if (building) {
        rebuildQueued = true;
        return;
    }
    building = true;
    const succeeded = await runBuild();
    building = false;
    if (succeeded && !initialBuild) {
        notifyReload();
        process.stdout.write('已通知浏览器重载扩展和页面。\n');
    }
    initialBuild = false;
    if (rebuildQueued) {
        rebuildQueued = false;
        void rebuild();
    }
}

function queueRebuild() {
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 120);
}

server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`开发重载服务运行于 ${origin}\n`);
    for (const directory of watchedDirectories) watch(directory, { recursive: true }, queueRebuild);
    void rebuild();
});

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
