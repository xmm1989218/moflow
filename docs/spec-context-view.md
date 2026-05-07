# Context View Spec

## 交互行为

- **UsageBadge 圈圈改为可点击**，加 `cursor: pointer`
- 点击 → sidebar 内容区从 AI 聊天切换为上下文视图
- 再点 → 切回 AI 聊天
- header 标题随之变化：`AI 助手` ↔ `上下文`
- 上下文视图时隐藏输入框（只读查看）
- 流式生成中也可以切换查看

## 视觉布局

```
┌─────────────────────────────────┐
│ 上下文                    🔧 ⚙️ │  ← header，标题随视图切换
├─────────────────────────────────┤
│ 统计信息                        │  ← section header（统一样式）
│ 1,684 / 128,000 tokens          │
│ Tools: outline, grep, ...       │  ← 有工具时显示，无则不显示
│ Cost: $0.02                     │
│                                 │
│ 上下文占比                      │  ← section header
│ ████████░░░░░░░░░░░░            │  ← 堆叠条形图（一行 4 色段）
│ ● system 35%  ● user 12%       │  ← 图例
│ ● assistant 28%  ● tool 8%     │
│                                 │
│ 原始消息                        │  ← section header
│ ▶ system    abc123              │  ← 折叠态：role + id前8位
│ ▶ user      def456              │
│   Methods 部分写了什么？        │  ← 展开态：原始内容
│ ▶ assistant ghi789  [outline,..]│  ← toolCalls 标注工具名
│ ▶ tool      jkl012  outline     │  ← tool 消息显示 toolName
│ ▶ assistant mno345              │
│   Methods 部分包含三个子章节...  │
└─────────────────────────────────┘
```

## 三个 Section 详细设计

### 1. 统计信息

| 项目 | 数据来源 | 说明 |
|---|---|---|
| Token 使用 | `chatStore.contextTokensMap[tabId]` / `modelInfo.maxContext` | 如 `1,684 / 128,000 tokens` |
| 工具定义 | `buildSystemPrompt()` 返回的 `needsDocTools` 为 true 时，列出 `toolDefinitions` 中的工具名 | 无工具时不显示此行 |
| 费用 | `chatStore.costMap[tabId]` + `modelInfo.currency` | `formatCost()` 格式化 |

### 2. 上下文占比（堆叠条形图）

- 一行堆叠横向条（`h-2 w-full rounded-full`），4 色段按比例排列：
  - system 灰 `#9ca3af`
  - user 蓝 `#3b82f6`
  - assistant 绿 `#22c55e`
  - tool 紫 `#a855f7`
- 条形图下方图例：4 行，每行 `● 分类名 百分比%`
- 数据来源：
  - `estimateTokens()` 按角色分类累加（system = systemPrompt，user = role=user 消息，assistant = role=assistant 消息含 toolCalls.arguments，tool = role=tool 消息）
  - 归一化到 `contextTokens`：估算总和 < contextTokens → 差额归入 "other"（不显示为独立段，调整比例使总量匹配）；估算总和 > contextTokens → 按比例缩小各类
- 百分比基于上下文总 token（四类之和），不是 maxContext

### 3. 原始消息

- 遍历 contextMap：`[systemMsg, ...contextMsgs]`
- 每条消息一行折叠态：

| 角色 | 显示 | 展开默认 | 颜色 |
|---|---|---|---|
| `system` | `▶ system  {id前8位}` | 折叠 | 灰色 |
| `user` | `▶ user  {id前8位}` | 展开 | 蓝色 |
| `assistant` | `▶ assistant  {id前8位}  [tool1, tool2]` | 展开 | 绿色 |
| `tool` | `▶ tool  {id前8位}  {toolName}` | 折叠 | 紫色 |

- 展开态：在折叠行下方显示原始内容（纯文本 `<pre>`，不做 markdown 渲染）
- assistant 有 toolCalls 时，展开后额外显示 toolCalls 的 JSON
- id 显示前 8 位（UUID 前缀，方便辨识）
- 折叠/展开用 `<details>/<summary>` 实现

## Section Header 统一样式

- font-size: 12px, font-weight: 600
- 底部 1px border-bottom 分隔
- 各 section 之间 12px 间距

## 文件变更

| 文件 | 变更 |
|---|---|
| `AISidebar.tsx` | 新增 `showContext` state；UsageBadge 加 `onClick` + `cursor: pointer`；header 标题条件渲染；内容区条件渲染 `ContextView`；上下文视图时隐藏 input |
| `ContextView.tsx` | **新建**，上下文视图组件（三个 section + 原始消息列表） |
| `AISidebar.css` | section header、堆叠条形图、图例、原始消息折叠块等样式 |

## ContextView 数据流

```typescript
function ContextView({ tabId, providerId, model, aiConfig, docContent }) {
  const maxContext = getModelInfo(providerId, model).maxContext;
  const contextTokens = useChatStore(s => s.contextTokensMap[tabId] ?? 0);
  const cost = useChatStore(s => s.costMap[tabId] ?? 0);
  const contextMsgs = useChatStore.getState().getContext(tabId);
  const { prompt: systemPrompt, needsTools } = buildSystemPrompt(docContent, maxContext, ...);

  // 统计信息
  // 上下文占比：estimateTokens 分类累加 → 归一化到 contextTokens → 渲染堆叠条 + 图例
  // 原始消息：[systemMsg, ...contextMsgs] 遍历渲染
}
```

## 无需变更的文件

- `chatStore.ts` — 复用现有 `getContext()`
- `contextBuilder.ts` — 复用现有 `buildSystemPrompt()`、`estimateTokens()`
- `llmClient.ts` — 无变更
