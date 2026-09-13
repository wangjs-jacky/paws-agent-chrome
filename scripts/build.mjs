import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPopupStyles } from './agentationStyles.mjs';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageDir, 'dist');
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
    absWorkingDir: packageDir,
    entryPoints: { content: 'src/content.ts', panel: 'src/panel.ts', background: 'src/background.ts' },
    outdir: 'dist',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['chrome120'],
    sourcemap: true,
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __PAWS_DEV_RELOAD_URL__: JSON.stringify(process.env.PAWS_EXTENSION_DEV_RELOAD_URL ?? ''),
    },
    logLevel: 'info',
    plugins: [{ name: 'agentation-shadow-styles', setup(build) {
        build.onLoad({ filter: /agentation\/dist\/index\.mjs$/ }, async args => {
            const result = extractPopupStyles(await readFile(args.path, 'utf8'));
            await writeFile(join(distDir, 'annotation-popup.css'), result.css);
            return { contents: result.source, loader: 'js', resolveDir: dirname(args.path) };
        });
    } }],
});

for (const file of ['manifest.json', 'panel.html']) {
    await cp(join(packageDir, 'static', file), join(distDir, file));
}
await cp(join(packageDir, 'src', 'styles.css'), join(distDir, 'styles.css'));
await cp(join(packageDir, 'THIRD_PARTY_NOTICES'), join(distDir, 'THIRD_PARTY_NOTICES'));

const manifestPath = join(distDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.version = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')).version;
if (process.env.PAWS_EXTENSION_INCLUDE_LOCALHOST === '1') {
    manifest.host_permissions.push('http://localhost/*', 'http://127.0.0.1/*');
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

process.stdout.write(`Built unpacked extension at ${distDir}\n`);
