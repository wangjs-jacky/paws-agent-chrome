import { createChromeStorage } from './chromeStorage';
import { AnnotationStore } from './annotationStore';
import { createAnnotationCoordinator } from './annotationRuntime';
import { isDevelopmentReloadMessage } from './devReload';
const handle = createAnnotationCoordinator(new AnnotationStore(createChromeStorage()), {
    get: async key => { const v = (await chrome.storage.session.get(key))[key]; return typeof v === 'string' ? v : null; },
    set: async (key, value) => { await chrome.storage.session.set({ [key]: value }); },
    remove: async key => { await chrome.storage.session.remove(key); },
}, chrome.runtime.id);
chrome.runtime.onMessage.addListener((message, sender, respond) => { void handle(message, sender).then(respond); return true; });
chrome.runtime.onMessage.addListener(message => {
    if (!isDevelopmentReloadMessage(message)) return false;
    // 内容脚本已写入一秒后的页面刷新标记；先重载扩展，随后页面会注入新构建。
    setTimeout(() => chrome.runtime.reload(), 100);
    return false;
});
chrome.tabs.onRemoved.addListener(tabId => { void handle.forgetTab(tabId); });
