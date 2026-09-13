type ChromeStorageValue = Record<string, unknown>;

declare const chrome: {
    runtime: {
        id: string;
        reload(): void;
        getURL(path: string): string;
        sendMessage(message: unknown): Promise<any>;
        onMessage: { addListener(listener: (message: unknown, sender: import('./annotationRuntime').DraftSender, respond: (response: unknown) => void) => boolean): void };
    };
    storage: {
        session: { get(key: string): Promise<ChromeStorageValue>; set(items: ChromeStorageValue): Promise<void>; remove(key: string | string[]): Promise<void> };
        local: {
            get(key: string): Promise<ChromeStorageValue>;
            set(items: ChromeStorageValue): Promise<void>;
            remove(key: string): Promise<void>;
        };
    };
    tabs: { onRemoved: { addListener(listener: (tabId: number) => void): void } };
};
