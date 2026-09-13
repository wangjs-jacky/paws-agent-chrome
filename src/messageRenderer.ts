import { createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Streamdown } from 'streamdown';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { diagramPng, diagramViewer } from './diagramImage';

/** UI 层只接受正文，不依赖 Paws、SDK 或底层事件。 */
export interface MessageRenderer {
    mount(container: HTMLElement, markdown: string): () => void;
}

const mermaid = createMermaidPlugin({ config: { securityLevel: 'strict', theme: 'dark', startOnLoad: false, flowchart: { htmlLabels: false }, htmlLabels: false } });

function DiagramImage({ source }: { source: string }) {
    const [url, setUrl] = useState('');
    const [viewer, setViewer] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let disposed = false;
        let objectUrl = '';
        void mermaid.getMermaid().render(`paws-diagram-${crypto.randomUUID()}`, source).then(async ({ svg }) => {
            const png = await diagramPng(svg);
            if (disposed) return;
            objectUrl = diagramViewer(png);
            setUrl(png);
            setViewer(objectUrl);
        }).catch(() => { if (!disposed) setFailed(true); });
        return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [source]);
    if (failed) return createElement('div', null, '图表生成失败，以下为源代码：', createElement('pre', null, source));
    if (!url) return createElement('span', { className: 'diagram-loading' }, '正在生成图表…');
    return createElement('a', { href: viewer, target: '_blank', rel: 'noopener noreferrer', className: 'diagram-preview', 'aria-label': '打开流程图原图' },
        createElement('img', { src: url, alt: '流程图预览', onError: () => setFailed(true) }),
        createElement('span', null, '点击查看原图 ↗'));
}

export const markdownRenderer: MessageRenderer = {
    mount(container, markdown) {
        const root: Root = createRoot(container);
        flushSync(() => root.render(createElement(Streamdown, {
            mode: 'static',
            parseIncompleteMarkdown: false,
            skipHtml: true,
            controls: false,
            className: 'markdown-body',
            components: {
                code: ({ className, children }) => /(?:^|\s)language-mermaid(?:\s|$)/.test(className ?? '')
                    ? createElement(DiagramImage, { source: String(children).trim() })
                    : createElement('code', { className }, children),
                pre: ({ children }) => createElement('div', { className: 'markdown-code-block' }, children),
                strong: ({ children }) => createElement('strong', null, children),
                a: ({ href, children }) => createElement('a', { href, target: '_blank', rel: 'noopener noreferrer' }, children),
            },
        }, markdown)));
        return () => root.unmount();
    },
};
