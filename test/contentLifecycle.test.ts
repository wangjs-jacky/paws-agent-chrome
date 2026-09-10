// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
vi.mock('../src/annotationOverlay', () => ({ mountAnnotationOverlay: () => () => {} }));
it('notifies the extension panel on SPA identity changes and stops on pagehide', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', { runtime: { getURL: () => 'about:blank' } });
    document.body.innerHTML = ''; history.replaceState({}, '', '/');
    await import('../src/content');
    const frame = document.querySelector('iframe')!; const notify = vi.spyOn(frame.contentWindow!, 'postMessage');
    await vi.advanceTimersByTimeAsync(1000); notify.mockClear();
    history.pushState({}, '', '/?route=second#conversation'); await vi.advanceTimersByTimeAsync(1000);
    expect(notify.mock.calls.some(([m]) => m?.type === 'paws:page-context' && m.context.url.endsWith('?route=second#conversation'))).toBe(true);
    window.dispatchEvent(new Event('pagehide')); notify.mockClear(); history.pushState({}, '', '/next'); await vi.advanceTimersByTimeAsync(1000); expect(notify).not.toHaveBeenCalled();
    frame.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
