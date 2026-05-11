<p align="center">
  <img src="docs/logo.svg" alt="MoFlow" width="128">
</p>

<h1 align="center">MoFlow</h1>

<p align="center">一款注重写作体验的极简桌面 Markdown 编辑器。</p>

<p align="center">
  中文 | <a href="./README.md">English</a>
</p>

[![MoFlow 截图](docs/cover.png)](https://github.com/xmm1989218/moflow)

## 安装

从 [Releases 页面](https://github.com/xmm1989218/moflow/releases/latest) 下载最新安装包。

| 平台 | 下载 |
|---|---|
| Windows | `MoFlow_x.y.z_x64-setup.exe` |

> 安装后，MoFlow 会在启动时自动检查更新，有新版本时通知您一键安装。

## 功能特性

- **无干扰编辑** — 无边框窗口，自定义标题栏，简洁界面
- **丰富的 Markdown 支持** — GFM（表格、删除线、任务列表）、数学公式（KaTeX）、Mermaid 图表、代码高亮（Prism）、高亮（`==text==`）
  详见 [Markdown 语法支持](./tests/markdown-support.md)
- **多标签页** — 多文件即时切换，自动保存，保留滚动位置、光标和撤销历史
- **双主题** — 浅色/深色主题，平滑切换
- **导出** — 支持 HTML 和 PDF 导出
- **AI 侧边栏** — 集成 AI 对话，支持上下文管理、自动压缩、用量追踪
- **AI 工具调用** — AI 可主动探索文档（outline、grep、read_lines、read_section），不再依赖截断上下文
- **工作区感知 AI** — 打开文件夹作为工作区，AI 获得项目级工具（grep、find、glob、ls、read）探索整个项目；工作区对话在标签切换间持久保留
- **选中文本 AI** — 对选中内容进行解释、翻译或提问
- **设置面板** — 统一设置面板，包含外观、AI 配置、代理、关于
- **代理支持** — HTTP/HTTPS/SOCKS5 代理，用于 AI 请求和网页内容获取
- **查找替换** — 支持正则、大小写敏感、全部替换
- **大纲侧栏** — 文档标题树，点击跳转，活跃标题追踪
- **Mermaid 图表** — 流程图、时序图、类图等内联 SVG 渲染
- **工作区与文件树** — 打开文件夹作为工作区，文件树浏览，右键新建/重命名/删除文件和文件夹
- **图片管理** — 粘贴图片自动保存到 `./assets/`，Markdown 中使用相对路径，HTML 导出时 base64 内嵌
- **自动更新** — 启动时静默检查，后台下载，非侵入式通知，一键安装并重启
- **状态栏** — 字数统计、光标位置、文件信息一目了然
- **Tailwind 优先样式** — 组件样式使用 Tailwind CSS 工具类 + CSS 自定义属性实现主题切换；仅编辑器 DOM 覆盖保留 CSS 文件

## 参与贡献

如果您想为 MoFlow 贡献代码，请阅读 [Contributing Guide](./CONTRIBUTING.md) 了解开发环境搭建、项目结构和发布流程。

## 许可证

MIT
