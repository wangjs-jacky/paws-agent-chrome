import type { AnnotationBatch, PageAnnotation } from './annotations';
export type AnnotationPreview = Readonly<{ batch: AnnotationBatch; target: string; machineId: string; directory: string; sessionId: string; revision: number; originalDraft: string; url: string }>;
export function renderAnnotationList(annotations: PageAnnotation[], remove: (id: string) => void, clear: () => void): HTMLElement {
    const section = document.createElement('section'); section.className = 'annotation-list'; section.setAttribute('aria-label', '页面批注');
    const heading = document.createElement('strong'); heading.textContent = `本页批注 · ${annotations.length}/20`; section.append(heading);
    for (const [i, a] of annotations.entries()) {
        const item = document.createElement('article'); const title = document.createElement('p'); title.textContent = `${i + 1}. ${a.comment}`;
        const quote = document.createElement('blockquote'); quote.textContent = a.quote.slice(0, 160) + (a.quote.length > 160 ? '…' : '');
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `删除批注 ${i + 1}`; button.addEventListener('click', () => remove(a.id)); item.append(title, quote, button); section.append(item);
    }
    if (annotations.length) { const button = document.createElement('button'); button.type = 'button'; button.textContent = '清空当前页面批注'; button.addEventListener('click', clear); section.append(button); }
    return section;
}
export function renderAnnotationPreview(preview: AnnotationPreview, confirm: () => void, cancel: () => void): HTMLElement {
    const section = document.createElement('section'); section.className = 'annotation-preview'; section.setAttribute('aria-label', '发送预览');
    const target = document.createElement('p'); target.textContent = `发送到：${preview.target} · 会话：${preview.sessionId || '新建会话'}`;
    const pre = document.createElement('pre'); pre.setAttribute('aria-label', '完整发送内容'); pre.textContent = preview.batch.prompt;
    const send = document.createElement('button'); send.type = 'button'; send.textContent = '确认发送'; send.addEventListener('click', confirm);
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '取消预览'; back.addEventListener('click', cancel);
    section.append(target, pre, back, send); return section;
}
