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
function localSelectionBlock(node: Node): HTMLElement | null {
    let element = node.parentElement;
    for (let depth = 0; element && depth < 64; depth++, element = element.parentElement) {
        if (element.matches('html,body,main,article,section')) return null;
        const display = getComputedStyle(element).display;
        if (/^(block|flow-root|list-item|table-cell|table-caption|flex|grid|inline-block|inline-flex|inline-grid)$/.test(display)) return element;
        // Semantic fallback for DOM implementations without a UA stylesheet.
        if (!display && element.matches('p,div,li,pre,blockquote,td,th,h1,h2,h3,h4,h5,h6,dt,dd,figcaption,button')) return element;
    }
    return null;
}
export function captureSelection(): Capture | null {
    const selection = window.getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE || range.endContainer.nodeType !== Node.TEXT_NODE || !range.startContainer.parentElement || !range.endContainer.parentElement || !allowed(range.startContainer.parentElement) || !allowed(range.endContainer.parentElement)) return null;
    const element = localSelectionBlock(range.startContainer);
    if (!element || element !== localSelectionBlock(range.endContainer)) return null;
    // Start at the user's selection, never at the beginning of an app ancestor.
    // One shared work budget includes hidden nodes; retained strings have their
    // own independent caps, even when a single Text node is arbitrarily large.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ALL);
    walker.currentNode = range.startContainer;
    let visited = 0, quote = '', truncated = false, reachedEnd = false;
    for (let node: Node | null = range.startContainer; node; node = walker.nextNode()) {
        if (++visited > 2000) return null;
        if (node.nodeType === Node.TEXT_NODE && node.parentElement && allowed(node.parentElement)) {
            if (localSelectionBlock(node) !== element) return null;
            const text = node as Text;
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : text.length;
            const retained = Math.min(end - start, 6000 - quote.length);
            quote += text.substringData(start, retained);
            if (end - start > retained) truncated = true;
        }
        if (node === range.endContainer) { reachedEnd = true; break; }
    }
    if (!reachedEnd || !quote.trim()) return null;
    function neighbor(direction: 'before' | 'after'): string {
        const before = direction === 'before';
        const endpoint = (before ? range.startContainer : range.endContainer) as Text;
        const available = before ? range.startOffset : endpoint.length - range.endOffset;
        let context = endpoint.substringData(before ? Math.max(0, range.startOffset - 1000) : range.endOffset, Math.min(1000, available));
        if (available > 1000) truncated = true;
        walker.currentNode = endpoint;
        while (context.length < 1000) {
            if (visited >= 2000) { truncated = true; break; }
            const node = before ? walker.previousNode() : walker.nextNode();
            if (!node) break;
            visited += 1;
            if (node.nodeType !== Node.TEXT_NODE || !node.parentElement || !allowed(node.parentElement)) continue;
            if (localSelectionBlock(node) !== element) break;
            const text = node as Text, remaining = 1000 - context.length;
            const piece = text.substringData(before ? Math.max(0, text.length - remaining) : 0, Math.min(remaining, text.length));
            context = before ? piece + context : context + piece;
            if (text.length > remaining) truncated = true;
        }
        if (context.length === 1000 && (before ? walker.previousNode() : walker.nextNode())) truncated = true;
        return context;
    }
    const suffix = neighbor('after'), prefix = neighbor('before');
    return { quote, prefix, suffix, elementPath: getElementPath(element), truncated };
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
