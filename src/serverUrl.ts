export const DEFAULT_SERVER_URL = 'https://47.115.228.20:8443';

const LEGACY_PRODUCTION_URLS = new Set([
    'http://47.115.228.20:3005',
    'https://47.115.228.20:3005',
]);

export function normalizeServerUrl(value: unknown): string {
    if (typeof value !== 'string') return DEFAULT_SERVER_URL;
    const normalized = value.trim().replace(/\/+$/, '');
    if (!normalized || LEGACY_PRODUCTION_URLS.has(normalized)) return DEFAULT_SERVER_URL;
    return normalized;
}
