import { runInNewContext } from 'node:vm';

// Styling adapter for the exact pinned public distribution. No component logic
// is rewritten. Unexpected upstream layout fails the build rather than leaking
// global styles onto a host page.
export function extractPopupStyles(source) {
    const literal = source.match(/^var css = (.+);$/m)?.[1];
    if (!literal) throw new Error('Agentation popup stylesheet layout changed');
    const css = runInNewContext(literal, {}, { timeout: 100 });
    if (typeof css !== 'string' || !css.includes('styles-module__popup___')) throw new Error('Agentation popup stylesheet missing');
    let count = 0;
    const stripped = source.replace(/^if \(typeof document !== "undefined"\) \{\n  let style = document\.getElementById\("feedback-tool-styles-[^\n]+\n[\s\S]*?^\}/gm, () => { count++; return ''; });
    if (count !== 10) throw new Error(`Agentation CSS injection layout changed (${count})`);
    return { css, source: stripped };
}
