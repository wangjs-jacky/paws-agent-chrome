import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

const exec = promisify(execFile);
const caseId = 'PAWS-CHROME-HTTPS-01';
const extensionDir = resolve('dist');
const serverUrl = 'https://47.115.228.20:8443';
const legacyServerUrl = 'http://47.115.228.20:3005';
const hostUrl = 'https://paws-extension-e2e.invalid/';
const configKey = 'paws-agent.chrome.config';
const artifactDir = resolve('test-results/paws-agent-chrome-mv3-https');
const recording = process.env.PAWS_EXTENSION_E2E_RECORD === '1';
const screenshotPath = resolve(artifactDir, 'linked-over-https.png');
const rawVideoDir = resolve(artifactDir, 'raw-video');
const mp4Path = resolve(artifactDir, 'paws-chrome-mv3-https-e2e.mp4');
const contactSheetPath = resolve(artifactDir, 'paws-chrome-mv3-https-e2e-contact-sheet.png');
const userDataDir = await mkdtemp(join(tmpdir(), 'paws-chrome-mv3-https-'));

await mkdir(artifactDir, { recursive: true });
if (recording) {
    await rm(rawVideoDir, { recursive: true, force: true });
    await mkdir(rawVideoDir, { recursive: true });
}

let context;
let page;
let video;
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
let authRequests = 0;

try {
    stage('launch real Manifest V3 extension');
    context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
        ],
        ...(recording ? { recordVideo: { dir: rawVideoDir, size: { width: 1280, height: 720 } } } : {}),
    });
    page = context.pages()[0] ?? await context.newPage();
    video = page.video();
    page.setDefaultTimeout(recording ? 20_000 : 10_000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => {
        requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' });
    });

    await page.route(hostUrl, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><head><title>HTTPS host fixture</title></head><body><main><h1>Secure host page</h1><p id="issue">Extension HTTPS regression fixture</p></main></body></html>',
    }));
    await page.route(`${serverUrl}/v1/auth/account/request`, route => {
        authRequests += 1;
        if (route.request().method() === 'OPTIONS') {
            return route.fulfill({
                status: 204,
                headers: {
                    'access-control-allow-origin': '*',
                    'access-control-allow-methods': 'POST, OPTIONS',
                    'access-control-allow-headers': '*',
                },
            });
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ state: 'requested' }),
        });
    });

    stage('open HTTPS host and expand injected bubble');
    await page.goto(hostUrl, { waitUntil: 'domcontentloaded' });
    let frameHost = page.locator('iframe[data-paws-agent-bubble="true"]');
    await frameHost.waitFor({ state: 'visible' });
    let extensionFrame = await waitForExtensionFrame(frameHost);
    await extensionFrame.evaluate(async ({ key, legacyUrl }) => {
        await chrome.storage.local.set({
            [key]: JSON.stringify({ serverUrl: legacyUrl, machineId: '', directory: '', sessionId: '' }),
        });
    }, { key: configKey, legacyUrl: legacyServerUrl });

    stage('reload and migrate legacy production configuration');
    await page.reload({ waitUntil: 'domcontentloaded' });
    frameHost = page.locator('iframe[data-paws-agent-bubble="true"]');
    await frameHost.waitFor({ state: 'visible' });
    extensionFrame = await waitForExtensionFrame(frameHost);

    const openButton = extensionFrame.getByRole('button', { name: '打开 Paws Agent' });
    await openButton.waitFor({ state: 'visible' });
    assert.equal(await openButton.isEnabled(), true, 'the bubble button must be enabled');
    await openButton.dispatchEvent('click');
    await waitForExpandedFrame(page);
    await extensionFrame.getByText('把这个浏览器连接到 Paws').waitFor();
    const serverInput = extensionFrame.getByLabel('Server URL');
    assert.equal(await serverInput.inputValue(), serverUrl, 'the production server URL must use the trusted HTTPS origin');
    const savedConfig = await extensionFrame.evaluate(async key => {
        const result = await chrome.storage.local.get(key);
        return result[key];
    }, configKey);
    assert.equal(JSON.parse(savedConfig).serverUrl, serverUrl, 'the migrated production server URL must be persisted');

    stage('request account link over HTTPS');
    const generateButton = extensionFrame.getByRole('button', { name: '生成绑定二维码' });
    await generateButton.waitFor({ state: 'visible' });
    assert.equal(await generateButton.isEnabled(), true, 'the account-link button must be enabled');
    await generateButton.dispatchEvent('click');
    try {
        await extensionFrame.getByAltText('Paws 设备绑定二维码').waitFor({
            state: 'visible',
            timeout: recording ? 20_000 : 10_000,
        });
    } catch (cause) {
        const panelText = await extensionFrame.locator('body').innerText().catch(() => 'panel unavailable');
        throw new Error(`QR code did not appear: ${JSON.stringify({ authRequests, panelText, pageErrors, consoleErrors, requestFailures })}`, { cause });
    }
    if (recording) await page.waitForTimeout(1_000);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert.equal(authRequests >= 1, true, 'the HTTPS account-link endpoint must be requested');
    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('; ')}`);
    assert.deepEqual(requestFailures, [], `request failures: ${JSON.stringify(requestFailures)}`);
    stage('case assertions passed');
} finally {
    stage('cleanup');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
}

let media = null;
if (recording && video) {
    const ffmpeg = await resolveExecutable(['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']);
    const ffprobe = await resolveExecutable(['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', 'ffprobe']);
    const rawVideoPath = await video.path();
    await exec(ffmpeg, [
        '-y', '-i', rawVideoPath,
        '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
        mp4Path,
    ]);
    await exec(ffmpeg, ['-v', 'error', '-i', mp4Path, '-f', 'null', '-']);
    const probe = await exec(ffprobe, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration,size',
        '-of', 'json', mp4Path,
    ]);
    media = JSON.parse(probe.stdout);
    assert.equal(media.streams?.[0]?.codec_name, 'h264');
    assert.equal(media.streams?.[0]?.pix_fmt, 'yuv420p');
    assert.equal(media.streams?.[0]?.width, 1280);
    assert.equal(media.streams?.[0]?.height, 720);
    await exec(ffmpeg, [
        '-y', '-i', mp4Path,
        '-vf', 'fps=1,scale=320:-1,tile=4x3:padding=4:margin=4', '-frames:v', '1',
        contactSheetPath,
    ]);
}

process.stdout.write(JSON.stringify({
    case: caseId,
    status: 'pass',
    mode: 'real-manifest-v3-extension-on-https-host',
    assertions: [
        'real chrome-extension frame injection',
        'trusted HTTPS production origin is the default',
        'legacy production origin is migrated in chrome.storage',
        'account-link request is not blocked as mixed content',
        'QR code becomes visible',
    ],
    sideEffects: 'routed HTTPS fixtures and disposable Chromium profile only',
    artifacts: { screenshotPath, ...(recording ? { mp4Path, contactSheetPath } : {}) },
    media,
}, null, 2) + '\n');

function stage(label) {
    process.stderr.write(`[${caseId}] ${label}\n`);
}

async function waitForExpandedFrame(targetPage) {
    await targetPage.waitForFunction(() => {
        const frame = document.querySelector('iframe[data-paws-agent-bubble="true"]');
        if (!frame) return false;
        const style = getComputedStyle(frame);
        return Number.parseFloat(style.width) >= 389 && Number.parseFloat(style.height) >= 639;
    });
}

async function waitForExtensionFrame(frameHost, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const handle = await frameHost.elementHandle();
        const extensionFrame = await handle?.contentFrame();
        if (extensionFrame?.url().startsWith('chrome-extension://')) {
            const ready = await extensionFrame.evaluate(() => document.readyState === 'complete' && Boolean(document.querySelector('#app button'))).catch(() => false);
            if (ready) return extensionFrame;
        }
        await frameHost.page().waitForTimeout(50);
    }
    throw new Error('the current injected chrome-extension frame did not finish loading');
}

async function resolveExecutable(candidates) {
    for (const candidate of candidates) {
        if (!candidate.includes('/')) return candidate;
        try {
            await access(candidate, constants.X_OK);
            return candidate;
        } catch {}
    }
    throw new Error(`Required executable is missing: ${candidates.join(', ')}`);
}
