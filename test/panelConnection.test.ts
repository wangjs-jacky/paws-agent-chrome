// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ clients: [] as any[], values: new Map<string, string>(), annotations: [] as any[], acknowledged: [] as any[], runtimeError: '' }));
vi.mock('../src/chromeStorage', () => ({ createChromeStorage: () => ({
    get: async (key: string) => fixture.values.get(key) ?? null,
    set: async (key: string, value: string) => { fixture.values.set(key, value); },
    remove: async (key: string) => { fixture.values.delete(key); },
}) }));
vi.mock('@wangjs-jacky/paws-agent', () => ({
    PawsAgentClient: class {
        listener = (_event: any) => {};
        resolve!: () => void;
        reject!: (error: Error) => void;
        disposed = false;
        machines = { list: vi.fn(async () => []) };
        sessions = {
            list: vi.fn(async () => []),
            spawn: vi.fn(async () => ({ type: 'success', sessionId: 'sent-session' })),
        };
        messages = {
            history: vi.fn(async (_id: string) => []),
            send: vi.fn(async (_input: any) => ({ sessionId: 'sent-session', localId: 'message-1' })),
        };
        constructor() { fixture.clients.push(this); }
        subscribe(listener: (event: any) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
        connect() { return new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
        async dispose() { this.disposed = true; }
    },
}));

function click(label: string) {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label);
    expect(button, `button ${label}`).toBeDefined();
    button!.click();
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
function ready(client: any) {
    client.listener({ type: 'snapshot', machines: [], sessions: [] });
    client.resolve();
}

beforeEach(async () => {
    vi.useFakeTimers();
    fixture.annotations = []; fixture.acknowledged = []; fixture.runtimeError = '';
    vi.stubGlobal('chrome', { runtime: { sendMessage: async (m: any) => {
        if (fixture.runtimeError) return { ok: false, error: fixture.runtimeError };
        if (m.type === 'annotations:acknowledge') { fixture.acknowledged.push(m.batch); fixture.annotations = fixture.annotations.filter(a => !m.batch.annotations.some((b: any) => a.id === b.id && a.revision === b.revision)); }
        return { ok: true, annotations: fixture.annotations };
    } } });
    // happy-dom does not implement the browser's Option constructor.
    vi.stubGlobal('Option', function (text: string, value: string) {
        const option = document.createElement('option');
        option.textContent = text;
        option.value = value;
        return option;
    });
    vi.resetModules();
    fixture.clients.length = 0;
    fixture.values.clear();
    fixture.values.set('paws-agent.credentials', JSON.stringify({ token: 'test-token', secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/panel');
    await flush();
    click('打开 Paws Agent');
});

async function readyToSend() {
    const client = fixture.clients[0];
    client.listener({ type: 'snapshot', machines: [{ id: 'machine-1', active: true, metadata: { homeDir: '/project' } }], sessions: [] });
    client.resolve();
    await flush();
    enterDraft('original message');
    return client;
}

function enterDraft(text: string) {
    const textarea = document.querySelector('textarea')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
}

function sessionLink() {
    return document.querySelector<HTMLAnchorElement>('a[aria-label="在 Paws 中打开当前会话（新标签页）"]');
}

async function annotationReady() {
    const client = await readyToSend(); enterDraft('');
    const { pageKeyForUrl } = await import('../src/annotations');
    fixture.annotations = [{ id: 'one', revision: 1, pageKey: pageKeyForUrl('https://example.com/article?token=secret'), title: 'Bridge', url: 'https://example.com/article?token=secret', quote: 'Native Messaging', prefix: 'Browser uses ', suffix: '', elementPath: 'p', comment: '为什么需要桥接？', createdAt: 1, truncated: false }];
    window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: { type: 'paws:page-context', context: { title: 'Bridge', url: 'https://example.com/article?token=secret', selection: '' } } }));
    await flush(); return client;
}
describe('annotation batch confirmation', () => {
    it('recovers preview availability after a transient draft synchronization error', async () => {
        await annotationReady(); fixture.runtimeError = 'draft storage temporarily unavailable'; await vi.advanceTimersByTimeAsync(1000);
        expect(document.body.textContent).toContain('无法读取批注'); fixture.runtimeError = ''; await vi.advanceTimersByTimeAsync(1000);
        click('发送'); expect(document.querySelector('[aria-label="发送预览"]')).not.toBeNull();
    });
    it('does not acknowledge or show stale annotation completion after navigation', async () => {
        const client = await annotationReady(); let finish!: () => void; client.messages.send.mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
        click('发送'); click('确认发送'); await flush();
        window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: { type: 'paws:page-context', context: { title: 'next', url: 'https://example.com/next', selection: '' } } })); await flush(); finish(); await flush();
        expect(fixture.acknowledged).toEqual([]); expect(fixture.annotations).toHaveLength(1); expect(client.messages.history).not.toHaveBeenCalled();
    });
    it('retains drafts on rejected sends and duplicate confirmation clicks', async () => {
        const client = await annotationReady(); client.messages.send.mockRejectedValueOnce(new Error('offline')); click('发送');
        const confirm = [...document.querySelectorAll('button')].find(b => b.textContent === '确认发送')!; confirm.click(); confirm.click(); await flush();
        expect(client.messages.send).toHaveBeenCalledTimes(1); expect(fixture.annotations).toHaveLength(1); expect(document.body.textContent).toContain('发送结果待确认');
    });
    it('previews annotation-only questions, can cancel, and sends exactly the confirmed text once', async () => {
        const client = await annotationReady(); click('发送'); await flush();
        expect(client.messages.send).not.toHaveBeenCalled(); expect(document.querySelector('[aria-label="发送预览"]')?.textContent).toContain('Native Messaging');
        click('取消预览'); expect(client.messages.send).not.toHaveBeenCalled(); click('发送');
        const prompt = document.querySelector('[aria-label="完整发送内容"]')!.textContent;
        click('确认发送'); await flush(); expect(client.messages.send).toHaveBeenCalledTimes(1); expect(client.messages.send.mock.calls[0][0].text).toBe(prompt); expect(prompt).not.toContain('token=secret'); expect(fixture.annotations).toEqual([]);
    });
    it('freezes preview and only clears matching revisions while new questions survive', async () => {
        const client = await annotationReady(); click('发送');
        fixture.annotations = [{ ...fixture.annotations[0], revision: 2, comment: 'edited' }, { ...fixture.annotations[0], id: 'new' }];
        await vi.advanceTimersByTimeAsync(1000); click('确认发送'); await flush();
        expect(client.messages.send.mock.calls[0][0].text).toContain('为什么需要桥接？'); expect(client.messages.send.mock.calls[0][0].text).not.toContain('edited'); expect(fixture.annotations).toHaveLength(2);
    });
    it('retains drafts and warns about unknown completion without retry on timeout', async () => {
        const client = await annotationReady(); client.messages.send.mockImplementationOnce(() => new Promise(() => {})); click('发送'); click('确认发送'); await flush();
        await vi.advanceTimersByTimeAsync(45000); expect(document.body.textContent).toContain('发送结果待确认'); expect(fixture.annotations).toHaveLength(1); expect(client.messages.send).toHaveBeenCalledTimes(1); expect(fixture.acknowledged).toEqual([]);
    });
    it('distinguishes accepted sends from failed history loading', async () => {
        const client = await annotationReady(); client.messages.history.mockRejectedValueOnce(new Error('history unavailable')); click('发送'); click('确认发送'); await flush();
        expect(document.body.textContent).toContain('消息已发送'); expect(fixture.annotations).toEqual([]); expect(client.messages.send).toHaveBeenCalledTimes(1);
    });
    it('preserves the exact preview through directory approval', async () => {
        const client = await annotationReady(); client.sessions.spawn.mockResolvedValueOnce({ type: 'requestToApproveDirectoryCreation' }); click('发送'); click('确认发送'); await flush();
        enterDraft('new draft after approval'); click('允许创建并继续'); await flush(); expect(client.messages.send.mock.calls[0][0].text).not.toContain('new draft'); expect(document.querySelector('textarea')!.value).toBe('new draft after approval');
    });
    it('invalidates preview when the target or source page changes', async () => {
        const client = await annotationReady(); click('发送'); expect(document.querySelector('[aria-label="发送预览"]')).not.toBeNull(); click('新会话'); await flush(); expect(document.querySelector('[aria-label="发送预览"]')).toBeNull(); expect(client.messages.send).not.toHaveBeenCalled();
    });
});

describe('compact target settings', () => {
    it('keeps the target visible while configuration is collapsed behind a gear', async () => {
        await readyToSend();
        const summary = document.querySelector('[aria-label="当前执行目标"]');
        expect(summary?.textContent ?? '').toContain('/project');
        expect(summary?.closest('[hidden]')).toBeNull();
        expect(document.querySelector('[aria-label="远端工作目录"]')?.closest('[hidden]')).not.toBeNull();
        click('设置');
        expect(document.querySelector('[aria-label="远端工作目录"]')?.closest('[hidden]')).toBeNull();
        expect(document.querySelector('[aria-label="设置"]')?.getAttribute('aria-expanded')).toBe('true');
        click('设置');
        expect(document.querySelector('[aria-label="远端工作目录"]')?.closest('[hidden]')).not.toBeNull();
        expect(document.querySelector('[aria-label="设置"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps new conversation available outside the collapsed settings', async () => {
        await readyToSend();
        click('发送');
        await flush();
        const reset = [...document.querySelectorAll('button')].find(button => button.textContent === '新会话');
        expect(reset?.closest('[hidden]')).toBeNull();
        reset!.click();
        await flush();
        expect(sessionLink()).toBeNull();
    });
});

describe('current session navigation', () => {
    it('shows a non-clickable placeholder before a session exists', async () => {
        await readyToSend();
        expect(document.querySelector('[aria-label="当前会话"]')?.textContent ?? '').toContain('尚未创建');
        expect(sessionLink()).toBeNull();
    });

    it('exposes the created session in a safe new-tab link', async () => {
        await readyToSend();
        click('发送');
        await flush();
        expect(sessionLink()?.href).toBe('https://47.115.228.20:8443/session/sent-session');
        expect(sessionLink()?.target).toBe('_blank');
        expect(sessionLink()?.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
        expect(document.querySelector('[aria-label="当前会话"]')?.textContent).toContain('sent-session');
    });

    it('restores the saved session link using the configured server', async () => {
        await readyToSend();
        click('发送');
        await flush();
        window.dispatchEvent(new Event('beforeunload'));
        const saved = JSON.parse(fixture.values.get('paws-agent.chrome.config')!);
        saved.serverUrl = 'https://paws.example/team';
        fixture.values.set('paws-agent.chrome.config', JSON.stringify(saved));
        vi.resetModules();
        document.body.innerHTML = '<div id="app"></div>';
        await import('../src/panel');
        await flush();
        click('打开 Paws Agent');
        const restored = fixture.clients.at(-1);
        restored.listener({ type: 'snapshot',
            machines: [{ id: 'machine-1', active: true, metadata: { homeDir: '/project' } }],
            sessions: [{ id: 'sent-session', metadata: { machineId: 'machine-1', path: '/project' } }],
        });
        restored.resolve();
        await flush();
        expect(sessionLink()?.href).toBe('https://paws.example/team/session/sent-session');
    });

    it.each(['new conversation', 'directory', 'machine'])('removes the old link after changing %s', async action => {
        const client = await readyToSend();
        client.listener({ type: 'machines', machines: [
            { id: 'machine-1', active: true, metadata: { homeDir: '/project' } },
            { id: 'machine-2', active: true, metadata: { homeDir: '/other' } },
        ] });
        click('发送');
        await flush();
        expect(sessionLink()?.href ?? '').toContain('/session/sent-session');
        if (action === 'new conversation') click('新会话');
        else {
            const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(action === 'directory'
                ? '[aria-label="远端工作目录"]' : '[aria-label="远端机器"]')!;
            input.value = action === 'directory' ? '/changed' : 'machine-2';
            input.dispatchEvent(new Event('change'));
        }
        await flush();
        expect(sessionLink()).toBeNull();
        expect(document.querySelector('[aria-label="当前会话"]')?.textContent ?? '').toContain('尚未创建');
        if (action === 'new conversation') {
            client.sessions.spawn.mockResolvedValueOnce({ type: 'success', sessionId: 'second-session' });
            enterDraft('second message');
            click('发送');
            await flush();
            expect(sessionLink()?.href).toBe('https://47.115.228.20:8443/session/second-session');
        }
    });
});

describe('sending while the conversation changes', () => {
    it.each(['new conversation', 'directory change'])('does not use an empty ID after %s during send', async action => {
        const client = await readyToSend();
        let finishSend!: () => void;
        client.messages.send.mockImplementationOnce(() => new Promise<void>(resolve => { finishSend = resolve; }));
        click('发送');
        await flush();
        expect(client.messages.send).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sent-session', text: expect.stringContaining('original message') }));
        if (action === 'new conversation') click('新会话');
        else {
            const directory = document.querySelector<HTMLInputElement>('input[aria-label="远端工作目录"]')!;
            directory.value = '/different-project';
            directory.dispatchEvent(new Event('change'));
        }
        await flush();
        enterDraft('next message');
        finishSend();
        await flush();
        expect(client.messages.history).not.toHaveBeenCalled();
        expect(document.querySelector('textarea')!.value).toBe('next message');
        expect(JSON.parse(fixture.values.get('paws-agent.chrome.config')!).sessionId).toBe('');
        expect(document.body.textContent).not.toContain('sessionId is required');
    });

    it.each(['new conversation', 'directory', 'machine'])('does not attach a late spawn result after changing %s', async action => {
        const client = await readyToSend();
        client.listener({ type: 'machines', machines: [
            { id: 'machine-1', active: true, metadata: { homeDir: '/project' } },
            { id: 'machine-2', active: true, metadata: { homeDir: '/other' } },
        ] });
        let finishSpawn!: (value: any) => void;
        client.sessions.spawn.mockImplementationOnce(() => new Promise(resolve => { finishSpawn = resolve; }));
        click('发送');
        await flush();
        if (action === 'new conversation') click('新会话');
        else {
            const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(action === 'directory'
                ? '[aria-label="远端工作目录"]' : '[aria-label="远端机器"]')!;
            input.value = action === 'directory' ? '/changed' : 'machine-2';
            input.dispatchEvent(new Event('change'));
        }
        await flush();
        enterDraft('next message');
        finishSpawn({ type: 'success', sessionId: 'old-session' });
        await flush();
        expect(client.messages.send).not.toHaveBeenCalled();
        expect(document.querySelector('textarea')!.value).toBe('next message');
        expect(document.querySelector('button[type="submit"]')!.textContent).toBe('发送');
        expect(JSON.parse(fixture.values.get('paws-agent.chrome.config')!).sessionId).toBe('');
        expect(sessionLink()).toBeNull();
        expect(document.querySelector('[aria-label="当前会话"]')?.textContent ?? '').toContain('尚未创建');
    });

    it('sends the original text even when the draft changes while spawn is pending', async () => {
        const client = await readyToSend();
        let finishSpawn!: (value: any) => void;
        client.sessions.spawn.mockImplementationOnce(() => new Promise(resolve => { finishSpawn = resolve; }));
        click('发送');
        await flush();
        enterDraft('next message');
        finishSpawn({ type: 'success', sessionId: 'sent-session' });
        await flush();
        expect(client.messages.send).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('original message') }));
        expect(document.querySelector('textarea')!.value).toBe('next message');
    });

    it('keeps a late error from an abandoned send out of the new conversation', async () => {
        const client = await readyToSend();
        let failSend!: (error: Error) => void;
        client.messages.send.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSend = reject; }));
        click('发送');
        await flush();
        click('新会话');
        await flush();
        failSend(new Error('old operation failed'));
        await flush();
        expect(document.body.textContent).not.toContain('old operation failed');
        expect(document.querySelector('button[type="submit"]')!.textContent).toBe('发送');
    });
});
afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('connection recovery', () => {
    it('bounds a stalled connection and retries without losing the binding', async () => {
        const first = fixture.clients[0];
        await vi.advanceTimersByTimeAsync(45_000);
        expect(document.body.textContent).toContain('连接超时');
        expect(document.querySelector('.spinner')).toBeNull();
        expect(first.disposed).toBe(true);
        expect(fixture.values.has('paws-agent.credentials')).toBe(true);
        click('重试连接');
        await flush();
        ready(fixture.clients[1]);
        await flush();
        expect(document.querySelector('textarea'), document.body.textContent ?? '').not.toBeNull();
        expect(document.body.textContent).toContain('已连接');
    });

    it('ignores a timed-out attempt that resolves during a newer connection', async () => {
        const first = fixture.clients[0];
        await vi.advanceTimersByTimeAsync(45_000);
        click('重试连接');
        await flush();
        ready(first);
        await flush();
        expect(document.querySelector('textarea')).toBeNull();
        ready(fixture.clients[1]);
        await flush();
        expect(document.querySelector('textarea')).not.toBeNull();
    });

    it('uses the synchronized snapshot without downloading it a second time', async () => {
        const client = fixture.clients[0];
        ready(client);
        await flush();
        expect(document.querySelector('textarea')).not.toBeNull();
        expect(client.machines.list).not.toHaveBeenCalled();
        expect(client.sessions.list).not.toHaveBeenCalled();
    });

    it('closes a failed client and presents recovery instead of requiring a new QR code', async () => {
        const client = fixture.clients[0];
        client.reject(new Error('Network unavailable'));
        await flush();
        expect(client.disposed).toBe(true);
        expect(document.body.textContent).toContain('Network unavailable');
        expect(document.body.textContent).toContain('重试连接');
        expect(document.body.textContent).not.toContain('生成绑定二维码');
    });
});
