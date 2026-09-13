// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { mountAnnotationOverlay } from '../src/annotationOverlay';
import { AnnotationStore } from '../src/annotationStore';
import { createAnnotationCoordinator } from '../src/annotationRuntime';
let stop: (() => void) | undefined;
afterEach(async () => { await act(async () => { stop?.(); stop = undefined; }); vi.unstubAllGlobals(); });
it('keeps mode off passive; real Agentation popup saves, edits, cancels and tears down without localStorage', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const values = new Map<string, string>(); const storage = { get: async (k: string) => values.get(k) ?? null, set: async (k: string, v: string) => { values.set(k, v); }, remove: async (k: string) => { values.delete(k); } };
    const handle = createAnnotationCoordinator(new AnnotationStore(storage), storage, 'ext');
    vi.stubGlobal('chrome', { runtime: { getURL: () => 'data:text/css,', sendMessage: (m: unknown) => handle(m, { id: 'ext', tab: { id: 1 }, frameId: 0, url: location.href }) } });
    const localWrites = vi.spyOn(Storage.prototype, 'setItem');
    document.body.innerHTML = '<p id="passage">Native Messaging</p><p>second paragraph</p>';
    await act(async () => { stop = mountAnnotationOverlay(); });
    const shadow = document.querySelector('[data-paws-annotations]')!.shadowRoot!;
    const click = async (label: string) => { await act(async () => { [...shadow.querySelectorAll('button')].find(b => b.textContent === label)!.click(); }); };
    const passive = new MouseEvent('click', { bubbles: true, cancelable: true }); document.querySelector('p')!.dispatchEvent(passive); expect(passive.defaultPrevented).toBe(false);
    await click('开启批注');
    const range = document.createRange(); range.setStart(document.querySelector('p')!.firstChild!, 0); range.setEnd(document.querySelectorAll('p')[1].firstChild!, 6);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    await act(async () => { document.querySelector<HTMLElement>('p')!.click(); });
    expect(shadow.querySelector('[data-annotation-popup]')).toBeNull();
    window.getSelection()!.removeAllRanges();
    await act(async () => { document.querySelector<HTMLElement>('p')!.click(); });
    expect(shadow.querySelector('[data-annotation-popup]')).not.toBeNull();
    const write = async (text: string) => { await act(async () => { const t = shadow.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, text); t.dispatchEvent(new Event('input', { bubbles: true, composed: true })); }); };
    await write('为什么需要桥接？'); await click('保存批注');
    expect([...values.values()].join('')).toContain('为什么需要桥接？');
    expect(parseFloat(getComputedStyle(shadow.querySelector('.item button')!).minWidth)).toBe(0);
    expect(getComputedStyle(shadow.querySelector('.item button:nth-child(2)')!).flexShrink).toBe('0');
    const schedule = vi.spyOn(window, 'requestAnimationFrame');
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('scroll'));
    expect(schedule).toHaveBeenCalledTimes(1); schedule.mockRestore();
    await click('编辑 1'); await write('edited question'); await click('保存批注'); expect([...values.values()].join('')).toContain('edited question');
    await click('编辑 1'); await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); expect(shadow.querySelector('textarea')).toBeNull();
    expect(localWrites).not.toHaveBeenCalled(); localWrites.mockRestore();
    await act(async () => { stop?.(); stop = undefined; }); expect(document.querySelector('[data-paws-annotations]')).toBeNull();
});
it.each(['success', 'failure'])('keeps a newer popup question when an earlier cancelled save finishes with %s', async outcome => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const values = new Map<string, string>();
    let releaseSave!: () => void;
    let deferSave = true;
    const storage = {
        get: async (key: string) => values.get(key) ?? null,
        set: async (key: string, value: string) => {
            if (key.startsWith('paws.annotations.') && deferSave) {
                deferSave = false;
                await new Promise<void>((resolve, reject) => { releaseSave = () => outcome === 'success' ? resolve() : reject(new Error('question A storage failed')); });
            }
            values.set(key, value);
        },
        remove: async (key: string) => { values.delete(key); },
    };
    const handle = createAnnotationCoordinator(new AnnotationStore(storage), storage, 'ext');
    vi.stubGlobal('chrome', { runtime: { getURL: () => 'data:text/css,', sendMessage: (m: unknown) => handle(m, { id: 'ext', tab: { id: 1 }, frameId: 0, url: location.href }) } });
    document.body.innerHTML = '<p id="first">first passage</p><p id="second">second passage</p>';
    await act(async () => { stop = mountAnnotationOverlay(); });
    const shadow = document.querySelector('[data-paws-annotations]')!.shadowRoot!;
    const click = async (label: string) => { await act(async () => { [...shadow.querySelectorAll('button')].find(b => b.textContent === label)!.click(); }); };
    const write = async (text: string) => { await act(async () => { const t = shadow.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, text); t.dispatchEvent(new Event('input', { bubbles: true, composed: true })); }); };
    await click('开启批注');
    await act(async () => { document.querySelector<HTMLElement>('#first')!.click(); });
    await write('question A'); await click('保存批注'); expect(releaseSave).toBeTypeOf('function');
    await click('Cancel'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    await act(async () => { document.querySelector<HTMLElement>('#second')!.click(); });
    await write('unsaved question B');
    await act(async () => { releaseSave(); });
    expect(shadow.querySelector('textarea')?.value).toBe('unsaved question B');
    if (outcome === 'success') expect([...values.values()].join('')).toContain('question A');
    else expect(shadow.textContent).not.toContain('question A storage failed');
    expect([...values.values()].join('')).not.toContain('unsaved question B');
    await click('保存批注');
    expect([...values.values()].join('')).toContain('unsaved question B');
});
