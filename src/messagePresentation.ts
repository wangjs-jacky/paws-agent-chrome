export type PresentedMessage = { text: string; kind: 'text' | 'activity' | 'status'; user: boolean };

/** 解析展示语义；未知协议不作为 JSON 正文泄漏到聊天列表。 */
export function presentMessage(content: unknown, user = false, depth = 0): PresentedMessage[] {
    if (depth > 12 || content == null) return [];
    if (typeof content === 'string') return content.trim() ? [{ text: content, kind: 'text', user }] : [];
    if (Array.isArray(content)) return content.flatMap(item => presentMessage(item, user, depth + 1));
    if (typeof content !== 'object') return [];
    const value = content as Record<string, any>;
    user = value.role ? value.role === 'user' : user;
    if (value.ev) return presentMessage(value.ev, user, depth + 1);
    const type = value.t ?? value.type;
    if (['ready', 'turn-start', 'start', 'usage', 'token_count'].includes(type)) return [];
    if (type === 'turn-end' || type === 'stop') return [{ text: value.status === 'failed' ? '执行失败' : value.status === 'cancelled' ? '已取消' : '已完成', kind: 'status', user: false }];
    if (type === 'file') return [{ text: `附件：${typeof value.name === 'string' ? value.name : '文件'}（在 Paws 中查看）`, kind: 'activity', user }];
    if (type === 'error' || value.is_error === true || (type === 'tool-call-end' && value.error)) {
        return [{ text: typeof value.text === 'string' ? value.text : '执行失败，请在 Paws 中查看详情', kind: 'status', user: false }];
    }
    if (typeof type === 'string' && (type.startsWith('tool') || type === 'reasoning' || type === 'thinking')) {
        if (value.name === 'Skill') {
            const args = value.args ?? value.input;
            const skill = args && typeof args === 'object' && typeof args.skill === 'string' ? args.skill.trim() : '';
            return skill ? [{ text: `调用技能 · ${skill}`, kind: 'activity', user: false }] : [];
        }
        const text = typeof value.text === 'string' ? value.text.trim() : typeof value.name === 'string' ? value.name.trim() : '';
        if (!text || ['McpTool', '工具执行记录', 'Tool', 'tool'].includes(text)) return [];
        return [{ text, kind: 'activity', user: false }];
    }
    if (typeof value.text === 'string') return [{ text: value.text, kind: value.thinking || type === 'service' ? 'activity' : 'text', user }];
    for (const key of ['content', 'message', 'data']) {
        if (key in value) return presentMessage(value[key], user, depth + 1);
    }
    return [];
}

export type ConversationBlock = { parts: PresentedMessage[]; activities: string[] };

function turnIdentity(content: unknown, depth = 0): string | undefined {
    if (!content || typeof content !== 'object' || depth > 12) return;
    const value = content as Record<string, unknown>;
    if (typeof value.turn === 'string') return value.turn;
    for (const key of ['content', 'message', 'data']) {
        const turn = turnIdentity(value[key], depth + 1);
        if (turn) return turn;
    }
}

/** 保留正文顺序，仅将同轮的有效过程移至正文下方。 */
export function conversationBlocks(messages: { content: unknown }[]): ConversationBlock[] {
    const blocks: ConversationBlock[] = [];
    let current: ConversationBlock | undefined;
    let turn: string | undefined;
    for (const message of messages) {
        const nextTurn = turnIdentity(message.content);
        const parts = presentMessage(message.content);
        if (!parts.length) continue;
        const user = parts.some(part => part.user);
        if (!current || user || (nextTurn && turn && nextTurn !== turn)) {
            current = { parts: [], activities: [] };
            blocks.push(current);
        }
        if (nextTurn) turn = nextTurn;
        for (const part of parts) {
            if (part.kind === 'activity') {
                if (!current.activities.includes(part.text)) current.activities.push(part.text);
            } else current.parts.push(part);
        }
        if (user) { current = undefined; turn = undefined; }
    }
    for (const block of blocks) {
        if (block.parts.some(part => part.kind === 'text' && !part.user)) {
            block.parts = block.parts.filter(part => !(part.kind === 'status' && part.text === '已完成'));
        }
    }
    return blocks;
}

export function shouldFollowOutput(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
    return scrollHeight - clientHeight - scrollTop < 48;
}
