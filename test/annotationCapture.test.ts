// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { captureElement, captureSelection, findAnnotationTarget } from '../src/annotationCapture';
it('rejects form/editable/hidden content including nested secrets', () => {
    document.body.innerHTML = '<p>Native Messaging<span hidden>hidden secret</span></p><input type="password" value="secret"><div contenteditable="true">private</div><div style="display:none">hidden</div>';
    expect(captureElement(document.querySelector('input')!)).toBeNull();
    expect(captureElement(document.querySelector('[contenteditable]')!)).toBeNull();
    expect(captureElement(document.querySelector('div[style]')!)).toBeNull();
    expect(captureElement(document.querySelector('p')!)?.quote).toBe('Native Messaging');
});
it('captures selected text and local context without ancestor full text', () => {
    document.body.innerHTML = '<main><p>Outside secret</p><p>Browser uses Native Messaging today</p><p>Other secret</p></main>';
    const text = document.querySelectorAll('p')[1].firstChild!; const range = document.createRange(); range.setStart(text, 13); range.setEnd(text, 29); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    const captured = captureSelection(); expect(captured?.quote).toBe('Native Messaging'); expect(captured?.prefix).toBe('Browser uses '); expect(JSON.stringify(captured)).not.toContain('Outside secret');
});
it('never relocates an ambiguous or missing quote using a stale selector alone', () => {
    document.body.innerHTML = '<p id="old">changed</p><p>same</p><p>same</p>';
    expect(findAnnotationTarget({ quote: 'same', prefix: '', suffix: '', elementPath: '#old' })).toBeNull();
    expect(findAnnotationTarget({ quote: 'missing', prefix: '', suffix: '', elementPath: '#old' })).toBeNull();
    document.body.innerHTML = '<p id="old">changed</p><p>unique Native Messaging today</p>';
    expect(findAnnotationTarget({ quote: 'Native Messaging', prefix: 'unique ', suffix: ' today', elementPath: '#old' })?.textContent).toBe('unique Native Messaging today');
});
it('captures a selection spanning inline markup while omitting hidden descendants', () => {
    document.body.innerHTML = '<p>Browser <em>Native</em><span hidden>SECRET</span> Messaging today</p>';
    const p = document.querySelector('p')!, range = document.createRange(); range.setStart(p.querySelector('em')!.firstChild!, 0); range.setEnd(p.lastChild!, 10);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    expect(captureSelection()).toMatchObject({ quote: 'Native Messaging', prefix: 'Browser ', suffix: ' today' });
    expect(JSON.stringify(captureSelection())).not.toContain('SECRET');
});
it('validates a precise locator without scanning an unrelated long conversation', () => {
    document.body.innerHTML = '<p id="target">Browser Native Messaging today</p>' + '<p>unrelated text</p>'.repeat(1500);
    const styles = vi.spyOn(window, 'getComputedStyle');
    expect(findAnnotationTarget({ quote: 'Native Messaging', prefix: 'Browser ', suffix: ' today', elementPath: '#target' })?.id).toBe('target');
    expect(styles.mock.calls.length).toBeLessThan(30); styles.mockRestore();
});
it('rejects a cross-paragraph range inside a generic application container', () => {
    document.body.innerHTML = '<div id="app"><p>unselected earlier conversation</p><p id="start">Native Messaging</p><p id="end">second question</p><p>unselected later conversation</p></div>';
    const range = document.createRange(); range.setStart(document.querySelector('#start')!.firstChild!, 0); range.setEnd(document.querySelector('#end')!.firstChild!, 6);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    expect(captureSelection()).toBeNull();
});
// This large DOM regression asserts operation/retention bounds, not wall-clock
// speed. Shared hosts can exceed Vitest's default 5s while parsing/styling it.
it.each([false, true])('bounds pre-selection work and retained context with hidden=%s local nodes', hidden => {
    document.body.innerHTML = '<p id="local">' + `<span${hidden ? ' hidden' : ''}>x</span>`.repeat(4000) + 'Native Messaging' + 's'.repeat(20000) + '</p>';
    const text = document.querySelector('#local')!.lastChild!; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 16);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    const next = vi.spyOn(TreeWalker.prototype, 'nextNode'), previous = vi.spyOn(TreeWalker.prototype, 'previousNode');
    try {
        const captured = captureSelection();
        expect(captured?.quote).toBe('Native Messaging');
        expect(captured?.prefix).toBe(hidden ? '' : 'x'.repeat(1000));
        expect(captured?.suffix).toBe('s'.repeat(1000));
        expect(captured?.truncated).toBe(true);
        expect(next.mock.calls.length + previous.mock.calls.length).toBeLessThanOrEqual(2002);
    } finally { next.mockRestore(); previous.mockRestore(); }
}, 30000);
