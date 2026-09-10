import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationPopupCSS } from 'agentation';
import { captureElement, captureSelection, findAnnotationTarget, type Capture } from './annotationCapture';
import { normalizeAnnotation, pageKeyForUrl, type PageAnnotation } from './annotations';
import { draftRequest } from './annotationRuntime';

export function mountAnnotationOverlay(): () => void {
    const host = document.createElement('div'); host.dataset.pawsAnnotations = 'true';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = `:host{all:initial;font:14px system-ui;color:#202020;position:fixed;inset:0;pointer-events:none;z-index:2147483646}*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:1px solid #ccc;border-radius:8px;padding:6px 10px;background:#fff;color:#202020}button:hover{background:#eee}.tools{position:fixed;left:18px;bottom:18px;pointer-events:auto;padding:12px;background:#faf8f3;border:1px solid #ccc;border-radius:14px;box-shadow:0 4px 20px #0002;max-width:320px;max-height:45vh;overflow:auto}.list{display:grid;gap:8px;margin-top:8px}.item{display:flex;gap:4px;align-items:center}.item button:first-child{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.error{color:#a32920;white-space:pre-wrap;max-width:280px}.popup{pointer-events:auto}button.marker{position:fixed;pointer-events:auto;border-radius:50%;background:#2563eb;color:white;width:28px;height:28px;padding:0}[data-annotation-popup]{pointer-events:auto}@media(prefers-color-scheme:dark){.tools{background:#202020;color:#eee}button{background:#333;color:#eee;border-color:#555}}`;
    style.textContent += '.item{min-width:0;max-width:100%}.item button:first-child{min-width:0}.item button:not(:first-child){flex-shrink:0}.tools{overflow-x:hidden}';
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = chrome.runtime.getURL('annotation-popup.css');
    // Tests use the public package's injected CSS. Production extracts this CSS.
    const upstream = document.getElementById('feedback-tool-styles-annotation-popup-css-styles');
    if (upstream) { const copy = document.createElement('style'); copy.textContent = upstream.textContent; shadow.append(copy); }
    const controls = document.createElement('div'); controls.className = 'tools';
    const popup = document.createElement('div'); popup.className = 'popup'; const reactRoot = createRoot(popup);
    const markers = document.createElement('div'); shadow.append(style, css, controls, markers, popup); document.documentElement.append(host);
    let active = false, disposed = false, url = location.href, annotations: PageAnnotation[] = [], error = '', editing: PageAnnotation | null = null, captured: Capture | null = null, saving = false;
    let popupGeneration = 0;
    function button(text: string, handler: () => void) { const b = document.createElement('button'); b.textContent = text; b.type = 'button'; b.addEventListener('click', handler); return b; }
    function cancel() { popupGeneration += 1; captured = null; editing = null; reactRoot.render(null); }
    function locate(a: PageAnnotation) { const target = findAnnotationTarget(a); if (!target) { error = '原文位置已变化：' + a.quote; render(); return; } target.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); const old = target.style.outline; target.style.outline = '3px solid #2563eb'; setTimeout(() => { target.style.outline = old; }, 1600); }
    async function mutate(message: Record<string, unknown>, originatingPopup?: number) {
        if (saving) return; const source = url; saving = true;
        try {
            const result = await draftRequest({ ...message, url: source });
            if (disposed || source !== url) return;
            annotations = result;
            if (originatingPopup === undefined || originatingPopup === popupGeneration) error = '';
            if (originatingPopup === popupGeneration) cancel();
        }
        catch (cause) { if (source === url && !disposed && (originatingPopup === undefined || originatingPopup === popupGeneration)) error = `未保存：${cause instanceof Error ? cause.message : '存储失败'}。请保留当前问题后重试。`; }
        finally { saving = false; if (!disposed) render(); }
    }
    function open(c: Capture, a: PageAnnotation | null = null) {
        const generation = ++popupGeneration;
        captured = c; editing = a;
        reactRoot.render(createElement(AnnotationPopupCSS, { key: generation, element: a ? '编辑批注' : '页面批注', selectedText: c.quote, initialValue: a?.comment ?? '', placeholder: '记录你对这段内容的问题…', submitLabel: '保存批注', lightMode: !matchMedia('(prefers-color-scheme: dark)').matches, style: { left: Math.max(160, Math.min(innerWidth / 2, innerWidth - 430)), top: Math.max(24, Math.min(100, innerHeight - 300)) }, onCancel: () => { if (generation === popupGeneration) cancel(); },
            onSubmit: comment => {
                if (!captured || saving || generation !== popupGeneration) return;
                try { const value = normalizeAnnotation({ ...captured, id: editing?.id ?? crypto.randomUUID(), revision: (editing?.revision ?? 0) + 1, pageKey: pageKeyForUrl(url), title: document.title.slice(0, 1000), url, comment, createdAt: editing?.createdAt ?? Date.now() }); void mutate({ type: 'annotations:upsert', annotation: value }, generation); }
                catch (cause) { error = `未保存：${(cause as Error).message}`; render(); }
            }, onDelete: a ? () => { if (generation === popupGeneration) void mutate({ type: 'annotations:remove', id: a.id }, generation); } : undefined }));
    }
    function render() {
        controls.replaceChildren(button(active ? '退出批注 · Esc' : '开启批注', () => { active = !active; if (!active) cancel(); render(); }));
        if (active) { const hint = document.createElement('p'); hint.textContent = '选择文字或点击元素，记录问题'; controls.append(hint); }
        const list = document.createElement('div'); list.className = 'list';
        annotations.forEach((a, i) => { const row = document.createElement('div'); row.className = 'item'; row.append(button(`${i + 1}. ${a.comment}`, () => locate(a)), button(`编辑 ${i + 1}`, () => open(a, a)), button(`删除 ${i + 1}`, () => void mutate({ type: 'annotations:remove', id: a.id }))); list.append(row); });
        if (annotations.length) controls.append(list);
        if (error) { const notice = document.createElement('p'); notice.className = 'error'; notice.setAttribute('role', 'alert'); notice.textContent = error; controls.append(notice); }
        renderMarkers();
    }
    const located = new Map<string, HTMLElement | null>();
    let markerFrame = 0;
    function scheduleMarkers() { if (!markerFrame) markerFrame = requestAnimationFrame(() => { markerFrame = 0; if (!disposed) renderMarkers(); }); }
    function renderMarkers() {
        markers.replaceChildren();
        annotations.forEach((a, i) => {
            const key = `${a.id}:${a.revision}`;
            if (!located.has(key) || (located.get(key) && !located.get(key)!.isConnected)) located.set(key, findAnnotationTarget(a));
            const target = located.get(key); if (!target) return;
            const r = target.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
            const marker = button(String(i + 1), () => open(a, a)); marker.className = 'marker'; marker.setAttribute('aria-label', `编辑批注 ${i + 1}`);
            marker.style.left = `${Math.max(0, Math.min(innerWidth - 440, r.right))}px`; marker.style.top = `${Math.max(0, r.top)}px`; markers.append(marker);
        });
    }
    function intercept(event: MouseEvent) {
        if (!active || captured || event.composedPath().includes(host) || !(event.target instanceof Element) || event.target.id === 'paws-agent-bubble-frame') return;
        if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
        const selection = window.getSelection();
        const c = selection && !selection.isCollapsed ? captureSelection() : captureElement(event.target);
        if (!c) return;
        event.preventDefault(); event.stopImmediatePropagation(); open(c);
    }
    function escape(event: KeyboardEvent) { if (event.key !== 'Escape') return; cancel(); active = false; render(); }
    async function sync() { if (disposed) return; if (url !== location.href) { url = location.href; annotations = []; error = ''; cancel(); active = false; render(); } const source = url; try { const next = await draftRequest({ type: 'annotations:list', url: source }); if (disposed || source !== url) return; if (JSON.stringify(next) !== JSON.stringify(annotations)) { annotations = next; render(); } } catch (cause) { if (!disposed && source === url) { error = `未保存 / 无法恢复草稿：${(cause as Error).message}`; render(); } } }
    const observer = new MutationObserver(() => { located.clear(); scheduleMarkers(); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    document.addEventListener('click', intercept, true); document.addEventListener('keydown', escape, true); window.addEventListener('scroll', scheduleMarkers, true); window.addEventListener('resize', scheduleMarkers);
    const interval = setInterval(() => void sync(), 1000); render(); void sync();
    return () => { if (disposed) return; disposed = true; clearInterval(interval); observer.disconnect(); cancelAnimationFrame(markerFrame); document.removeEventListener('click', intercept, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scheduleMarkers, true); window.removeEventListener('resize', scheduleMarkers); reactRoot.unmount(); host.remove(); };
}
