import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { extractPopupStyles } from '../scripts/agentationStyles.mjs';
it('extracts genuine popup CSS while removing document-head style injection only', async () => {
    const upstream = await readFile(new URL('../node_modules/agentation/dist/index.mjs', import.meta.url), 'utf8');
    const result = extractPopupStyles(upstream);
    expect(result.css).toContain('position: fixed'); expect(result.css).toContain('styles-module__popup___');
    expect(result.source).not.toContain('style.textContent = css');
    expect(result.source).toContain('function AnnotationPopupCSS2');
    expect(result.source).toContain('onSubmit(text.trim())');
    expect(() => extractPopupStyles('unexpected module')).toThrow();
});
