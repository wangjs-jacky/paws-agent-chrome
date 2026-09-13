// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';

function transition(type: 'pagehide' | 'pageshow', persisted: boolean) {
    const event = new Event(type); Object.defineProperty(event, 'persisted', { value: persisted }); window.dispatchEvent(event);
}
beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path === 'panel.html' ? 'about:blank' : 'data:text/css,', sendMessage: async () => ({ ok: true, annotations: [] }) } });
    document.body.innerHTML = '<p id="passage">Native Messaging</p>'; history.replaceState({}, '', '/');
    await act(async () => { await import('../src/content'); await vi.advanceTimersByTimeAsync(1000); });
});
afterEach(async () => {
    await act(async () => { transition('pagehide', false); });
    document.querySelector('iframe')?.remove();
    vi.useRealTimers(); vi.unstubAllGlobals();
});
it('notifies the extension panel on SPA identity changes and stops on pagehide', async () => {
    const frame = document.querySelector('iframe')!; const notify = vi.spyOn(frame.contentWindow!, 'postMessage');
    await act(async () => { history.pushState({}, '', '/?route=second#conversation'); await vi.advanceTimersByTimeAsync(1000); });
    expect(notify.mock.calls.some(([m]) => m?.type === 'paws:page-context' && m.context.url.endsWith('?route=second#conversation'))).toBe(true);
    await act(async () => { transition('pagehide', false); }); notify.mockClear();
    await act(async () => { history.pushState({}, '', '/next'); await vi.advanceTimersByTimeAsync(1000); });
    expect(notify).not.toHaveBeenCalled();
    expect(document.querySelector('[data-paws-annotations]')).toBeNull();
});
it('restores one working overlay and SPA notifications after repeated BFCache returns', async () => {
    const frame = document.querySelector('iframe')!; const notify = vi.spyOn(frame.contentWindow!, 'postMessage');
    for (let cycle = 0; cycle < 2; cycle++) {
        await act(async () => { transition('pagehide', true); });
        expect(document.querySelector('[data-paws-annotations]')).toBeNull();
        await act(async () => { transition('pageshow', true); transition('pageshow', true); });
        expect(document.querySelectorAll('[data-paws-annotations]')).toHaveLength(1);
        const shadow = document.querySelector('[data-paws-annotations]')!.shadowRoot!;
        await act(async () => { [...shadow.querySelectorAll('button')].find(b => b.textContent === '开启批注')!.click(); document.querySelector<HTMLElement>('#passage')!.click(); });
        expect(shadow.querySelector('[data-annotation-popup]')).not.toBeNull();
        notify.mockClear();
        await act(async () => { history.pushState({}, '', `/?restored=${cycle}`); await vi.advanceTimersByTimeAsync(1000); });
        expect(notify.mock.calls.filter(([m]) => m?.type === 'paws:page-context' && m.context.url.endsWith(`?restored=${cycle}`))).toHaveLength(1);
    }
});
