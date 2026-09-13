import { expect, it, vi } from 'vitest';
import { PawsAgentClient } from '@wangjs-jacky/paws-agent';

function setup() {
    const client = new PawsAgentClient({ serverUrl: 'https://example.test', credentials: {
        getCredentials: async () => null,
        setCredentials: async () => {}, clearCredentials: async () => {},
    } });
    // 在 SDK 资源边界替换传输，验证授权与 RPC 的可观察调用。
    const resource = client.sessions as any;
    resource.ensureMachine = vi.fn();
    const post = vi.spyOn(resource.transport, 'post');
    const rpc = vi.spyOn(resource.realtime, 'machineRpc').mockResolvedValue({ type: 'success', sessionId: 's1' });
    return { client, post, rpc };
}

it('每次 Codex 启动获取新的授权并传入 RPC', async () => {
    const { client, post, rpc } = setup();
    post.mockResolvedValueOnce({ grant: 'a'.repeat(43) }).mockResolvedValueOnce({ grant: 'b'.repeat(43) });
    for (let i = 0; i < 2; i++) await client.sessions.spawn({ machineId: 'm1', directory: '/tmp', agent: 'codex' });
    expect(post.mock.calls).toEqual(Array(2).fill(['/v1/codex-session-grants', { machineId: 'm1' }]));
    expect(rpc.mock.calls.map(call => (call[2] as any).codexSessionGrant)).toEqual(['a'.repeat(43), 'b'.repeat(43)]);
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    await client.dispose();
});

it('授权失败或格式无效时不启动远端进程', async () => {
    const { client, post, rpc } = setup();
    post.mockRejectedValueOnce(new Error('binding-required')).mockResolvedValueOnce({ grant: 'invalid' });
    await expect(client.sessions.spawn({ machineId: 'm1', directory: '/tmp', agent: 'codex' })).rejects.toThrow('binding-required');
    await expect(client.sessions.spawn({ machineId: 'm1', directory: '/tmp', agent: 'codex' })).rejects.toThrow('授权响应无效');
    expect(rpc).not.toHaveBeenCalled();
    await client.dispose();
});

it('其他 Agent 不请求 Codex 授权', async () => {
    const { client, post, rpc } = setup();
    await client.sessions.spawn({ machineId: 'm1', directory: '/tmp', agent: 'claude' });
    expect(post).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0][2]).not.toHaveProperty('codexSessionGrant');
    await client.dispose();
});
