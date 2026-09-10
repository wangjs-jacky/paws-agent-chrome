export function sessionWebUrl(serverUrl: string, sessionId: string): string | null {
    if (!sessionId.trim() || sessionId === '.' || sessionId === '..') return null;
    try {
        const url = new URL(serverUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/session/${encodeURIComponent(sessionId)}`;
        url.search = '';
        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
}
