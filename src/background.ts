import { createChromeStorage } from './chromeStorage';
import { AnnotationStore } from './annotationStore';
import { createAnnotationCoordinator } from './annotationRuntime';
const handle = createAnnotationCoordinator(new AnnotationStore(createChromeStorage()), {
    get: async key => { const v = (await chrome.storage.session.get(key))[key]; return typeof v === 'string' ? v : null; },
    set: async (key, value) => { await chrome.storage.session.set({ [key]: value }); },
    remove: async key => { await chrome.storage.session.remove(key); },
}, chrome.runtime.id);
chrome.runtime.onMessage.addListener((message, sender, respond) => { void handle(message, sender).then(respond); return true; });
chrome.tabs.onRemoved.addListener(tabId => { void handle.forgetTab(tabId); });
