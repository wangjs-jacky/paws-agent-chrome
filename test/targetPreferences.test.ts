import { describe, expect, it } from 'vitest';
import type { Machine, Session } from '@wangjs-jacky/paws-agent';
import {
    machineDisplayName,
    machineHomeDirectory,
    recentDirectoriesForMachine,
    resolvePreferredDirectory,
    sortMachinesForPicker,
} from '../src/targetPreferences';

function machine(overrides: Partial<Machine> & Pick<Machine, 'id'>): Machine {
    const { id, ...rest } = overrides;
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 0,
        metadata: null,
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
        ...rest,
    };
}

function session(id: string, machineId: string, path: unknown, updatedAt: number): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt,
        active: false,
        activeAt: updatedAt,
        metadata: { machineId, path },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
    };
}

describe('target preferences', () => {
    it('uses displayName, then host, before falling back to the machine id', () => {
        expect(machineDisplayName(machine({ id: 'one', metadata: { displayName: 'Mac mini', host: 'ignored' } }))).toBe('Mac mini');
        expect(machineDisplayName(machine({ id: 'two', metadata: { host: 'studio.local' } }))).toBe('studio.local');
        expect(machineDisplayName(machine({ id: '434a7ba3-rest' }))).toBe('机器 434a7ba3');
    });

    it('reads the machine home directory only from valid metadata', () => {
        expect(machineHomeDirectory(machine({ id: 'one', metadata: { homeDir: '/Users/jacky' } }))).toBe('/Users/jacky');
        expect(machineHomeDirectory(machine({ id: 'two', metadata: { homeDir: '' } }))).toBe('');
    });

    it('sorts online machines first and newest activity first within each group', () => {
        const result = sortMachinesForPicker([
            machine({ id: 'offline-new', active: false, activeAt: 40 }),
            machine({ id: 'online-old', active: true, activeAt: 10 }),
            machine({ id: 'online-new', active: true, activeAt: 30 }),
            machine({ id: 'offline-old', active: false, activeAt: 20 }),
        ]);
        expect(result.map(item => item.id)).toEqual(['online-new', 'online-old', 'offline-new', 'offline-old']);
    });

    it('builds recent unique directories for only the selected machine', () => {
        const result = recentDirectoriesForMachine([
            session('old', 'machine-1', '/Users/jacky/old', 10),
            session('other', 'machine-2', '/Users/other/project', 50),
            session('new', 'machine-1', '/Users/jacky/new', 40),
            session('duplicate', 'machine-1', '/Users/jacky/old', 30),
            session('invalid', 'machine-1', null, 60),
        ], 'machine-1');
        expect(result).toEqual(['/Users/jacky/new', '/Users/jacky/old']);
    });

    it('prefers per-machine saved path, then recent session path, then home', () => {
        expect(resolvePreferredDirectory({
            machineId: 'machine-1',
            directoriesByMachine: { 'machine-1': '/saved' },
            recentDirectories: ['/recent'],
            homeDirectory: '/home',
        })).toBe('/saved');
        expect(resolvePreferredDirectory({
            machineId: 'machine-1',
            directoriesByMachine: {},
            recentDirectories: ['/recent'],
            homeDirectory: '/home',
        })).toBe('/recent');
        expect(resolvePreferredDirectory({
            machineId: 'machine-1',
            directoriesByMachine: {},
            recentDirectories: [],
            homeDirectory: '/home',
        })).toBe('/home');
    });
});
