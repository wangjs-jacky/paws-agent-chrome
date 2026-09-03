import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, normalizeServerUrl } from '../src/serverUrl';

describe('normalizeServerUrl', () => {
    it('uses the trusted production HTTPS origin by default', () => {
        expect(normalizeServerUrl(undefined)).toBe(DEFAULT_SERVER_URL);
        expect(normalizeServerUrl('')).toBe(DEFAULT_SERVER_URL);
        expect(DEFAULT_SERVER_URL).toBe('https://47.115.228.20:8443');
    });

    it.each([
        'http://47.115.228.20:3005',
        'http://47.115.228.20:3005/',
        'https://47.115.228.20:3005',
    ])('migrates the legacy production origin %s', legacyUrl => {
        expect(normalizeServerUrl(legacyUrl)).toBe(DEFAULT_SERVER_URL);
    });

    it('preserves custom self-hosted origins while removing trailing slashes', () => {
        expect(normalizeServerUrl(' https://paws.example.com/// ')).toBe('https://paws.example.com');
        expect(normalizeServerUrl('http://127.0.0.1:3005/')).toBe('http://127.0.0.1:3005');
    });
});
