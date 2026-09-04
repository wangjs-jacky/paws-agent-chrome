import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';

const releaseScript = resolve('scripts/packageRelease.mjs');
const extensionFiles = [
    'content.js',
    'content.js.map',
    'manifest.json',
    'panel.html',
    'panel.js',
    'panel.js.map',
    'styles.css',
];
const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('release packager', () => {
    test('creates a root-level extension ZIP and a verifiable SHA256 file', async () => {
        const fixture = await createFixture();
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status, result.stderr).toBe(0);
        const zipPath = join(fixture.outputDir, 'paws-agent-chrome-v0.0.3.zip');
        const checksumPath = join(fixture.outputDir, 'paws-agent-chrome-v0.0.3.sha256');
        const checksum = await readFile(checksumPath, 'utf8');
        const actualHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
        expect(checksum).toBe(`${actualHash}  ${basename(zipPath)}\n`);

        const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
        expect(listing.status, listing.stderr).toBe(0);
        expect(listing.stdout.trim().split('\n').sort()).toEqual(extensionFiles);

        const manifestResult = spawnSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' });
        expect(manifestResult.status, manifestResult.stderr).toBe(0);
        const manifest = JSON.parse(manifestResult.stdout);
        expect(manifest.version).toBe('0.0.3');
        expect(manifest.host_permissions).toEqual(['https://47.115.228.20:8443/*']);
    });

    test('accepts the package-manager argument separator', async () => {
        const fixture = await createFixture();
        const result = spawnSync(process.execPath, [
            releaseScript,
            '--',
            '--project-dir', fixture.projectDir,
            '--output-dir', fixture.outputDir,
            '--tag', 'v0.0.3',
        ], { encoding: 'utf8' });

        expect(result.status, result.stderr).toBe(0);
    });

    test('rejects a tag that does not match the package version', async () => {
        const fixture = await createFixture();
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.4');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Tag v0.0.4 does not match package version 0.0.3');
    });

    test('rejects a manifest version that does not match the package version', async () => {
        const fixture = await createFixture({ manifestVersion: '0.0.2' });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Manifest version 0.0.2 does not match package version 0.0.3');
    });

    test('rejects incomplete build output', async () => {
        const fixture = await createFixture();
        await rm(join(fixture.projectDir, 'dist', 'panel.js'));
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Build output does not match the release contract');
    });

    test('rejects localhost permissions in a production build', async () => {
        const fixture = await createFixture({ localhost: true });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Production extension must not request localhost permissions');
    });

    test('rejects unexpected production host permissions', async () => {
        const fixture = await createFixture({ extraHostPermission: 'https://*/*' });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Production extension has unexpected host permissions');
    });

    test('rejects unexpected privileged extension permissions', async () => {
        const fixture = await createFixture({ permissions: ['storage', 'tabs'] });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Production extension has unexpected permissions');
    });

    test('rejects optional production host permissions', async () => {
        const fixture = await createFixture({ optionalHostPermissions: ['<all_urls>'] });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Production extension must not declare optional host permissions');
    });

    test('rejects optional privileged extension permissions', async () => {
        const fixture = await createFixture({ optionalPermissions: ['cookies'] });
        const result = runPackager(fixture.projectDir, fixture.outputDir, 'v0.0.3');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Production extension must not declare optional permissions');
    });
});

function runPackager(projectDir: string, outputDir: string, tag: string) {
    return spawnSync(process.execPath, [
        releaseScript,
        '--project-dir', projectDir,
        '--output-dir', outputDir,
        '--tag', tag,
    ], { encoding: 'utf8' });
}

async function createFixture(options: {
    extraHostPermission?: string;
    localhost?: boolean;
    manifestVersion?: string;
    optionalHostPermissions?: string[];
    optionalPermissions?: string[];
    permissions?: string[];
} = {}) {
    const projectDir = await mkdtemp(join(tmpdir(), 'paws-agent-chrome-release-'));
    temporaryDirectories.push(projectDir);
    const distDir = join(projectDir, 'dist');
    const outputDir = join(projectDir, 'release-artifacts');
    await mkdir(distDir);
    await writeFile(join(projectDir, 'package.json'), JSON.stringify({
        name: '@wangjs-jacky/paws-agent-chrome',
        version: '0.0.3',
    }));
    const manifest = {
        manifest_version: 3,
        name: 'Paws Agent',
        version: options.manifestVersion ?? '0.0.3',
        permissions: options.permissions ?? ['storage'],
        optional_permissions: options.optionalPermissions,
        optional_host_permissions: options.optionalHostPermissions,
        host_permissions: [
            'https://47.115.228.20:8443/*',
            ...(options.localhost ? ['http://localhost/*'] : []),
            ...(options.extraHostPermission ? [options.extraHostPermission] : []),
        ],
    };
    for (const file of extensionFiles) {
        const contents = file === 'manifest.json' ? JSON.stringify(manifest) : `fixture:${file}\n`;
        await writeFile(join(distDir, file), contents);
    }
    return { outputDir, projectDir };
}
