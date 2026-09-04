import type { Machine, Session } from '@wangjs-jacky/paws-agent';

type PreferredDirectoryInput = {
    machineId: string;
    directoriesByMachine: Record<string, string>;
    recentDirectories: string[];
    homeDirectory: string;
};

export function machineDisplayName(machine: Machine): string {
    const metadata = record(machine.metadata);
    for (const key of ['displayName', 'host']) {
        const value = metadata?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return `机器 ${machine.id.slice(0, 8)}`;
}

export function machineHomeDirectory(machine: Machine | undefined): string {
    const value = record(machine?.metadata)?.homeDir;
    return typeof value === 'string' ? value.trim() : '';
}

export function sortMachinesForPicker(machines: Machine[]): Machine[] {
    return [...machines].sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        return right.activeAt - left.activeAt;
    });
}

export function recentDirectoriesForMachine(
    sessions: Session[],
    machineId: string,
    limit = 8,
): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const newestFirst = [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
    for (const session of newestFirst) {
        const metadata = record(session.metadata);
        const path = metadata?.path;
        if (metadata?.machineId !== machineId || typeof path !== 'string' || !path.trim()) continue;
        const normalized = path.trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
        if (result.length >= limit) break;
    }
    return result;
}

export function resolvePreferredDirectory(input: PreferredDirectoryInput): string {
    const saved = input.directoriesByMachine[input.machineId]?.trim();
    if (saved) return saved;
    const recent = input.recentDirectories.find(path => path.trim())?.trim();
    if (recent) return recent;
    return input.homeDirectory.trim() || '~';
}

function record(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
