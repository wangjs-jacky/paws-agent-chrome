import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const extensionFiles = [
    'content.js',
    'content.js.map',
    'manifest.json',
    'panel.html',
    'panel.js',
    'panel.js.map',
    'styles.css',
];

try {
    const options = parseArguments(process.argv.slice(2));
    const packageDir = options.projectDir
        ? resolve(options.projectDir)
        : join(dirname(fileURLToPath(import.meta.url)), '..');
    const outputDir = options.outputDir
        ? resolve(options.outputDir)
        : join(packageDir, 'release-artifacts');
    await packageRelease({ packageDir, outputDir, tag: options.tag });
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
}

async function packageRelease({ packageDir, outputDir, tag }) {
    const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
    if (!tag) throw new Error('Missing required --tag vX.Y.Z argument');
    if (tag !== `v${packageJson.version}`) {
        throw new Error(`Tag ${tag} does not match package version ${packageJson.version}`);
    }

    const distDir = join(packageDir, 'dist');
    const entries = await readdir(distDir, { withFileTypes: true }).catch(() => []);
    const actualFiles = entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
    const unexpectedEntries = entries.filter(entry => !entry.isFile()).map(entry => entry.name);
    if (unexpectedEntries.length > 0 || JSON.stringify(actualFiles) !== JSON.stringify(extensionFiles)) {
        throw new Error(
            `Build output does not match the release contract: expected ${extensionFiles.join(', ')}, found ${entries.map(entry => entry.name).sort().join(', ') || 'nothing'}`,
        );
    }

    const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
    if (manifest.version !== packageJson.version) {
        throw new Error(`Manifest version ${manifest.version ?? 'missing'} does not match package version ${packageJson.version}`);
    }
    if (manifest.manifest_version !== 3) {
        throw new Error('Release build must use Manifest V3');
    }
    const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
    if (hostPermissions.some(permission => /localhost|127\.0\.0\.1/i.test(permission))) {
        throw new Error('Production extension must not request localhost permissions');
    }
    if (!hostPermissions.includes('https://47.115.228.20:8443/*')) {
        throw new Error('Production extension must allow the trusted HTTPS service origin');
    }
    if (hostPermissions.some(permission => permission.startsWith('http://47.115.228.20:'))) {
        throw new Error('Production extension must not allow the legacy plaintext service origin');
    }

    await mkdir(outputDir, { recursive: true });
    const artifactBase = `paws-agent-chrome-${tag}`;
    const zipPath = join(outputDir, `${artifactBase}.zip`);
    const checksumPath = join(outputDir, `${artifactBase}.sha256`);
    await Promise.all([
        rm(zipPath, { force: true }),
        rm(checksumPath, { force: true }),
    ]);

    const zip = spawnSync('zip', ['-X', '-q', zipPath, ...extensionFiles], {
        cwd: distDir,
        encoding: 'utf8',
    });
    if (zip.error) throw new Error(`Unable to run zip: ${zip.error.message}`);
    if (zip.status !== 0) {
        throw new Error(`zip failed with exit code ${zip.status}: ${zip.stderr.trim()}`);
    }

    const checksum = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFile(checksumPath, `${checksum}  ${artifactBase}.zip\n`);
    process.stdout.write(JSON.stringify({ checksumPath, tag, version: packageJson.version, zipPath }) + '\n');
}

function parseArguments(args) {
    const options = {};
    const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
    for (let index = 0; index < normalizedArgs.length; index += 2) {
        const flag = normalizedArgs[index];
        const value = normalizedArgs[index + 1];
        if (!value || !['--tag', '--project-dir', '--output-dir'].includes(flag)) {
            throw new Error(`Invalid release argument: ${flag ?? 'missing'}`);
        }
        if (flag === '--tag') options.tag = value;
        if (flag === '--project-dir') options.projectDir = value;
        if (flag === '--output-dir') options.outputDir = value;
    }
    return options;
}
