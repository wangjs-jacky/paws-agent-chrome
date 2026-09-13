# 消息展示边界

消息展示分为两层，替换前端时无需重新解释 Paws 原始消息。

- `src/messagePresentation.ts`：纯数据适配，不依赖 DOM、React 或 SDK 实例。输入消息记录，输出正文、状态和按轮次归组的过程；Skill 名称从真实工具参数读取。
- `src/messageRenderer.ts`：定义 `MessageRenderer.mount(container, markdown)` 接口，返回销毁函数。当前实现是 React + Streamdown，Mermaid 使用本地打包的插件。新渲染器可实现相同接口；全新前端也可直接消费数据适配层。
- `src/panel.ts`：负责会话订阅、列表布局、滚动和渲染器生命周期。

当前使用静态模式：完整消息收到后直接展示，不模拟逐字输出。真实增量传输仍需上游支持。

正文禁用原始 HTML；链接使用安全协议过滤与新窗口隔离；Mermaid 使用 strict 模式。浏览器回归覆盖标题、加粗、列表、表格、代码、图表以及脚本和危险链接处理。

当前 Mermaid 全量随面板打包，增加初次解析成本；未来拆分懒加载时需同步更新扩展资源和发布文件清单。
