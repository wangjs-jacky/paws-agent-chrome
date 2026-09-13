import type { KeyValueStorage } from '@wangjs-jacky/paws-agent/browser';
import { normalizeAnnotation, type AnnotationBatch, type PageAnnotation } from './annotations';
export class AnnotationStore {
    private pending = new Map<string, Promise<unknown>>();
    constructor(private storage: KeyValueStorage) {}
    private key(owner: string, pageKey: string) { return `paws.annotations.${encodeURIComponent(owner)}.${pageKey}`; }
    private async read(key: string): Promise<PageAnnotation[]> {
        const raw = await this.storage.get(key); if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.annotations) || parsed.annotations.length > 20) throw new Error('保存的批注数据损坏');
        const items = parsed.annotations.map(normalizeAnnotation) as PageAnnotation[];
        if (new Set(items.map(a => a.id)).size !== items.length) throw new Error('批注 ID 重复');
        return items;
    }
    async list(owner: string, pageKey: string) { const key = this.key(owner, pageKey); await this.pending.get(key)?.catch(() => {}); const items = await this.read(key); if (items.some(a => a.pageKey !== pageKey)) throw new Error('批注页面身份无效'); return items; }
    private mutate(owner: string, pageKey: string, change: (items: PageAnnotation[]) => PageAnnotation[]): Promise<void> {
        const key = this.key(owner, pageKey);
        const next = (this.pending.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
            const items = change(await this.read(key)); if (items.length > 20) throw new Error('每页最多 20 条批注');
            await this.storage.set(key, JSON.stringify({ schemaVersion: 1, annotations: items }));
        });
        this.pending.set(key, next); void next.finally(() => { if (this.pending.get(key) === next) this.pending.delete(key); }).catch(() => {}); return next;
    }
    upsert(owner: string, value: PageAnnotation) { const a = normalizeAnnotation(value); return this.mutate(owner, a.pageKey, items => { const old = items.find(item => item.id === a.id); if (old && a.revision <= old.revision) throw new Error('批注已更新，请刷新后编辑'); return old ? items.map(item => item.id === a.id ? a : item) : [...items, a]; }); }
    remove(owner: string, pageKey: string, id: string) { return this.mutate(owner, pageKey, items => items.filter(a => a.id !== id)); }
    acknowledge(owner: string, batch: AnnotationBatch) { return this.mutate(owner, batch.pageKey, items => items.filter(a => !batch.annotations.some(sent => sent.id === a.id && sent.revision === a.revision))); }
}
