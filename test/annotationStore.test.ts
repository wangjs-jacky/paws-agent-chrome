import { expect, it } from 'vitest';
import { AnnotationStore } from '../src/annotationStore';
import { createAnnotationBatch } from '../src/annotations';
import { annotation } from './annotationFixture';
function fixture() { const data = new Map<string, string>(); const storage = { get: async (k: string) => data.get(k) ?? null, set: async (k: string, v: string) => { data.set(k, v); }, remove: async (k: string) => { data.delete(k); } }; return { data, storage, store: new AnnotationStore(storage) }; }
it('serializes collection mutations and acknowledges only unchanged snapshot revisions', async () => {
    const { store } = fixture(); await store.upsert('tab-a', annotation); const batch = createAnnotationBatch('', [annotation], false);
    await Promise.all([store.upsert('tab-a', { ...annotation, revision: 2, comment: 'edited' }), store.upsert('tab-a', { ...annotation, id: 'new' })]);
    await store.acknowledge('tab-a', batch);
    expect((await store.list('tab-a', annotation.pageKey)).map(a => a.comment)).toEqual(['edited', '为什么需要桥接？']);
    expect(await store.list('tab-b', annotation.pageKey)).toEqual([]);
    await store.remove('tab-a', annotation.pageKey, 'new'); expect(await store.list('tab-a', annotation.pageKey)).toHaveLength(1);
});
it('restores validated data and reports persistence failures', async () => {
    const { store, storage, data } = fixture(); await store.upsert('tab-a', annotation);
    expect(await new AnnotationStore(storage).list('tab-a', annotation.pageKey)).toHaveLength(1);
    data.set([...data.keys()][0], '{"schemaVersion":1,"annotations":[{}]}');
    await expect(store.list('tab-a', annotation.pageKey)).rejects.toThrow();
    storage.set = async () => { throw new Error('quota'); };
    await expect(store.upsert('tab-b', annotation)).rejects.toThrow('quota');
});
