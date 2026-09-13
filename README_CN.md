# Paws Agent Chrome

## v0.0.8

- 正文使用 Streamdown 渲染 Markdown，过程按轮次折叠，显示具体 Skill 名称，修复上翻时强制滚底。
- Mermaid 导出 PNG 缩略图，独立看图页支持适配窗口、原始尺寸和下载。
- 支持选择、粘贴及拖拽图片；SDK 加密上传后发送附件与文字。扩展新增指定 OSS 附件域名权限。
- 修复新版 Paws 创建 Codex 会话所需的一次性授权。SDK 仍固定为 beta.2，通过仓库内 pnpm 补丁应用授权及图片能力，尚未回迁 Happy 上游源码。
- 当前为完整消息实时展示，不包含正文增量流式传输。图片草稿刷新后不保留。

日常快速预发布：暂存本次批准的文件后运行 `pnpm preview:publish --message "变更说明"`。目标一分钟内拿包，完整 CI 后台运行；稳定版流程不变。首次使用与失败处理见[快速流程](docs/fast-preview.md)。仅本地演练加 `--check`，不会推送或发布。

v0.0.7 增加 Agentation 页面批注、预览后批量提问、折叠设置与当前会话跳转。
Agentation 3.0.2 使用 PolyForm Shield，完整声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)；项目 MIT 不替代第三方许可。

维护者于 2026-09-13 确认已取得本集成的公开发布授权；这不意味着下游使用者自动获得第三方许可之外的授权。

本地验证与合成夹具启动：

快速本地迭代用 `pnpm verify:fast`：类型检查、双进程单测、构建，不运行 Playwright 或 Ego。
原有 `pnpm verify`、GitHub CI/Release 浏览器检查保持不变；快速检查不代表浏览器验收已通过。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
node scripts/startAnnotationFixture.mjs
```

用 Ego 打开输出的本机地址。夹具预置假账号，通过本地 SDK 加密请求返回合成回复；其 runtime/storage 是模拟协议，不代表安装后的 MV3，也不使用生产凭据。

点击左下角「开启批注」，在段落内选择文字（支持行内格式）或点击元素，在真实 Agentation 弹窗中填写问题。「编辑 / 删除」及编号标记可修改草稿，Esc 退出模式。在右下角面板点击「发送」先预览完整内容与设备、目录、会话，再「确认发送」。批注本身也可以独立发送。预览冻结内容；发送期间新增或编辑的草稿不会被旧批次清除。结果未知时保留草稿，先查看会话再自行决定重试，不自动重发；已接收但读取历史失败会明确标记「消息已发送」。

设置默认收起，目标摘要、连接状态、新会话及会话链接始终可见。草稿按标签页生命周期和完整 URL 隔离，刷新恢复，同标签页 SPA 路由切换分别保存；不保证浏览器重启恢复。面板支持清空当前页。批量提示词默认省略 URL query/hash，勾选完整链接才发送。上限为每页 20 条、问题 2,000 字符、引用 6,000 字符、邻文合计 2,000 字符、提示词 40,000 字符；截断会标记，问题/整批超限会阻止发送。

只使用公开 AnnotationPopupCSS 与 getElementPath；构建时提取原版弹窗 CSS 至 Shadow DOM，不嵌入写网站 localStorage 的完整工具条，不修改 node_modules 或组件逻辑。上游导入仍安装定时器包装；真实 MV3 隔离世界与网站 JS 分离，合成夹具则共用页面世界，未启用冻结。可见 UI 不是对网站保密的容器。跨段落选择、跨域 iframe、浏览器内部页/PDF、任意 Shadow DOM、未渲染的虚拟列表不在第一版支持范围。定位验证引用与上下文，回退最多检查 2,000 个文本节点；无法确认则提示原文位置变化，不猜测。真实浏览器覆盖见 `docs/evidence/agentation-local.md`。

[English](README.md)

这是一个 Manifest V3 浏览器扩展，会在 Chromium 网页右下角加入 Paws Agent 悬浮球。用户可以绑定现有 Paws 账号、选择在线机器和远端目录、携带当前网页上下文发起会话，并在原有 Paws 客户端中继续同步对话。

## 为什么拆成独立仓库

插件最初位于 [`wangjs-jacky/happy`](https://github.com/wangjs-jacky/happy) 的 `packages/paws-agent-chrome`，现从提交 [`42a6773e`](https://github.com/wangjs-jacky/happy/commit/42a6773e38e3ea919ec75cc9286d447b14de2e79) 抽离，以便独立开发、测试和发布。

扩展现使用已发布的 [`@wangjs-jacky/paws-agent`](https://www.npmjs.com/package/@wangjs-jacky/paws-agent/v/0.1.0-beta.2) SDK：`package.json` 精确固定为 `0.1.0-beta.2`，`pnpm-lock.yaml` 锁定包完整性，不再维护 vendor 源码副本。SDK 由上游仓库的 GitHub Actions 构建并发布；扩展构建时会打包 SDK 浏览器入口，安装扩展的用户无需安装 npm。

## 构建

需要 Node.js 20.19+ 和 pnpm 10.11。

```bash
pnpm install
pnpm verify
```

构建结果位于 `dist/`，可以通过 `chrome://extensions` 的“加载已解压的扩展程序”安装。

### 开发模式

首次执行 `pnpm dev` 后，在 `chrome://extensions` 加载本仓库的 `dist/`。此命令会监听
`src/`、`static/` 与 `scripts/`，每次保存后重新构建，并让已打开的普通网页自动重载扩展和页面。
首次加载开发版 `dist/` 后保持目标网页打开，即可接收后续保存触发的重载。
开发构建会额外允许本机重载服务；不可用于打包或发布。退出命令后，运行一次 `pnpm build` 并在
扩展管理页重新加载，即可恢复生产权限集。

```bash
pnpm dev
# 可选：避免本机端口冲突
PAWS_EXTENSION_DEV_PORT=37652 pnpm dev
```

目录选择区下方固定显示“当前会话”和“在 Paws 中打开 ↗”。会话 ID 过长时会
省略显示，悬停可查看完整 ID；点击入口会在新标签页打开当前配置的 Paws Web
对应会话，不替换原网页。会话尚未创建时显示“尚未创建”；新建会话或切换机器、
目录后会清除旧链接。Paws Web 需要单独登录，扩展不会通过链接传递账号凭证。

## 安装 Release

1. 从 [GitHub Releases](https://github.com/wangjs-jacky/paws-agent-chrome/releases)
   下载 `paws-agent-chrome-vX.Y.Z.zip` 及同名 `.sha256` 文件。
2. 把两个文件放在同一目录并校验：

   ```bash
   shasum -a 256 -c paws-agent-chrome-vX.Y.Z.sha256
   ```

3. 将 ZIP 解压到一个长期保留的目录。扩展文件直接位于 ZIP 根目录；Chrome
   不能直接加载 ZIP。
4. 打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，
   选择刚才的解压目录。

升级时，用新版文件替换原解压目录中的文件，保持目录路径不变，然后在
`chrome://extensions` 的扩展卡片上点击“重新加载”。保持原路径可以保留 unpacked
扩展的 ID 和已绑定账号的本地存储。

### v0.0.6 SDK 依赖迁移

删除临时 vendor SDK，改用 npm 上的 `0.1.0-beta.2` 精确版本。启动快照复用、
连接同步状态和按 ID 查询会话等修复已合入上游 SDK；保留 v0.0.4 / v0.0.5 的
连接恢复与发送期间切换会话保护。

### v0.0.5 发送修复

发送消息和处理会话更新时，只读取目标会话，不再反复下载全部会话列表。
发送期间点击“新会话”或切换机器、目录后，旧操作不会覆盖新会话、清空新草稿
或抛出空 sessionId 错误。已经发往原会话的消息仍可能在原会话完成；尚在创建
阶段的旧任务不会继续发送草稿。界面会区分创建会话、发送消息和读取消息三个阶段。

### v0.0.4 连接修复

启动时复用 SDK 已同步的机器和会话列表，避免重复下载。连接中会分别显示
“正在连接服务器”“正在同步机器和会话”和“正在恢复会话消息”。如果启动
超过 45 秒，扩展会释放旧连接、显示失败阶段并提供“重试连接”；账号绑定和
目标目录会保留，无需因暂时网络故障重新扫码。凭证失效或地址有误时，可从
失败页进入“重新绑定 / 修改地址”。

目标选择器会列出全部已绑定机器并标注在线状态，设备名优先使用
`displayName`、其次使用 `host`。工作目录既可手动输入，也可从历史会话中
选择，或通过远端目录浏览器逐级选择；每台机器会分别记住最后一次目录。
机器在线状态和新出现的历史目录会实时同步；切换机器或目录时会自动脱离
原会话，不会把旧会话错误恢复到另一个机器/目录中。

## 图片输入

会话输入区支持“添加图片”、粘贴截图和拖拽图片。首版支持 PNG、JPEG、WebP，最多 4 张、每张 10 MB；可以只发图片。发送前可预览和移除，失败保留当前页面内的图片草稿，刷新页面会丢失尚未发送的图片。

SDK 依赖补丁负责按会话密钥派生图片密钥、加密上传，并将标准 file 事件和文字一起提交。扩展仅额外授权已确认的附件存储域名，不向 OSS 发送 Paws 账号令牌。当前浏览器自动化验证使用本地加密协议夹具，线上 Codex 看图结果仍需实际会话验收。

## 自动化测试

```bash
pnpm test:production:https
pnpm test:e2e
pnpm test:e2e:record
pnpm test:e2e:mv3
pnpm test:e2e:mv3:record
pnpm test:e2e:ego
pnpm test:e2e:ego:record
```

- `PAWS-CHROME-BUBBLE-01`：使用临时本地协议服务，覆盖绑定、凭证保存、设备名回退、机器状态实时变化、历史目录初始/实时同步、主目录范围内的远端目录浏览、每机路径持久化、目录授权、网页上下文、远端回复、目标安全的重置/重连与权限边界。
- `PAWS-CHROME-HTTPS-01`：在 HTTPS 宿主页中加载真实 Manifest V3 扩展，覆盖受信任的 `https://47.115.228.20:8443` 默认地址、主机权限、绑定请求和二维码渲染，防止 Mixed Content 回归。
- `pnpm test:production:https`：发布前执行的真实生产检查，覆盖 TLS 证书、健康接口、绑定接口与 `/v1/updates` Engine.IO 握手；只会反复更新同一条未认证哨兵绑定记录，不会无限新增探针数据，因此不放进 CI。
- `PAWS-EGO-LITE-HOST-01`：使用 Ego Lite 一次性浏览器配置，验证真实扩展 iframe、`chrome.storage` 和浏览器完整重启后的重连，不接触用户日常配置，也不连接生产账号。

历史真机验收截图和录像保存在 [`docs/evidence`](docs/evidence)。

## 自动发布

维护者通过 Pull Request 更新 `package.json` 版本。合并后，推送与版本完全一致的
tag（例如 `v0.0.3`）会触发 Release 工作流。流水线会重新执行单测、浏览器测试、
真实 MV3 HTTPS 与线上生产探针，再执行生产构建；随后校验版本与精确权限白名单，
生成根目录无外层文件夹的 ZIP 及 SHA256 文件，并创建或安全更新对应的 GitHub
Release。构建与测试阶段只有仓库只读权限，写权限只在最后发布 job 中开放。

本地可以执行同一套打包契约：

```bash
pnpm run package:release -- --tag v0.0.3
cd release-artifacts
shasum -a 256 -c paws-agent-chrome-v0.0.3.sha256
```

## 安全边界

网页始终被视为不可信环境。高权限 Agent 请求可以显示详情，但悬浮球不会提供允许/拒绝按钮；最终审批必须在 Paws 自有客户端完成。详细规则见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT
