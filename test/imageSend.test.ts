import { afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import nacl from 'tweetnacl';
import { PawsAgentClient } from '@wangjs-jacky/paws-agent';

afterEach(() => vi.unstubAllGlobals());

for (const variant of ['legacy', 'dataKey']) it(`图片使用 ${variant} 对应密钥加密，OSS 请求不携带账号令牌`, async () => {
    const client = new PawsAgentClient({ serverUrl: 'https://example.test', credentials: { getCredentials: async () => null, setCredentials: async () => {}, clearCredentials: async () => {} } });
    const resource = client.messages as any;
    const key = new Uint8Array(32).fill(7);
    vi.spyOn(client.sessions, 'get').mockResolvedValue({ active: true } as any);
    resource.getEncryption = async () => ({ key, variant });
    const post = vi.spyOn(resource.transport, 'post').mockResolvedValueOnce({ ref: 'ref1', uploadUrl: 'https://storage.test/upload', method: 'POST', formFields: { policy: 'signed-policy' } }).mockResolvedValueOnce({ success: true });
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
        expect(init.headers).not.toHaveProperty('Authorization');
        const form = init.body as FormData;
        expect(form.get('policy')).toBe('signed-policy');
        const bytes = new Uint8Array(await (form.get('file') as Blob).arrayBuffer());
        const root = createHmac('sha512', 'Happy Blobs Master Seed').update(key).digest();
        const derived = createHmac('sha512', root.subarray(32)).update(Buffer.concat([Buffer.from([0]), Buffer.from(variant === 'legacy' ? 'master' : 'session')])).digest().subarray(0, 32);
        expect(nacl.secretbox.open(bytes.slice(24), bytes.slice(0, 24), derived)).toEqual(new Uint8Array([1, 2, 3]));
        return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await client.messages.send({ sessionId: 's1', text: '看图', images: [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]), width: 1, height: 1 }] });
    expect((post.mock.calls[1][1] as any).messages).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledOnce();
    await client.dispose();
});

it('上传失败时不发送文字和附件消息', async () => {
    const client = new PawsAgentClient({ serverUrl: 'https://example.test', credentials: { getCredentials: async () => null, setCredentials: async () => {}, clearCredentials: async () => {} } });
    const resource = client.messages as any;
    vi.spyOn(client.sessions, 'get').mockResolvedValue({ active: true } as any);
    resource.getEncryption = async () => ({ key: new Uint8Array(32), variant: 'legacy' });
    const post = vi.spyOn(resource.transport, 'post').mockResolvedValue({ ref: 'r1', uploadUrl: 'https://storage.test/upload', method: 'PUT' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await expect(client.messages.send({ sessionId: 's1', text: '看图', images: [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1]), width: 1, height: 1 }] })).rejects.toThrow('上传失败');
    expect(post).toHaveBeenCalledTimes(1);
    await client.dispose();
});
