import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { startE2eFixtureServer } from '../test/e2eFixtureServer.mjs';

const exec = promisify(execFile);
const extensionDir = resolve('dist');
const artifactDir = resolve('test-results/paws-agent-chrome-e2e');
const recording = process.env.PAWS_EXTENSION_E2E_RECORD === '1';
const headed = process.env.PAWS_EXTENSION_E2E_HEADED === '1';
const screenshotPath = resolve(artifactDir, recording ? 'connected-recording.png' : 'connected.png');
const directoryBrowserPath = resolve(artifactDir, recording ? 'directory-browser-recording.png' : 'directory-browser.png');
const reconnectPath = resolve(artifactDir, recording ? 'reconnected-recording.png' : 'reconnected.png');
const rawVideoDir = resolve(artifactDir, 'raw-video');
const mp4Path = resolve(artifactDir, 'paws-chrome-bubble-e2e.mp4');
const contactSheetPath = resolve(artifactDir, 'paws-chrome-bubble-e2e-contact-sheet.png');
const executablePath = await resolveBrowserExecutable();

await mkdir(artifactDir, { recursive: true });
if (recording) {
    await rm(rawVideoDir, { recursive: true, force: true });
    await mkdir(rawVideoDir, { recursive: true });
}

let fixture;
let browser;
let context;
let page;
let video;
const pageErrors = [];
const marker = 'Investigate checkout failure';

try {
    fixture = await startE2eFixtureServer(extensionDir);
    browser = await chromium.launch({
        headless: !headed,
        ...(executablePath ? { executablePath } : {}),
        slowMo: headed ? 500 : 0,
    });
    stage('launch browser context');
    context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        ...(recording ? { recordVideo: { dir: rawVideoDir, size: { width: 1280, height: 720 } } } : {}),
    });
    await context.addInitScript(testOrigin => {
        const prefix = 'paws-extension-e2e:';
        const chromeApi = window.chrome ?? {};
        chromeApi.runtime = { id: 'paws-agent-e2e', getURL: path => `${testOrigin}/${path}` };
        chromeApi.storage = {
            local: {
                async get(key) { return { [key]: localStorage.getItem(prefix + key) }; },
                async set(items) { for (const [key, value] of Object.entries(items)) localStorage.setItem(prefix + key, value); },
                async remove(key) { localStorage.removeItem(prefix + key); },
            },
        };
        if (!window.chrome) Object.defineProperty(window, 'chrome', { configurable: true, value: chromeApi });
    }, fixture.origin);

    page = await context.newPage();
    page.setDefaultTimeout(10_000);
    video = page.video();
    page.on('pageerror', error => pageErrors.push(error.message));
    stage('open fixture and inject bubble');
    await page.goto(fixture.origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#issue').selectText();

    const frameHost = page.locator('iframe[data-paws-agent-bubble="true"]');
    await frameHost.waitFor({ state: 'visible' });
    assert.equal(await frameHost.count(), 1, 'the content script must inject exactly one bubble');
    assert.equal(await frameHost.evaluate(frame => frame.style.width), '76px');

    const bubble = page.frameLocator('#paws-agent-bubble-frame');
    stage('open bubble and link account');
    await bubble.getByRole('button', { name: '打开 Paws Agent' }).click();
    await waitForExpandedFrame(page);
    await bubble.getByText('把这个浏览器连接到 Paws').waitFor();
    await bubble.getByLabel('Server URL').fill(fixture.origin);
    await bubble.getByRole('button', { name: '生成绑定二维码' }).click();
    await bubble.getByAltText('Paws 设备绑定二维码').waitFor({ state: 'visible' });
    if (recording || headed) await page.waitForTimeout(900);

    stage('connect SDK and select remote target');
    await bubble.getByText('已连接').waitFor({ timeout: 15_000 });
    const machineOptions = await bubble.getByLabel('远端机器').locator('option').allTextContents();
    assert.deepEqual(machineOptions.slice(0, 2), [
        'E2E Mac mini · 在线',
        'studio-mac.local · 在线',
    ]);
    assert.match(machineOptions[2] ?? '', /^retired-mac\.local · 离线 · 最后活跃 /);
    await bubble.getByLabel('远端机器').selectOption('paws-e2e-machine');
    await expectInputValue(bubble.getByLabel('远端工作目录'), '/Users/e2e/recent-project');
    const recentOptions = await bubble.getByLabel('最近使用的远端目录').locator('option').allTextContents();
    assert.deepEqual(recentOptions, [
        '选择最近使用的目录…',
        '/Users/e2e/recent-project',
        '/Users/e2e/older-project',
    ]);

    stage('apply realtime machine and recent-directory updates');
    fixture.emitRecentDirectory('/Users/e2e/live-project');
    await waitForCondition('new remote session path appears without changing the selected directory', async () => {
        const options = await bubble.getByLabel('最近使用的远端目录').locator('option').allTextContents();
        return options[1] === '/Users/e2e/live-project'
            && await bubble.getByLabel('远端工作目录').inputValue() === '/Users/e2e/recent-project';
    });
    const studioOption = bubble.getByLabel('远端机器').locator('option[value="paws-studio-machine"]');
    fixture.emitStudioActive(false);
    await waitForCondition('machine turns offline and cannot be selected', async () => {
        return (await studioOption.textContent())?.includes('离线') === true && await studioOption.isDisabled();
    });
    fixture.emitStudioActive(true);
    await waitForCondition('machine comes back online and can be selected', async () => {
        return (await studioOption.textContent()) === 'studio-mac.local · 在线' && !await studioOption.isDisabled();
    });

    stage('browse remote directories through the SDK and keep a per-machine path');
    await bubble.getByRole('button', { name: '浏览远端目录' }).click();
    await bubble.getByText('原目录当前不可用，已回到这台机器的主目录。').waitFor();
    await bubble.getByRole('button', { name: '打开文件夹 Projects' }).click();
    await page.screenshot({ path: directoryBrowserPath, fullPage: true });
    if (recording || headed) await page.waitForTimeout(900);
    await bubble.getByRole('button', { name: '打开文件夹 paws-chrome' }).click();
    await bubble.getByRole('button', { name: '使用当前目录' }).click();
    await expectInputValue(bubble.getByLabel('远端工作目录'), '/Users/e2e/Projects/paws-chrome');

    await bubble.getByLabel('远端机器').selectOption('paws-studio-machine');
    await expectInputValue(bubble.getByLabel('远端工作目录'), '/Users/studio/recent-art');
    await bubble.getByLabel('远端机器').selectOption('paws-e2e-machine');
    await expectInputValue(bubble.getByLabel('远端工作目录'), '/Users/e2e/Projects/paws-chrome');

    await bubble.getByPlaceholder('告诉远端 Agent 你想做什么…').fill(marker);
    if (recording || headed) await page.waitForTimeout(900);
    await bubble.getByRole('button', { name: '发送', exact: true }).click();
    await bubble.getByText('远端目录不存在：/Users/e2e/Projects/paws-chrome').waitFor();
    if (recording || headed) await page.waitForTimeout(900);
    await bubble.getByRole('button', { name: '允许创建并继续' }).click();

    stage('verify remote reply and encrypted page context');
    await bubble.getByText('E2E fixture reply: remote session is ready.').waitFor({ timeout: 15_000 });
    await bubble.getByText(marker, { exact: false }).waitFor();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (recording || headed) await page.waitForTimeout(1_100);

    stage('verify high-privilege requests stay inside the trusted approval boundary');
    fixture.emitAgentRequest();
    await bubble.getByText('Agent 请求：Bash').waitFor();
    await bubble.getByText('echo paws-e2e-safe-request', { exact: false }).waitFor();
    await bubble.locator('pre.request-payload').filter({ hasText: '/tmp/paws-e2e-project' }).waitFor();
    await bubble.getByText('请在 Paws 自有客户端中审批', { exact: false }).waitFor();
    assert.equal(await bubble.getByRole('button', { name: '允许', exact: true }).count(), 0, 'the host-embedded frame must not expose a request approval control');
    assert.equal(fixture.state.requestResolutionCalls, 0, 'rendering an Agent request must not send a permission RPC');

    assert.equal(fixture.state.authRequests >= 2, true, 'account link must poll for authorization');
    assert.equal(fixture.state.spawnRequests, 2, 'directory approval must retry the spawn once');
    assert.equal(fixture.state.approvedSpawnRequests, 1, 'the approved spawn must occur exactly once');
    assert.deepEqual(fixture.state.browseRequests, [
        { machineId: 'paws-e2e-machine', path: '/Users/e2e/recent-project' },
        { machineId: 'paws-e2e-machine', path: '' },
        { machineId: 'paws-e2e-machine', path: '/Users/e2e/Projects' },
        { machineId: 'paws-e2e-machine', path: '/Users/e2e/Projects/paws-chrome' },
    ]);
    assert.equal(fixture.state.plainPrompts.length, 1, 'the remote fixture must receive one prompt');
    const prompt = fixture.state.plainPrompts[0];
    assert.match(prompt, /Investigate checkout failure/);
    assert.match(prompt, /Paws Extension E2E Fixture/);
    assert.match(prompt, /Payment failed with code 42/);
    assert.match(prompt, new RegExp(fixture.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    stage('change directory and reject an incompatible saved session on reconnect');
    await bubble.getByLabel('最近使用的远端目录').selectOption('/Users/e2e/older-project');
    await bubble.getByText('从当前网页开始一条远端会话').waitFor();
    assert.equal(await bubble.getByText('E2E fixture reply: remote session is ready.').count(), 0, 'changing the directory must detach the old conversation');
    await bubble.getByLabel('远端工作目录').fill('/Users/e2e/Projects/paws-chrome');
    await bubble.getByLabel('远端工作目录').press('Tab');
    await bubble.locator('body').evaluate(async () => {
        const key = 'paws-agent.chrome.config';
        const stored = await chrome.storage.local.get(key);
        const config = JSON.parse(stored[key]);
        config.machineId = 'paws-studio-machine';
        config.directory = '/Users/studio/recent-art';
        config.directoriesByMachine['paws-studio-machine'] = '/Users/studio/recent-art';
        config.sessionId = 'paws-e2e-session';
        await chrome.storage.local.set({ [key]: JSON.stringify(config) });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedBubble = page.frameLocator('#paws-agent-bubble-frame');
    await reloadedBubble.getByRole('button', { name: '打开 Paws Agent' }).click();
    await waitForExpandedFrame(page);
    await reloadedBubble.getByText('已连接').waitFor({ timeout: 15_000 });
    assert.equal(await reloadedBubble.getByText('把这个浏览器连接到 Paws').count(), 0, 'stored credentials must survive reload');
    assert.equal(await reloadedBubble.getByLabel('远端机器').inputValue(), 'paws-studio-machine');
    await expectInputValue(reloadedBubble.getByLabel('远端工作目录'), '/Users/studio/recent-art');
    await reloadedBubble.getByText('从当前网页开始一条远端会话').waitFor();
    assert.equal(await reloadedBubble.getByText('E2E fixture reply: remote session is ready.').count(), 0, 'a session from another target must not be restored');
    await page.screenshot({ path: reconnectPath, fullPage: true });
    if (recording || headed) await page.waitForTimeout(2_500);

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
    stage('case assertions passed');
} finally {
    stage('cleanup');
    await withTimeout(page?.close(), 5_000).catch(() => {});
    await withTimeout(context?.close(), 5_000).catch(() => {});
    await withTimeout(browser?.close(), 5_000).catch(() => {});
    await withTimeout(fixture?.close(), 5_000).catch(() => {});
}

let media = null;
if (recording && video) {
    const rawVideoPath = await video.path();
    await exec('/opt/homebrew/bin/ffmpeg', [
        '-y', '-i', rawVideoPath,
        '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
        mp4Path,
    ]);
    await exec('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', mp4Path, '-f', 'null', '-']);
    const probe = await exec('/opt/homebrew/bin/ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration,size',
        '-of', 'json', mp4Path,
    ]);
    media = JSON.parse(probe.stdout);
    const stream = media.streams?.[0];
    assert.equal(stream?.codec_name, 'h264');
    assert.equal(stream?.pix_fmt, 'yuv420p');
    assert.equal(stream?.width, 1280);
    assert.equal(stream?.height, 720);
    await exec('/opt/homebrew/bin/ffmpeg', [
        '-y', '-i', mp4Path,
        '-vf', 'fps=1/2,scale=320:-1,tile=4x3:padding=4:margin=4', '-frames:v', '1',
        contactSheetPath,
    ]);
}

process.stdout.write(JSON.stringify({
    case: 'PAWS-CHROME-BUBBLE-01',
    status: 'pass',
    host: executablePath ?? 'Playwright Chromium',
    mode: headed ? 'headed-browser-harness-with-real-sdk-protocol' : 'browser-harness-with-real-sdk-protocol',
    assertions: [
        'single injection and collapsed geometry',
        'QR account link and encrypted credential persistence',
        'online machine selection',
        'display-name and host fallback across online/offline machines',
        'realtime machine availability updates',
        'recent session directory synchronization',
        'realtime recent-directory synchronization',
        'home-scoped remote directory browsing',
        'per-machine directory persistence across switches and reload',
        'directory approval retry',
        'page context transmission',
        'remote reply rendering',
        'full Agent request detail rendering without an approval RPC',
        'directory-change session reset and target-safe reload reconnect',
    ],
    sideEffects: 'temporary local protocol server and disposable browser context only',
    artifacts: { screenshotPath, directoryBrowserPath, reconnectPath, ...(recording ? { mp4Path, contactSheetPath } : {}) },
    media,
}, null, 2) + '\n');

function stage(label) {
    process.stderr.write(`[PAWS-CHROME-BUBBLE-01] ${label}\n`);
}

async function expectInputValue(locator, expected) {
    await locator.waitFor();
    assert.equal(await locator.inputValue(), expected);
}

async function waitForCondition(label, predicate) {
    const deadline = Date.now() + 10_000;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            if (await predicate()) return;
        } catch (cause) {
            lastError = cause;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

async function waitForExpandedFrame(targetPage) {
    await targetPage.waitForFunction(() => {
        const frame = document.querySelector('iframe[data-paws-agent-bubble="true"]');
        if (!frame) return false;
        const style = getComputedStyle(frame);
        return Number.parseFloat(style.width) >= 389 && Number.parseFloat(style.height) >= 639;
    });
}

function withTimeout(promise, timeoutMs) {
    if (!promise) return Promise.resolve();
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`cleanup timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
}

async function resolveBrowserExecutable() {
    const candidates = [
        process.env.PAWS_EXTENSION_BROWSER,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            await access(candidate, constants.X_OK);
            return candidate;
        } catch {}
    }
    return null;
}
