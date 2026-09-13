export function previewTag(version, sha, stamp) {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$|^[a-f0-9]{16}$/.test(sha) || !/^\d{8}T\d{9}Z$/.test(stamp)) throw new Error('Invalid preview identity');
    return `preview-${version}-${stamp}-${sha.slice(0, 12)}`;
}

export function assertPublishableTree(status) {
    const records = status.split('\0');
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record) continue;
        if (!/^[ MADRC] /.test(record)) throw new Error('Stage only approved files and resolve unstaged/untracked changes before publishing.');
        if (/^[RC]/.test(record)) i++; // porcelain -z includes the original path
    }
}

export function verificationArgs(files) {
    if (!files.length || files.some(file => !/^(src|test)\//.test(file))) return ['exec', 'vitest', 'run', '--maxWorkers=2'];
    return ['exec', 'vitest', 'related', '--run', '--maxWorkers=2', '--passWithNoTests', ...files];
}
