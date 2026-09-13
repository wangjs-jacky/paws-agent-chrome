import { describe, expect, it } from 'vitest';
import { previewTag, assertPublishableTree, verificationArgs } from '../scripts/fastPreviewPolicy.mjs';

describe('fast preview policy', () => {
    it('uses a unique preview namespace outside stable release tags', () => {
        expect(previewTag('0.0.7', 'abcdef1234567890', '20260913T120000000Z')).toBe('preview-0.0.7-20260913T120000000Z-abcdef123456');
        expect(() => previewTag('../bad', 'abcdef1234567890', '20260913T120000000Z')).toThrow();
    });
    it('accepts only clean or explicitly staged changes', () => {
        expect(() => assertPublishableTree('M  src/panel.ts\0A  test/new.ts\0')).not.toThrow();
        expect(() => assertPublishableTree('')).not.toThrow();
        for (const state of [' M src/panel.ts\0', 'MM src/panel.ts\0', '?? secrets.txt\0', 'UU src/panel.ts\0']) {
            expect(() => assertPublishableTree(state)).toThrow();
        }
    });
    it('selects related tests for source changes and full tests for infrastructure', () => {
        expect(verificationArgs(['src/panel.ts'])).toEqual(['exec', 'vitest', 'related', '--run', '--maxWorkers=2', '--passWithNoTests', 'src/panel.ts']);
        expect(verificationArgs(['package.json'])).toEqual(['exec', 'vitest', 'run', '--maxWorkers=2']);
        expect(verificationArgs(['scripts/build.mjs'])).toEqual(['exec', 'vitest', 'run', '--maxWorkers=2']);
    });
});
