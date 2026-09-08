# Paws Agent Chrome

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
