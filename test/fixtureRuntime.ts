// Synthetic same-origin runtime for local UI evaluation only. This is NOT MV3
// and its credentials are deliberately fake and observable by the fixture.
import { AnnotationStore } from '../src/annotationStore';
import { createAnnotationCoordinator } from '../src/annotationRuntime';
declare global { interface Window { __pawsDrafts: ReturnType<typeof createAnnotationCoordinator>; __pawsTab: number } }
const panel = location.pathname === '/panel.html';
const host = panel ? window.parent : window;
const area = (name: string) => ({
    async get(key: string) { return fetch('/__fixture-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: name, op: 'get', key }) }).then(r => r.json()); },
    async set(items: Record<string, unknown>) { const r = await fetch('/__fixture-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: name, op: 'set', items }) }); if (!r.ok) throw new Error('synthetic storage quota'); },
    async remove(key: string) { const r = await fetch('/__fixture-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: name, op: 'remove', key }) }); if (!r.ok) throw new Error('synthetic storage failure'); },
});
const local = area('local'), session = area('session');
const adapter = (a: typeof local) => ({ get: async (key: string) => { const v = (await a.get(key))[key]; return typeof v === 'string' ? v : null; }, set: async (key: string, value: string) => a.set({ [key]: value }), remove: a.remove });
if (!panel) {
    let tab = sessionStorage.getItem('paws-fixture-tab'); if (!tab) { tab = String(Math.floor(Math.random() * 1e9)); sessionStorage.setItem('paws-fixture-tab', tab); }
    host.__pawsTab = Number(tab);
    host.__pawsDrafts = createAnnotationCoordinator(new AnnotationStore(adapter(local)), adapter(session), 'fixture-extension');
}
Object.assign(globalThis, { chrome: { runtime: { id: 'fixture-extension', getURL: (file: string) => new URL(file, location.origin).href, sendMessage: (message: unknown) => host.__pawsDrafts(message, { id: 'fixture-extension', tab: { id: host.__pawsTab }, frameId: panel ? 1 : 0, url: panel ? 'chrome-extension://fixture-extension/panel.html' : location.href }) }, storage: { local, session } } });
