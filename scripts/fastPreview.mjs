import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { assertPublishableTree, previewTag, verificationArgs } from './fastPreviewPolicy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'wangjs-jacky/paws-agent-chrome';
const started = Date.now();
function run(command, args, capture = false) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 120_000 });
    if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
    return capture ? result.stdout.trimEnd() : '';
}

try {
    const args = process.argv.slice(2).filter(arg => arg !== '--');
    if (args.includes('--help')) {
        console.log('pnpm preview:publish [--check] [--message "commit message"]\nStage approved files first. --check builds/packages locally without commit, push, tag or upload.');
    } else {
        const check = args[0] === '--check';
        const remaining = check ? args.slice(1) : args;
        if (remaining.length && (remaining.length !== 2 || remaining[0] !== '--message' || !remaining[1].trim())) throw new Error('Invalid arguments; use --help');
        const message = remaining[1] ?? 'chore: publish fast preview';
        const branch = run('git', ['symbolic-ref', '--short', 'HEAD'], true);
        if (!check && ['main', 'master'].includes(branch)) throw new Error('Use a feature branch; stable branch protection stays intact.');
        assertPublishableTree(run('git', ['status', '--porcelain=v1', '-z'], true));
        if (!check) {
            const remote = run('git', ['remote', 'get-url', 'origin'], true);
            if (!['https://github.com/' + repo + '.git', 'git@github.com:' + repo + '.git'].includes(remote)) throw new Error('Unexpected origin; refusing publication');
            run('gh', ['auth', 'status'], true);
        }
        const before = run('git', ['rev-parse', 'HEAD'], true);
        const tree = run('git', ['write-tree'], true);
        const files = run('git', ['diff', '--name-only', '-z', 'origin/main'], true).split('\0').filter(Boolean);
        run('pnpm', ['typecheck']);
        run('pnpm', verificationArgs(files));
        run('pnpm', ['build']);
        const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
        const output = mkdtempSync(resolve(tmpdir(), 'paws-fast-preview-'));
        run('node', ['scripts/packageRelease.mjs', '--tag', `v${version}`, '--output-dir', output]);
        const zip = resolve(output, `paws-agent-chrome-v${version}.zip`);
        const checksum = resolve(output, `paws-agent-chrome-v${version}.sha256`);
        const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
        if (readFileSync(checksum, 'utf8').split(/\s+/)[0] !== digest) throw new Error('Checksum mismatch');
        assertPublishableTree(run('git', ['status', '--porcelain=v1', '-z'], true));
        if (before !== run('git', ['rev-parse', 'HEAD'], true) || tree !== run('git', ['write-tree'], true)) throw new Error('Source changed during verification; rerun');
        if (check) {
            console.log(JSON.stringify({ status: 'local-only', zip, checksum, seconds: (Date.now() - started) / 1000 }));
        } else {
            if (run('git', ['diff', '--cached', '--name-only'], true)) run('git', ['commit', '-m', message]);
            const sha = run('git', ['rev-parse', 'HEAD'], true);
            // Hooks must not introduce unverified code into the published commit.
            assertPublishableTree(run('git', ['status', '--porcelain=v1', '-z'], true));
            if (tree !== run('git', ['rev-parse', 'HEAD^{tree}'], true) || tree !== run('git', ['write-tree'], true)) throw new Error('Commit hook changed the verified tree; rerun');
            const stamp = new Date().toISOString().replace(/[-:.]/g, '');
            const tag = previewTag(version, sha, stamp);
            run('git', ['tag', tag, sha]);
            console.log(`Publishing ${tag} at ${sha}. On failure, existing commits/tags are retained; nothing is force-overwritten.`);
            run('git', ['push', '--atomic', 'origin', `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`]);
            const ci = `https://github.com/${repo}/actions?query=branch%3A${encodeURIComponent(tag)}`;
            run('gh', ['release', 'create', tag, zip, checksum, '--repo', repo, '--verify-tag', '--prerelease', '--latest=false', '--title', tag,
                '--notes', `Fast preview — NOT a stable release.\nCommit: ${sha}\nManifest version: ${version}\nLocal typecheck, selected unit tests, build and SHA256 passed. Browser acceptance was NOT run locally. Full CI runs asynchronously; inspect its result before trusting this preview.\nCI: ${ci}\nInstall unpacked; preview builds can share the same Chrome manifest version.`]);
            const release = JSON.parse(run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'url,isPrerelease,assets'], true));
            if (!release.isPrerelease || release.assets.length !== 2) throw new Error('Release verification failed');
            console.log(JSON.stringify({ url: release.url, download: release.assets.find(asset => asset.name.endsWith('.zip'))?.url, ci, verification: 'fast-only; full CI pending', seconds: (Date.now() - started) / 1000 }));
        }
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
