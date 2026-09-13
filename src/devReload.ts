declare const __PAWS_DEV_RELOAD_URL__: string;

/** 仅由开发构建注入本机重载地址；生产构建的常量为空字符串。 */
export function enableDevelopmentReload(): void {
    if (typeof __PAWS_DEV_RELOAD_URL__ !== 'string' || !__PAWS_DEV_RELOAD_URL__) return;
    let stopped = false;
    const waitForChange = async (): Promise<void> => {
        while (!stopped) {
            try {
                const response = await fetch(`${__PAWS_DEV_RELOAD_URL__}/wait`, { cache: 'no-store' });
                if (stopped) return;
                if (response.status === 200) {
                    const refresh = document.createElement('meta');
                    refresh.httpEquiv = 'refresh';
                    refresh.content = '1';
                    refresh.dataset.pawsDevReload = 'true';
                    document.head.append(refresh);
                    void chrome.runtime.sendMessage({ type: 'paws:dev:reload' });
                    return;
                }
            } catch {
                // 开发服务重启时继续轮询，避免一次暂时断连就停止热重载。
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    };
    window.addEventListener('pagehide', () => { stopped = true; }, { once: true });
    void waitForChange();
}

export function isDevelopmentReloadMessage(message: unknown): boolean {
    return typeof __PAWS_DEV_RELOAD_URL__ === 'string'
        && Boolean(__PAWS_DEV_RELOAD_URL__)
        && typeof message === 'object'
        && message !== null
        && (message as { type?: unknown }).type === 'paws:dev:reload';
}
