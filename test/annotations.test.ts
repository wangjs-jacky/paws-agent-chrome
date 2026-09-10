import { describe, expect, it } from 'vitest';
import { composeAnnotationPrompt, createAnnotationBatch, normalizeAnnotation, pageKeyForUrl } from '../src/annotations';
import { annotation } from './annotationFixture';
describe('annotation prompts and validation', () => {
    it('preserves the question and bounded untrusted context without sensitive URL parts', () => {
        const prompt = composeAnnotationPrompt('', [annotation], false);
        expect(prompt).toContain('为什么需要桥接？'); expect(prompt).toContain('Native Messaging');
        expect(prompt).toContain('Browser uses '); expect(prompt).not.toContain('token=secret');
        expect(composeAnnotationPrompt('', [annotation], true)).toContain('token=secret');
    });
    it('caps quote/context visibly but rejects excessive questions and batches', () => {
        const capped = normalizeAnnotation({ ...annotation, quote: 'q'.repeat(6001), prefix: 'p'.repeat(1500), suffix: 's'.repeat(1500) });
        expect(capped.quote).toHaveLength(6000); expect(capped.prefix.length + capped.suffix.length).toBeLessThanOrEqual(2000); expect(capped.truncated).toBe(true);
        expect(composeAnnotationPrompt('', [capped], false)).toContain('截断');
        expect(() => normalizeAnnotation({ ...annotation, comment: 'x'.repeat(2001) })).toThrow();
        expect(() => composeAnnotationPrompt('x'.repeat(40001), [annotation], false)).toThrow();
        expect(() => createAnnotationBatch('', Array.from({ length: 21 }, (_, i) => ({ ...annotation, id: String(i) })), false)).toThrow();
    });
    it('freezes independent revisions and separates SPA page identities', () => {
        const input = { ...annotation }; const batch = createAnnotationBatch('', [input], false); input.comment = 'changed';
        expect(batch.annotations[0].comment).toBe('为什么需要桥接？'); expect(Object.isFrozen(batch.annotations[0])).toBe(true);
        expect(pageKeyForUrl('https://example.com/?a=1')).not.toBe(pageKeyForUrl('https://example.com/?a=2'));
        expect(pageKeyForUrl('https://example.com/#a')).not.toBe(pageKeyForUrl('https://example.com/#b'));
        expect(() => normalizeAnnotation({ ...annotation, revision: -1 })).toThrow();
    });
});
