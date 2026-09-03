# Paws Agent Chrome

[English](README.md)

这是一个 Manifest V3 浏览器扩展，会在 Chromium 网页右下角加入 Paws Agent 悬浮球。用户可以绑定现有 Paws 账号、选择在线机器和远端目录、携带当前网页上下文发起会话，并在原有 Paws 客户端中继续同步对话。

## 为什么拆成独立仓库

插件最初位于 [`wangjs-jacky/happy`](https://github.com/wangjs-jacky/happy) 的 `packages/paws-agent-chrome`，现从提交 [`42a6773e`](https://github.com/wangjs-jacky/happy/commit/42a6773e38e3ea919ec75cc9286d447b14de2e79) 抽离，以便独立开发、测试和发布。

由于 `@wangjs-jacky/paws-agent` 暂未发布到 npm，仓库在 [`vendor/sdk`](vendor/sdk/UPSTREAM.md) 中固定了一份最小浏览器 SDK 源码快照，保证全新克隆后也能独立构建。npm bootstrap 完成后，只需把根目录依赖换成 registry 版本并删除 vendor 目录，扩展业务代码不需要修改。

## 构建

需要 Node.js 20.19+ 和 pnpm 10.11。

```bash
pnpm install
pnpm verify
```

构建结果位于 `dist/`，可以通过 `chrome://extensions` 的“加载已解压的扩展程序”安装。

## 自动化测试

```bash
pnpm test:e2e
pnpm test:e2e:record
pnpm test:e2e:ego
pnpm test:e2e:ego:record
```

- `PAWS-CHROME-BUBBLE-01`：使用临时本地协议服务，覆盖绑定、凭证保存、机器选择、目录授权、网页上下文、远端回复、重连与权限边界。
- `PAWS-EGO-LITE-HOST-01`：使用 Ego Lite 一次性浏览器配置，验证真实扩展 iframe、`chrome.storage` 和浏览器完整重启后的重连，不接触用户日常配置，也不连接生产账号。

历史真机验收截图和录像保存在 [`docs/evidence`](docs/evidence)。

## 安全边界

网页始终被视为不可信环境。高权限 Agent 请求可以显示详情，但悬浮球不会提供允许/拒绝按钮；最终审批必须在 Paws 自有客户端完成。详细规则见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT
