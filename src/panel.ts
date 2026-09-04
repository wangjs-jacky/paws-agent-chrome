import {
    PawsAgentClient,
    type AgentRequest,
    type BrowseDirectoryResult,
    type Machine,
    type Message,
    type Session,
} from '@wangjs-jacky/paws-agent';
import {
    BrowserCredentialProvider,
    startBrowserAccountLink,
} from '@wangjs-jacky/paws-agent/browser';
import QRCode from 'qrcode';
import { createChromeStorage } from './chromeStorage';
import { composePrompt, type PageContext } from './pageContext';
import { DEFAULT_SERVER_URL, normalizeServerUrl } from './serverUrl';
import {
    machineDisplayName,
    machineHomeDirectory,
    recentDirectoriesForMachine,
    resolvePreferredDirectory,
    sessionMatchesTarget,
    sortMachinesForPicker,
} from './targetPreferences';

type Phase = 'booting' | 'signedOut' | 'linking' | 'connecting' | 'ready';

type LocalConfig = {
    serverUrl: string;
    machineId: string;
    directory: string;
    directoriesByMachine: Record<string, string>;
    sessionId: string;
};

type SuccessfulDirectoryListing = Extract<BrowseDirectoryResult, { success: true }>;

const CONFIG_KEY = 'paws-agent.chrome.config';
const storage = createChromeStorage();
const credentials = new BrowserCredentialProvider(storage);
const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('Paws Agent panel root is missing');
const root: HTMLElement = rootElement;

let phase: Phase = 'booting';
let expanded = false;
let config: LocalConfig = {
    serverUrl: DEFAULT_SERVER_URL,
    machineId: '',
    directory: '',
    directoriesByMachine: {},
    sessionId: '',
};
let client: PawsAgentClient | null = null;
let unsubscribe: (() => void) | null = null;
let machines: Machine[] = [];
let sessions: Session[] = [];
let messages: Message[] = [];
let requests: AgentRequest[] = [];
let pageContext: PageContext | null = null;
let draft = '';
let includeContext = true;
let qrDataUrl = '';
let linkUrl = '';
let busy = false;
let pendingDirectoryApproval = false;
let statusText = '准备连接';
let errorText = '';
let linkController: AbortController | null = null;
let directoryBrowserOpen = false;
let directoryBrowserLoading = false;
let directoryBrowserListing: SuccessfulDirectoryListing | null = null;
let directoryBrowserError = '';
let directoryBrowserHint = '';
let directoryBrowserRequestToken = 0;

window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    const message = event.data as { type?: unknown; context?: unknown } | null;
    if (message?.type === 'paws:bubble:host-ready') {
        syncHostState();
        return;
    }
    if (message?.type !== 'paws:page-context' || !isPageContext(message.context)) return;
    pageContext = message.context;
    if (expanded && phase === 'ready') render();
});

window.addEventListener('beforeunload', () => {
    linkController?.abort();
    unsubscribe?.();
    void client?.dispose();
});

void initialize();

async function initialize(): Promise<void> {
    const saved = await storage.get(CONFIG_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved) as Partial<LocalConfig>;
            const savedServerUrl = typeof parsed.serverUrl === 'string' ? parsed.serverUrl : '';
            const directoriesByMachine = stringRecord(parsed.directoriesByMachine);
            const savedMachineId = typeof parsed.machineId === 'string' ? parsed.machineId : '';
            const legacyDirectory = typeof parsed.directory === 'string' ? parsed.directory : '';
            let migratedLegacyDirectory = false;
            if (savedMachineId && legacyDirectory.trim() && !directoriesByMachine[savedMachineId]) {
                directoriesByMachine[savedMachineId] = legacyDirectory.trim();
                migratedLegacyDirectory = true;
            }
            config = {
                serverUrl: normalizeServerUrl(savedServerUrl),
                machineId: savedMachineId,
                directory: legacyDirectory,
                directoriesByMachine,
                sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
            };
            if (config.serverUrl !== savedServerUrl || migratedLegacyDirectory) await saveConfig();
        } catch {
            await storage.remove(CONFIG_KEY);
        }
    }

    phase = await credentials.getCredentials() ? 'connecting' : 'signedOut';
    render();
    if (phase === 'connecting') await connectClient();
}

function render(): void {
    root.replaceChildren(expanded ? renderPanel() : renderBubble());
}

function renderBubble(): HTMLElement {
    const button = element('button', 'bubble-button');
    button.type = 'button';
    button.setAttribute('aria-label', '打开 Paws Agent');
    button.title = '打开 Paws Agent';
    button.append(element('span', 'bubble-mark', '🐾'), element('span', `bubble-status ${phase === 'ready' ? 'is-ready' : ''}`));
    button.addEventListener('click', () => setExpanded(true));
    return button;
}

function renderPanel(): HTMLElement {
    const shell = element('section', 'panel-shell');
    shell.append(renderHeader());
    const body = element('div', 'panel-body');
    if (errorText) body.append(element('div', 'notice notice-error', errorText));

    if (phase === 'booting' || phase === 'connecting') body.append(renderLoading());
    if (phase === 'signedOut') body.append(renderSignedOut());
    if (phase === 'linking') body.append(renderLinking());
    if (phase === 'ready') body.append(renderConversation());
    shell.append(body);
    return shell;
}

function renderHeader(): HTMLElement {
    const header = element('header', 'panel-header');
    const identity = element('div', 'identity');
    identity.append(element('span', 'identity-mark', '🐾'));
    const labels = element('div');
    labels.append(element('strong', '', 'Paws Agent'), element('span', 'status-label', statusText));
    identity.append(labels);
    const close = element('button', 'icon-button', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '收起 Paws Agent');
    close.addEventListener('click', () => setExpanded(false));
    header.append(identity, close);
    return header;
}

function renderLoading(): HTMLElement {
    const section = element('section', 'center-state');
    section.append(element('span', 'spinner'), element('strong', '', phase === 'booting' ? '正在准备' : '正在连接远端会话'), element('p', '', '连接建立后，会话会同步显示在现有 Paws 客户端中。'));
    return section;
}

function renderSignedOut(): HTMLElement {
    const section = element('section', 'setup-card');
    section.append(element('span', 'eyebrow', '设备绑定'), element('h1', '', '把这个浏览器连接到 Paws'), element('p', 'muted', '二维码只用于绑定当前扩展；账号密钥保存在浏览器扩展存储中，不会暴露给网页。'));
    const label = element('label', 'field');
    label.append(element('span', '', 'Server URL'));
    const input = element('input') as HTMLInputElement;
    input.type = 'url';
    input.value = config.serverUrl;
    input.placeholder = DEFAULT_SERVER_URL;
    input.addEventListener('input', () => { config.serverUrl = input.value; });
    label.append(input);
    const button = primaryButton('生成绑定二维码', () => void beginLink());
    button.disabled = busy;
    section.append(label, button);
    return section;
}

function renderLinking(): HTMLElement {
    const section = element('section', 'setup-card linking-card');
    section.append(
        element('span', 'eyebrow', qrDataUrl ? '等待手机确认' : '正在准备'),
        element('h1', '', qrDataUrl ? '扫描二维码连接' : '正在生成绑定二维码'),
    );
    if (qrDataUrl) {
        const image = document.createElement('img');
        image.className = 'qr-code';
        image.src = qrDataUrl;
        image.alt = 'Paws 设备绑定二维码';
        section.append(image);
    }
    section.append(element('p', 'muted', qrDataUrl ? '在 Paws 客户端中进入“设置 → 账号 → 连接新设备”，扫码后本页会自动继续。' : '正在向 Paws 服务申请一次性绑定码，你可以随时取消。'));
    if (linkUrl) {
        const open = document.createElement('a');
        open.className = 'text-link';
        open.href = linkUrl;
        open.textContent = '在已安装 Paws 的设备上打开';
        section.append(open);
    }
    const cancel = secondaryButton('取消', () => cancelLink());
    section.append(cancel);
    return section;
}

function renderConversation(): HTMLElement {
    const container = element('div', 'conversation');
    container.append(renderTargetPicker());
    if (directoryBrowserOpen) {
        container.append(renderDirectoryBrowser());
        return container;
    }
    container.append(renderMessages());
    if (requests.length > 0) container.append(renderRequests());
    if (pendingDirectoryApproval) {
        const approval = element('div', 'notice notice-warning');
        approval.append(element('span', '', `远端目录不存在：${config.directory}`), primaryButton('允许创建并继续', () => void sendDraft(true)));
        container.append(approval);
    }
    container.append(renderComposer());
    return container;
}

function renderTargetPicker(): HTMLElement {
    const section = element('section', 'target-card');
    const row = element('div', 'target-row');
    const machine = document.createElement('select');
    machine.setAttribute('aria-label', '远端机器');
    if (machines.length === 0) machine.append(new Option('没有已绑定机器', ''));
    for (const item of machines) {
        const option = new Option(machinePickerLabel(item), item.id);
        option.disabled = !item.active;
        machine.append(option);
    }
    machine.value = config.machineId;
    machine.addEventListener('change', () => { void selectMachine(machine.value); });
    const reset = secondaryButton('新会话', () => void resetSession());
    row.append(machine, reset);

    const directoryRow = element('div', 'directory-row');
    const directory = document.createElement('input');
    directory.type = 'text';
    directory.setAttribute('aria-label', '远端工作目录');
    directory.placeholder = '/Users/you/project';
    directory.value = config.directory;
    directory.addEventListener('change', () => { void setCurrentDirectory(directory.value); });
    const browse = secondaryButton('浏览', () => void openDirectoryBrowser());
    browse.setAttribute('aria-label', '浏览远端目录');
    browse.disabled = !selectedMachine()?.active;
    directoryRow.append(directory, browse);

    const recent = currentRecentDirectories();
    const recentPicker = document.createElement('select');
    recentPicker.className = 'recent-directory';
    recentPicker.setAttribute('aria-label', '最近使用的远端目录');
    recentPicker.append(new Option(recent.length > 0 ? '选择最近使用的目录…' : '暂无历史目录', ''));
    for (const path of recent) recentPicker.append(new Option(path, path));
    recentPicker.disabled = recent.length === 0;
    recentPicker.addEventListener('change', () => {
        if (recentPicker.value) void setCurrentDirectory(recentPicker.value);
    });

    section.append(row, directoryRow, recentPicker);
    return section;
}

function renderDirectoryBrowser(): HTMLElement {
    const section = element('section', 'directory-browser');
    const header = element('div', 'directory-browser-header');
    const labels = element('div');
    labels.append(element('strong', '', '选择远端目录'));
    if (directoryBrowserListing) labels.append(element('span', 'directory-path', directoryBrowserListing.path));
    const close = secondaryButton('取消', closeDirectoryBrowser);
    header.append(labels, close);
    section.append(header);

    if (directoryBrowserHint) section.append(element('div', 'directory-hint', directoryBrowserHint));
    if (directoryBrowserError) section.append(element('div', 'notice notice-error directory-notice', directoryBrowserError));
    if (directoryBrowserLoading) {
        const loading = element('div', 'directory-loading');
        loading.append(element('span', 'spinner'), element('span', '', '正在读取远端目录…'));
        section.append(loading);
        return section;
    }

    const listing = directoryBrowserListing;
    if (!listing) return section;

    const actions = element('div', 'directory-actions');
    const up = secondaryButton('上一级', () => {
        if (listing.parent) void loadRemoteDirectory(listing.parent);
    });
    up.disabled = listing.parent === null;
    const home = secondaryButton('主目录', () => void loadRemoteDirectory(listing.home));
    actions.append(up, home);
    section.append(actions);

    const list = element('div', 'directory-list');
    list.setAttribute('role', 'list');
    if (listing.directories.length === 0) {
        list.append(element('p', 'directory-empty', '这个目录下没有可浏览的子文件夹。'));
    }
    for (const item of listing.directories) {
        const button = element('button', 'directory-entry') as HTMLButtonElement;
        button.type = 'button';
        button.setAttribute('aria-label', `打开文件夹 ${item.name}`);
        button.append(
            element('span', 'directory-icon', item.isProjectRoot ? '◆' : '▸'),
            element('span', 'directory-name', item.name),
            item.isProjectRoot ? element('span', 'project-badge', 'Git') : element('span'),
        );
        button.addEventListener('click', () => void loadRemoteDirectory(item.path));
        list.append(button);
    }
    section.append(list);

    const use = primaryButton('使用当前目录', () => void chooseBrowsedDirectory());
    use.classList.add('directory-use');
    section.append(use);
    return section;
}

function renderMessages(): HTMLElement {
    const list = element('section', 'message-list');
    list.setAttribute('aria-label', '会话消息');
    if (messages.length === 0) {
        const empty = element('div', 'empty-state');
        empty.append(element('strong', '', '从当前网页开始一条远端会话'), element('p', '', pageContext?.selection ? '已捕获选中内容，发送时可以一并带给 Agent。' : '你可以直接提问，也可以先在网页中选中一段内容。'));
        list.append(empty);
    } else {
        for (const message of messages) {
            const item = element('article', 'message');
            item.append(element('p', '', messageText(message.content)));
            list.append(item);
        }
    }
    queueMicrotask(() => { list.scrollTop = list.scrollHeight; });
    return list;
}

function renderRequests(): HTMLElement {
    const section = element('section', 'request-list');
    section.setAttribute('aria-label', '待审批的 Agent 请求');
    for (const request of requests) {
        const card = element('article', 'request-card');
        card.append(
            element('strong', '', `Agent 请求：${request.type}`),
            element('pre', 'request-payload', requestPayloadText(request.payload)),
            element('p', 'request-boundary', '为防止网页点击劫持，请在 Paws 自有客户端中审批。此悬浮球不会执行审批操作。'),
        );
        section.append(card);
    }
    return section;
}

function renderComposer(): HTMLElement {
    const form = element('form', 'composer') as HTMLFormElement;
    const textarea = document.createElement('textarea');
    const send = primaryButton(busy ? '发送中…' : '发送', () => undefined);
    send.type = 'submit';
    send.disabled = busy || !draft.trim();
    textarea.placeholder = '告诉远端 Agent 你想做什么…';
    textarea.value = draft;
    textarea.rows = 3;
    textarea.addEventListener('input', () => {
        draft = textarea.value;
        send.disabled = busy || !draft.trim();
    });
    textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    const footer = element('div', 'composer-footer');
    const contextLabel = element('label', 'context-toggle');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = includeContext;
    checkbox.addEventListener('change', () => { includeContext = checkbox.checked; });
    contextLabel.append(checkbox, element('span', '', pageContext?.selection ? '带上选中内容' : '带上当前网页'));
    footer.append(contextLabel, send);
    form.append(textarea, footer);
    form.addEventListener('submit', event => { event.preventDefault(); void sendDraft(false); });
    return form;
}

async function beginLink(): Promise<void> {
    if (!config.serverUrl.trim()) return;
    config.serverUrl = normalizeServerUrl(config.serverUrl);
    busy = true;
    errorText = '';
    linkController?.abort();
    const controller = new AbortController();
    linkController = controller;
    try {
        qrDataUrl = '';
        linkUrl = '';
        phase = 'linking';
        statusText = '正在生成绑定码';
        busy = false;
        render();
        await saveConfig();
        const link = await startBrowserAccountLink({
            serverUrl: config.serverUrl,
            credentials,
            signal: controller.signal,
        });
        linkUrl = link.qrUrl;
        qrDataUrl = await QRCode.toDataURL(link.qrUrl, { width: 220, margin: 1, color: { dark: '#1c1917', light: '#fffaf2' } });
        phase = 'linking';
        statusText = '等待扫码';
        busy = false;
        render();
        await link.waitForAuthorization({ signal: controller.signal });
        if (linkController === controller) linkController = null;
        phase = 'connecting';
        statusText = '正在连接';
        render();
        await connectClient();
    } catch (cause) {
        if (controller.signal.aborted) return;
        busy = false;
        phase = 'signedOut';
        errorText = errorMessage(cause);
        statusText = '连接失败';
        render();
    }
}

function cancelLink(): void {
    linkController?.abort(new Error('Account linking cancelled'));
    linkController = null;
    phase = 'signedOut';
    statusText = '未连接';
    busy = false;
    render();
}

async function connectClient(): Promise<void> {
    try {
        unsubscribe?.();
        await client?.dispose();
        client = new PawsAgentClient({ serverUrl: config.serverUrl, credentials, storage });
        unsubscribe = client.subscribe(event => {
            if (event.type === 'connection') {
                statusText = event.state === 'ready' ? '已连接' : event.state === 'reconnecting' ? '正在重连' : '连接中';
                render();
            }
            if (event.type === 'machines') {
                machines = sortMachinesForPicker(event.machines);
                render();
            }
            if (event.type === 'session') {
                sessions = [event.session, ...sessions.filter(item => item.id !== event.session.id)];
                render();
            }
            if (event.type === 'message' && event.sessionId === config.sessionId) {
                if (!messages.some(item => item.id === event.message.id)) messages.push(event.message);
                render();
            }
            if (event.type === 'request' && event.sessionId === config.sessionId) {
                requests = [...requests.filter(item => item.id !== event.request.id), event.request];
                render();
            }
            if (event.type === 'error') {
                errorText = event.error.message;
                render();
            }
        });
        await client.connect();
        machines = sortMachinesForPicker(await client.machines.list());
        sessions = await client.sessions.list();
        const previousMachineId = config.machineId;
        const configuredMachine = machines.find(item => item.id === config.machineId && item.active);
        config.machineId = configuredMachine?.id ?? machines.find(item => item.active)?.id ?? machines[0]?.id ?? '';
        if (previousMachineId && previousMachineId !== config.machineId) {
            config.sessionId = '';
            messages = [];
            requests = [];
        }
        applyPreferredDirectory();
        if (config.sessionId) {
            const savedSession = sessions.find(item => item.id === config.sessionId);
            if (sessionMatchesTarget(savedSession, config.machineId, config.directory)) {
                messages = await client.messages.history(config.sessionId, { limit: 50 });
            } else {
                clearConversationState();
            }
        }
        await saveConfig();
        phase = 'ready';
        statusText = '已连接';
        errorText = '';
        render();
    } catch (cause) {
        phase = 'signedOut';
        statusText = '需要重新连接';
        errorText = errorMessage(cause);
        render();
    }
}

async function sendDraft(approvedNewDirectoryCreation: boolean): Promise<void> {
    if (!client || busy || !draft.trim() || !config.machineId || !config.directory.trim()) {
        if (!config.machineId) errorText = '没有可用的在线机器。';
        else if (!config.directory.trim()) errorText = '请先填写远端工作目录。';
        render();
        return;
    }
    if (!selectedMachine()?.active) {
        errorText = '所选机器当前离线，请切换到在线机器。';
        render();
        return;
    }
    busy = true;
    errorText = '';
    pendingDirectoryApproval = false;
    render();
    try {
        if (!config.sessionId) {
            const result = await client.sessions.spawn({
                machineId: config.machineId,
                directory: config.directory.trim(),
                approvedNewDirectoryCreation,
                agent: 'codex',
            });
            if (result.type === 'requestToApproveDirectoryCreation') {
                pendingDirectoryApproval = true;
                busy = false;
                render();
                return;
            }
            if (result.type === 'error') throw new Error(result.errorMessage);
            config.sessionId = result.sessionId;
            await saveConfig();
        }
        await client.messages.send({
            sessionId: config.sessionId,
            text: composePrompt(draft, pageContext, includeContext),
            meta: pageContext ? { source: 'paws-agent-chrome', pageUrl: pageContext.url } : { source: 'paws-agent-chrome' },
        });
        draft = '';
        messages = await client.messages.history(config.sessionId, { limit: 50 });
        busy = false;
        render();
    } catch (cause) {
        busy = false;
        errorText = errorMessage(cause);
        render();
    }
}

async function resetSession(): Promise<void> {
    clearConversationState();
    await saveConfig();
    render();
}

async function selectMachine(machineId: string): Promise<void> {
    if (machineId === config.machineId) return;
    rememberCurrentDirectory();
    config.machineId = machineId;
    clearConversationState();
    closeDirectoryBrowser();
    applyPreferredDirectory();
    await saveConfig();
    render();
}

async function setCurrentDirectory(value: string): Promise<void> {
    const nextDirectory = value.trim();
    if (nextDirectory !== config.directory) clearConversationState();
    config.directory = nextDirectory;
    rememberCurrentDirectory();
    pendingDirectoryApproval = false;
    await saveConfig();
    render();
}

async function openDirectoryBrowser(): Promise<void> {
    const machine = selectedMachine();
    if (!client || !machine?.active) {
        errorText = '请选择一台在线机器后再浏览目录。';
        render();
        return;
    }
    directoryBrowserOpen = true;
    directoryBrowserHint = '';
    directoryBrowserError = '';
    directoryBrowserListing = null;
    render();
    const requestedPath = config.directory.trim();
    const machineId = machine.id;
    const loaded = await loadRemoteDirectory(requestedPath);
    if (!loaded && requestedPath && directoryBrowserOpen && config.machineId === machineId) {
        directoryBrowserHint = '原目录当前不可用，已回到这台机器的主目录。';
        await loadRemoteDirectory('');
    }
}

async function loadRemoteDirectory(path: string): Promise<boolean> {
    if (!client || !config.machineId) return false;
    const machineId = config.machineId;
    const requestToken = ++directoryBrowserRequestToken;
    directoryBrowserLoading = true;
    directoryBrowserError = '';
    render();
    try {
        const result = await client.machines.browseDirectory({ machineId, path });
        if (requestToken !== directoryBrowserRequestToken || config.machineId !== machineId || !directoryBrowserOpen) {
            return false;
        }
        if (!result.success) {
            directoryBrowserError = result.error;
            directoryBrowserLoading = false;
            render();
            return false;
        }
        directoryBrowserListing = result;
        directoryBrowserLoading = false;
        render();
        return true;
    } catch (cause) {
        if (requestToken !== directoryBrowserRequestToken || config.machineId !== machineId || !directoryBrowserOpen) {
            return false;
        }
        directoryBrowserError = errorMessage(cause);
        directoryBrowserLoading = false;
        render();
        return false;
    }
}

async function chooseBrowsedDirectory(): Promise<void> {
    const path = directoryBrowserListing?.path;
    if (!path) return;
    closeDirectoryBrowser();
    await setCurrentDirectory(path);
}

function closeDirectoryBrowser(): void {
    directoryBrowserRequestToken += 1;
    directoryBrowserOpen = false;
    directoryBrowserLoading = false;
    directoryBrowserListing = null;
    directoryBrowserError = '';
    directoryBrowserHint = '';
    render();
}

function clearConversationState(): void {
    config.sessionId = '';
    messages = [];
    requests = [];
    pendingDirectoryApproval = false;
}

function applyPreferredDirectory(): void {
    const machine = selectedMachine();
    config.directory = resolvePreferredDirectory({
        machineId: config.machineId,
        directoriesByMachine: config.directoriesByMachine,
        recentDirectories: currentRecentDirectories(),
        homeDirectory: machineHomeDirectory(machine),
    });
    rememberCurrentDirectory();
}

function rememberCurrentDirectory(): void {
    if (!config.machineId) return;
    const directory = config.directory.trim();
    if (directory) config.directoriesByMachine[config.machineId] = directory;
    else delete config.directoriesByMachine[config.machineId];
}

function selectedMachine(): Machine | undefined {
    return machines.find(item => item.id === config.machineId);
}

function currentRecentDirectories(): string[] {
    return recentDirectoriesForMachine(sessions, config.machineId);
}

function setExpanded(value: boolean): void {
    expanded = value;
    syncHostState();
    render();
}

function syncHostState(): void {
    window.parent.postMessage({ type: 'paws:bubble:resize', expanded }, '*');
    if (expanded) window.parent.postMessage({ type: 'paws:bubble:request-context' }, '*');
}

function saveConfig(): Promise<void> {
    return storage.set(CONFIG_KEY, JSON.stringify(config));
}

function isPageContext(value: unknown): value is PageContext {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<PageContext>;
    return typeof candidate.title === 'string' && typeof candidate.url === 'string' && typeof candidate.selection === 'string';
}

function machinePickerLabel(machine: Machine): string {
    if (machine.active) return `${machineDisplayName(machine)} · 在线`;
    return `${machineDisplayName(machine)} · 离线 · ${formatLastActive(machine.activeAt)}`;
}

function formatLastActive(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '未记录活跃时间';
    return `最后活跃 ${new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp))}`;
}

function stringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
}

function messageText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(messageText).filter(Boolean).join('\n');
    if (content && typeof content === 'object') {
        const value = content as Record<string, unknown>;
        for (const key of ['text', 'message', 'content', 'data']) {
            if (key in value) {
                const result = messageText(value[key]);
                if (result) return result;
            }
        }
        try { return JSON.stringify(content, null, 2); } catch { return '收到一条新消息'; }
    }
    return content == null ? '' : String(content);
}

function requestPayloadText(payload: unknown): string {
    if (typeof payload === 'string') return payload;
    try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
}

function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : '发生了未知错误，请重试。';
}

function primaryButton(label: string, handler: () => void): HTMLButtonElement {
    const button = element('button', 'button button-primary', label) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
}

function secondaryButton(label: string, handler: () => void): HTMLButtonElement {
    const button = element('button', 'button button-secondary', label) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}
