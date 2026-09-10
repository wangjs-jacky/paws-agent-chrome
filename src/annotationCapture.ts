import { getElementPath } from 'agentation';
export type Capture = { quote: string; prefix: string; suffix: string; elementPath: string; truncated: boolean };
function allowed(element: Element): boolean {
    for (let e: Element | null = element; e; e = e.parentElement) {
        if (e.matches('input,textarea,select,option,script,style,noscript,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-paws-annotations],#paws-agent-bubble-frame')) return false;
        const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || s.opacity === '0') return false;
    }
    return true;
}
function visibleText(element: Element, limit = 8001): string {
    let value = ''; const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && value.length < limit; n = walker.nextNode()) if (n.parentElement && allowed(n.parentElement)) value += n.textContent?.slice(0, limit - value.length) ?? '';
    return value;
}
export function captureElement(element: Element): Capture | null {
    if (!allowed(element) || element.matches('html,body,main,article,section')) return null;
    const text = visibleText(element).trim() || (element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? '').slice(0, 6001);
    if (!text) return null;
    return { quote: text.slice(0, 6000), prefix: '', suffix: '', elementPath: getElementPath(element as HTMLElement), truncated: text.length > 6000 };
}
export function captureSelection(): Capture | null {
    const selection = window.getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0), element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    if (!element || !allowed(element) || element.matches('html,body,main,article,section')) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE || range.endContainer.nodeType !== Node.TEXT_NODE || !range.startContainer.parentElement || !range.endContainer.parentElement || !allowed(range.startContainer.parentElement) || !allowed(range.endContainer.parentElement)) return null;
    // Walk only the local block, filtering each live node before reading it.
    // Offsets are into visible text, so hidden inline nodes never enter context.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = '', start = -1, end = -1;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement || !allowed(node.parentElement)) continue;
        if (node === range.startContainer) start = text.length + range.startOffset;
        if (node === range.endContainer) end = text.length + range.endOffset;
        text += node.textContent ?? '';
        if (end >= 0 && text.length >= end + 1000) break;
    }
    if (start < 0 || end < start) return null;
    const selected = text.slice(start, end);
    if (!selected.trim()) return null;
    return { quote: selected.slice(0, 6000), prefix: text.slice(Math.max(0, start - 1000), start), suffix: text.slice(end, end + 1000), elementPath: getElementPath(element as HTMLElement), truncated: selected.length > 6000 || start > 1000 || text.length - end > 1000 };
}
export function findAnnotationTarget(a: Pick<Capture, 'quote' | 'prefix' | 'suffix' | 'elementPath'>): HTMLElement | null {
    if (!a.quote) return null;
    const validates = (element: HTMLElement) => {
        if (!allowed(element)) return false;
        const text = visibleText(element), at = text.indexOf(a.quote);
        return at >= 0 && text.indexOf(a.quote, at + 1) < 0 && (!a.prefix || text.slice(0, at).endsWith(a.prefix)) && (!a.suffix || text.slice(at + a.quote.length).startsWith(a.suffix));
    };
    if (a.elementPath) {
        try { const candidates = document.querySelectorAll<HTMLElement>(a.elementPath); if (candidates.length === 1 && validates(candidates[0])) return candidates[0]; }
        catch { /* Human-readable upstream paths may not be CSS selectors. */ }
    }
    // Bound fallback work and collect local text containers once. Never walk
    // every ancestor's entire subtree for every element in a long conversation.
    const candidates = new Set<HTMLElement>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let visited = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (++visited > 2000) return null;
        let parent = node.parentElement;
        for (let depth = 0; parent && parent !== document.body && depth < 4; depth++, parent = parent.parentElement) {
            candidates.add(parent);
            if (parent.matches('p,li,button,h1,h2,h3,h4,h5,h6,pre,blockquote,td,div')) break;
        }
    }
    const matches: HTMLElement[] = [];
    for (const element of candidates) {
        if (!validates(element)) continue;
        if (matches.some(child => element.contains(child))) continue;
        for (let i = matches.length - 1; i >= 0; i--) if (matches[i].contains(element)) matches.splice(i, 1);
        matches.push(element);
    }
    return matches.length === 1 ? matches[0] : null;
}
