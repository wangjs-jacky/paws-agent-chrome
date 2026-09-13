import { expect, it } from 'vitest';
import { conversationBlocks, presentMessage, shouldFollowOutput } from '../src/messagePresentation';

it('无效工具事件不占位，有正文时不重复显示成功终态', () => {
    const messages = [
        { content: { ev: { t: 'tool-call-start', name: 'McpTool' } } },
        { content: { ev: { t: 'tool-call-end' } } },
        { content: { ev: { t: 'text', text: '已修改标题' } } },
        { content: { ev: { t: 'turn-end', status: 'completed' } } },
    ];
    expect(conversationBlocks(messages)).toEqual([{ parts: [{ text: '已修改标题', kind: 'text', user: false }], activities: [] }]);
});

it('按轮次合并有效过程，异常始终保留在正文区域', () => {
    const message = (turn: string, ev: unknown) => ({ content: { type: 'session', data: { turn, ev } } });
    const blocks = conversationBlocks([
        message('a', { t: 'tool-call-start', name: '读取页面' }),
        message('a', { t: 'tool-call-start', name: '检查文件' }),
        message('a', { t: 'text', text: '回复' }),
        message('a', { t: 'turn-end', status: 'failed' }),
        message('b', { t: 'tool-call-start', name: '读取页面' }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].activities).toEqual(['读取页面', '检查文件']);
    expect(blocks[0].parts.map(part => part.text)).toEqual(['回复', '执行失败']);
    expect(blocks[1].activities).toEqual(['读取页面']);
});

it('解析真实 session 包装并将终态和正文分开', () => {
    expect(presentMessage({ role: 'agent', content: { type: 'session', data: { ev: { t: 'text', text: '已完成修改' } } } })).toEqual([{ text: '已完成修改', kind: 'text', user: false }]);
    expect(presentMessage({ ev: { t: 'turn-end', status: 'failed' } })[0].text).toBe('执行失败');
    expect(presentMessage({ type: 'ready' })).toEqual([]);
    expect(presentMessage({ secret: 'unknown protocol' })).toEqual([]);
});

it('将工具与思考折叠，保留用户角色', () => {
    expect(presentMessage({ role: 'user', content: { type: 'text', text: '你好' } })[0].user).toBe(true);
    expect(presentMessage({ ev: { t: 'text', text: '检查文件', thinking: true } })[0].kind).toBe('activity');
    expect(presentMessage({ ev: { t: 'tool-call-start', name: '读取文件' } })[0].kind).toBe('activity');
});

it('只有接近底部才跟随输出', () => {
    expect(shouldFollowOutput(700, 300, 1000)).toBe(true);
    expect(shouldFollowOutput(200, 300, 1000)).toBe(false);
});

it('从工具参数读取实际技能名称，不猜测缺失参数', () => {
    expect(presentMessage({ ev: { t: 'tool-call-start', name: 'Skill', args: { skill: 'show-me' } } })[0].text).toBe('调用技能 · show-me');
    expect(presentMessage({ ev: { t: 'tool-call-start', name: 'Skill' } })).toEqual([]);
});
