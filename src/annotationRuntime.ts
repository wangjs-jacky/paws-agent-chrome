import type { KeyValueStorage } from '@wangjs-jacky/paws-agent/browser';
import { normalizeAnnotation, pageKeyForUrl, type AnnotationBatch } from './annotations';
import type { AnnotationStore } from './annotationStore';
export type DraftSender = { id?: string; tab?: { id?: number }; frameId?: number; url?: string };
export function createAnnotationCoordinator(store: AnnotationStore, session: KeyValueStorage, extensionId: string) {
    const owners = new Map<number, Promise<string>>();
    async function owner(tab: number) {
        if (!owners.has(tab)) owners.set(tab, (async () => { const key = `paws.annotation-tab.${tab}`; const existing = await session.get(key); const nonce = existing || crypto.randomUUID(); if (!existing) await session.set(key, nonce); return `${tab}:${nonce}`; })());
        return owners.get(tab)!;
    }
    const handle = async (input: unknown, sender: DraftSender): Promise<{ ok: boolean; annotations?: unknown; url?: string; error?: string }> => {
        try {
            if (sender.id !== extensionId || !Number.isInteger(sender.tab?.id) || !sender.url) throw new Error('无效的扩展来源');
            const panel = sender.url === `chrome-extension://${extensionId}/panel.html`;
            if (panel ? !sender.frameId : sender.frameId !== 0) throw new Error('不允许此 frame');
            if (!input || typeof input !== 'object') throw new Error('无效消息');
            const m = input as Record<string, unknown>;
            if (!['annotations:list', 'annotations:upsert', 'annotations:remove', 'annotations:acknowledge'].includes(String(m.type))) throw new Error('不支持此操作');
            if (typeof m.url !== 'string') throw new Error('缺少页面身份');
            const key = pageKeyForUrl(m.url), tab = sender.tab!.id!;
            const currentKey = `paws.annotation-page.${tab}`;
            if (!panel) { if (sender.url !== m.url) throw new Error('页面身份不匹配'); await session.set(currentKey, m.url); }
            else if (await session.get(currentKey) !== m.url) throw new Error('页面已变化，请刷新批注');
            const id = await owner(tab);
            if (m.type === 'annotations:upsert') { const a = normalizeAnnotation(m.annotation); if (a.url !== m.url) throw new Error('批注来源不匹配'); await store.upsert(id, a); }
            if (m.type === 'annotations:remove') { if (typeof m.id !== 'string') throw new Error('批注 ID 无效'); await store.remove(id, key, m.id); }
            if (m.type === 'annotations:acknowledge') {
                if (!panel) throw new Error('仅扩展面板可确认发送');
                const batch = m.batch as AnnotationBatch;
                if (!batch || batch.pageKey !== key || typeof batch.id !== 'string' || !Array.isArray(batch.annotations) || batch.annotations.length > 20) throw new Error('无效批次');
                const annotations = batch.annotations.map(normalizeAnnotation); if (annotations.some(a => a.url !== m.url)) throw new Error('批次页面不匹配');
                await store.acknowledge(id, { ...batch, annotations });
            }
            return { ok: true, annotations: await store.list(id, key), url: m.url };
        } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : '批注存储失败' }; }
    };
    return Object.assign(handle, { async forgetTab(tab: number) {
        owners.delete(tab);
        await session.remove(`paws.annotation-tab.${tab}`);
        await session.remove(`paws.annotation-page.${tab}`);
    } });
}
export async function draftRequest(message: Record<string, unknown>) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok || !Array.isArray(result.annotations)) throw new Error(result?.error || '扩展批注存储不可用');
    return result.annotations.map(normalizeAnnotation);
}
