// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ clients: [] as any[], values: new Map<string, string>() }));
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
        sessions = { list: vi.fn(async () => []) };
        messages = { history: vi.fn(async () => []) };
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
