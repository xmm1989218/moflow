# Skill Store 设计方案

## 概述

MoFlow 支持从远程仓库（moflow-skills）浏览、安装、更新 AI skills，遵循 [agentskills.io](https://agentskills.io) 规范。

## 数据流

```
┌─────────────┐     releases/latest      ┌──────────────┐
│   MoFlow    │ ──────────────────────→   │   GitHub     │
│   (client)  │ ←──── tag_name ────────   │   API        │
│             │                           │              │
│             │ ── raw/.../registry.yaml → │              │
│             │ ←── skill list ─────────  │              │
│             │                           │              │
│             │ ── zipball/v2026.x.x ──→  │              │
│             │ ←── zip archive ────────  │              │
└──────┬──────┘                           └──────────────┘
       │
       ▼
┌──────────────────┐
│  {appDataDir}/   │
│    skills/       │
│      doc/        │
│      trans/      │
└──────────────────┘
```

## 远程仓库

仓库：`github.com/xmm1989218/moflow-skills`

### registry.yaml 格式

```yaml
version: "2026.5.14.1"           # 日期版本 YYYY.M.D.N
updated: "2026-05-14"            # 最后发布日期
skills:
  - name: documentation
    description: "Write clear..."
    version: "1.0.0"             # skill 语义版本
    license: MIT
    hasScripts: false
    metadata:
      author: moflow
```

### SKILL.md 格式

```yaml
---
name: documentation
description: "Write clear..."
version: "1.0.0"
license: MIT
metadata:
  author: moflow
---
## What I Do
...
```

### GitHub Release 结构

- Tag：`v2026.5.14.1`
- Release Notes：从 CHANGELOG.md 生成
- Draft：发布时为草稿，手动审核后 publish
- 无 assets：MoFlow 通过 GitHub API 和 zipball 按需获取

## 功能设计

### 1. 发现新版本

**触发时机**：启动时自动检查 / 手动刷新

**流程**：

1. `GET /repos/xmm1989218/moflow-skills/releases/latest` → `tag_name: "v2026.5.14.5"`
2. `GET raw.githubusercontent.com/xmm1989218/moflow-skills/v2026.5.14.5/registry.yaml` → 远端 skill 列表
3. 对比远端 skill 列表与本地 `{appDataDir}/skills/` 目录：
   - 远端有本地没有 → 新 skill 可用
   - 远端 skill version ≠ 本地 SKILL.md version → 有更新
   - 本地有远端没有 → 已安装（远端已移除）

**本地不存储远程版本号**，运行时直接对比 SKILL.md 中的 version 字段。

### 2. 展示可用 skills

**位置**：Settings Panel → Skills Section（改造现有 UI）

**UI 设计**：

```
┌─────────────────────────────────────────┐
│  Skills Store                           │
│                                         │
│  ── Available ────────────────────────  │
│                                         │
│  📦 documentation  v1.0.0               │
│     Write clear, well-structured        │
│     technical documentation...          │
│     [Installed]                         │
│                                         │
│  📦 translation  v1.0.0 → v1.1.0       │
│     Translate text between languages... │
│     [Update]                            │
│                                         │
│  📦 polish-writing  v1.0.0              │
│     Polish and rewrite text...          │
│     [Install]                           │
│                                         │
│  ── Installed (Local) ────────────────  │
│                                         │
│  📦 my-custom-skill  v0.1.0             │
│     (manually installed)                │
│     [Uninstall]                         │
└─────────────────────────────────────────┘
```

**状态判断逻辑**：

| 远端存在 | 本地存在 | version 一致 | 显示状态 | 按钮 |
|---------|---------|-------------|---------|------|
| ✓ | ✗ | — | New | [Install] |
| ✓ | ✓ | ✓ | Installed | [Installed] (灰色) |
| ✓ | ✓ | ✗ | Update available | [Update] |
| ✗ | ✓ | — | Local only | [Uninstall] |

**已安装但远端不存在的 skill**（用户手动放入或远端已移除）单独放在 "Installed (Local)" 区域。

### 3. 安装 skill

**流程**：

1. 用户点击 Install / Update
2. `GET /repos/xmm1989218/moflow-skills/zipball/v2026.5.14.5` → 下载整个仓库 zip
3. Rust 后端部分解压，只提取 `skills/<name>/` 目录下的所有文件
4. 写入 `{appDataDir}/skills/<name>/`（Update 场景覆盖已有文件）
5. **如果 `hasDeps: true`**：在 `{appDataDir}/skills/<name>/scripts/` 下运行 `bun install` 安装依赖
6. 刷新 skillStore → `discoverSkills()` 重新扫描
7. UI 更新为 "Installed"

**为什么用 zipball 而不是逐文件下载**：

- 一次网络请求，速度快
- 纯文本仓库极小（几十 KB）
- 避免多次 GitHub API 调用（有 rate limit）
- Tauri Rust 后端用 `zip` crate 部分解压方便

**卸载 skill**：

- 删除 `{appDataDir}/skills/<name>/` 目录
- 刷新 skillStore
- 仅对已安装 skill 可用，不影响远端列表

### 4. 代理支持

下载 zipball 和 API 请求时复用 MoFlow 已有的代理设置（`proxyUrl`）。

Rust 后端的 `webfetch` 已实现代理支持，skill 下载应复用相同的 `reqwest` 客户端配置。

## 技术实现

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/skillRegistry.ts` | 远端 registry 获取、版本对比、安装/卸载调度 |
| `src/stores/skillStore.ts`（改造） | 增加 remoteSkills、installStatus 等状态 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/components/SettingsPanel/SkillsSection.tsx` | 改造为商店 UI |
| `src-tauri/src/lib.rs` | 新增命令：download_skill_store、install_skill |
| `src/lib/tools.ts` | 安装新 skill 后刷新 tool definitions |

### skillRegistry.ts 核心接口

```typescript
interface RemoteSkill {
  name: string;
  description: string;
  version: string;
  license?: string;
  hasScripts: boolean;
  hasDeps: boolean;
  metadata?: Record<string, string>;
}

interface SkillInstallStatus {
  name: string;
  status: "new" | "installed" | "update" | "local-only";
  localVersion?: string;
  remoteVersion?: string;
  description: string;
}

// 获取远端 latest release 的 tag
async function fetchLatestTag(): Promise<string>;

// 获取远端 registry.yaml 中的 skill 列表
async function fetchRemoteRegistry(tag: string): Promise<{ version: string; skills: RemoteSkill[] }>;

// 对比远端和本地，生成安装状态列表
function computeInstallStatus(remoteSkills: RemoteSkill[], localSkills: SkillMeta[]): SkillInstallStatus[];

// 安装 skill（调用 Rust 后端下载 zipball + 解压）
async function installSkill(name: string, tag: string): Promise<void>;

// 卸载 skill（删除本地目录）
async function uninstallSkill(name: string): Promise<void>;
```

### Rust 后端新增命令

```rust
// 下载 moflow-skills 仓库 zipball 并部分解压
#[tauri::command]
async fn download_and_install_skill(
    tag: String,
    skill_name: String,
    proxy_url: Option<String>,
) -> Result<(), String>;

// 删除已安装的 skill
#[tauri::command]
async fn uninstall_skill(skill_name: String) -> Result<(), String>;
```

`download_and_install_skill` 实现：

1. 构造 zipball URL：`https://github.com/xmm1989218/moflow-skills/zipball/{tag}`
2. 使用 `reqwest`（复用 `ProxyState`）下载 zip 到临时文件
3. 使用 `zip` crate 解压，只提取 `skills/{skill_name}/` 前缀的文件
4. 写入 `{appDataDir}/skills/{skill_name}/`
5. 清理临时文件

`install_skill_deps` 实现：

1. 检查 `{appDataDir}/skills/{skill_name}/scripts/package.json` 是否存在
2. 如果存在，在 `scripts/` 目录下执行 `bun install`
3. 这确保 skill 的依赖在安装时就准备好，之后离线也能使用

### skillStore.ts 扩展

```typescript
interface SkillStoreState {
  // 已有
  discoveredSkills: SkillMeta[];

  // 新增
  remoteSkills: RemoteSkill[];
  installStatuses: SkillInstallStatus[];
  latestTag: string | null;
  isLoadingRemote: boolean;
  remoteError: string | null;
}

interface SkillStoreActions {
  // 新增
  fetchRemoteSkills: () => Promise<void>;
  installSkill: (name: string) => Promise<void>;
  uninstallSkill: (name: string) => Promise<void>;
  refreshLocalSkills: () => void; // 重新 discoverSkills
}
```

## 网络请求汇总

| 请求 | 用途 | 频率 | 代理 |
|------|------|------|------|
| `GET /repos/.../releases/latest` | 获取最新 tag | 启动时 / 手动 | ✓ |
| `GET raw/.../registry.yaml` | 获取 skill 列表 | 启动时 / 手动 | ✓ |
| `GET /repos/.../zipball/{tag}` | 下载 skill 文件 | 安装时 | ✓ |

所有请求均复用现有 `proxyUrl` 代理配置。

## 错误处理

| 场景 | 处理 |
|------|------|
| 网络不可达 | UI 显示错误提示，本地已安装 skills 不受影响 |
| GitHub API rate limit | 提示用户稍后重试 |
| zipball 下载失败 | 中断安装，提示重试 |
| 解压失败 | 删除不完整文件，提示重试 |
| skill 目录已存在（Update） | 覆盖写入 |
| skill 名称冲突（本地手动创建的同名 skill） | 提示用户确认覆盖 |

## 安全考虑

- 下载来源固定为 `github.com/xmm1989218/moflow-skills`，不可配置（防止供应链攻击）
- skill scripts 执行仍受现有 `execute` 权限控制（PermissionBar 弹窗确认）
- zipball 解压时校验文件路径，防止路径遍历攻击（`../` 等）
- skill 安装后需要用户手动启用（保持现有 `enabled` 逻辑）
