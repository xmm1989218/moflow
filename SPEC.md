# MoFlow 升级 & 自动升级实施规范

## 概要

使用 Tauri v2 官方 `tauri-plugin-updater` 插件，配合 GitHub Releases 作为更新源。

**检查策略**：启动时自动检查 + 菜单「检查更新」手动检查 + 关于对话框内「检查更新」按钮

**安装方式**：提示后安装 — 下载完成后弹对话框让用户确认，点击后安装并重启

**UI 形式**：对话框弹窗，显示版本号 + 更新日志 + 下载进度，「立即更新」/「稍后」

**不支持跳过版本**

**暂不做 Windows Authenticode 签名**（Tauri 更新签名必须做）

---

## 1. 依赖

### Rust (`src-tauri/Cargo.toml`)

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

### 前端

```powershell
bun add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

---

## 2. 签名密钥对

生成：

```powershell
bunx tauri signer generate -w ~/.tauri/moflow.key
```

- 公钥 → 写入 `tauri.conf.json` 的 `plugins.updater.pubkey`
- 私钥 → 仅在 CI 环境变量 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 中使用，不提交到 Git

---

## 3. Tauri 配置 (`src-tauri/tauri.conf.json`)

在 `bundle` 中添加：

```json
"createUpdaterArtifacts": true
```

新增顶层 `plugins` 字段：

```json
"plugins": {
  "updater": {
    "pubkey": "<公钥内容，从生成步骤获取>",
    "endpoints": [
      "https://github.com/<owner>/<repo>/releases/latest/download/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

- `createUpdaterArtifacts: true` → 构建时自动生成 `.sig` 签名文件
- `installMode: "passive"` → 安装时显示进度条，无需用户交互
- `endpoints` 中的 `<owner>/<repo>` 在确定仓库地址后替换

---

## 4. 权限 (`src-tauri/capabilities/default.json`)

`permissions` 数组添加：

```json
"updater:default",
"process:allow-restart"
```

`updater:default` 包含 `allow-check`、`allow-download`、`allow-install`、`allow-download-and-install`。

---

## 5. Rust 端 (`src-tauri/src/lib.rs`)

在 `setup` 闭包中注册插件：

```rust
#[cfg(desktop)]
app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
app.handle().plugin(tauri_plugin_process::init())?;
```

放在 `#[cfg(desktop)]` 块内（与 single-instance 同级），确保只在桌面平台加载。

---

## 6. 前端更新逻辑 (`src/lib/updater.ts`)

核心模块，提供：

```typescript
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  currentVersion: string;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'downloading'; downloaded: number; contentLength?: number }
  | { state: 'ready'; info: UpdateInfo }
  | { state: 'error'; message: string };

export async function checkForUpdate(): Promise<Update | null> {
  return await check();
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (downloaded: number, contentLength?: number) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength;
        onProgress?.(0, contentLength);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, contentLength);
        break;
      case 'Finished':
        break;
    }
  });

  await relaunch();
}
```

---

## 7. 状态管理 (`src/stores/updateStore.ts`)

Zustand store，管理更新全生命周期状态：

```typescript
interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  checkUpdate: () => Promise<void>;
  startDownloadAndInstall: () => Promise<void>;
  dismiss: () => void;
}
```

- `checkUpdate()`：调用 `checkForUpdate()`，更新 status 为 `checking` → `available` / `up-to-date` / `error`
- `startDownloadAndInstall()`：调用 `downloadAndInstall()`，状态 `available` → `downloading` → 重启
- `dismiss()`：关闭弹窗，status 回到 `idle`
- 启动时自动检查由 `App.tsx` 调用 `checkUpdate()` 触发

---

## 8. 更新弹窗 UI (`src/components/UpdateDialog/UpdateDialog.tsx`)

对话框组件，根据 `updateStore.status` 显示不同内容：

| status | 显示 |
|--------|------|
| `idle` | 不显示 |
| `checking` | 「正在检查更新…」 |
| `up-to-date` | 「已是最新版本」+ 关闭按钮 |
| `available` | 新版本号 + 更新日志 + 「立即更新」「稍后」按钮 |
| `downloading` | 进度条 + 已下载/总大小 + 取消按钮（可选） |
| `ready` | （正常情况下不会到这，因为安装后会 relaunch） |
| `error` | 错误信息 + 关闭按钮 |

样式要求：
- 使用 Tailwind CSS，配合现有 `--ui-*` CSS 变量
- 与现有 ConfirmCloseDialog 风格一致
- 更新日志支持 Markdown 渲染（可用 `react-markdown`，已在依赖中）

---

## 9. 菜单集成 (`src/components/HamburgerMenu/HamburgerMenu.tsx`)

在菜单中添加「检查更新」项：

位置：`devtools` 和 `about` 之间的 `sep()` 之前

```
item("check_update", t("检查更新...", "Check for Updates..."))
```

`handleAction` 中添加：

```typescript
case "check_update":
  useUpdateStore.getState().checkUpdate();
  break;
```

---

## 10. 关于对话框改造

当前 `about` 动作只是 `alert("MoFlow v0.1.0")`，改造为：

1. 新建 `src/components/AboutDialog/AboutDialog.tsx`
2. 显示内容：
   - MoFlow 图标（可选）
   - 版本号（从 `@tauri-apps/api/app` 的 `getVersion()` 获取）
   - 版权信息
   - 「检查更新」按钮 → 调用 `useUpdateStore.getState().checkUpdate()`
3. `about` 动作改为设置 `aboutDialogVisible: true`（可在 appStore 或单独 store 中管理）

---

## 11. App.tsx 集成

1. 导入并挂载 `<UpdateDialog />`（与 `<ConfirmCloseDialog />` 同级）
2. 导入并挂载 `<AboutDialog />`
3. 启动时自动检查更新：在 `initSession().then(...)` 回调中调用 `useUpdateStore.getState().checkUpdate()`

```tsx
import UpdateDialog from "./components/UpdateDialog/UpdateDialog";
import AboutDialog from "./components/AboutDialog/AboutDialog";
import { useUpdateStore } from "./stores/updateStore";

// 在 initSession().then 回调末尾添加：
useUpdateStore.getState().checkUpdate();
```

---

## 12. GitHub Releases 更新 JSON

每次发版时，将以下文件上传到 GitHub Release：

### `latest.json`

```json
{
  "version": "0.2.0",
  "notes": "## v0.2.0\n- 新增自动更新功能\n- 修复若干 Bug",
  "pub_date": "2026-05-05T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<MoFlow_0.2.0_x64-setup.exe.sig 文件内容>",
      "url": "https://github.com/<owner>/<repo>/releases/download/v0.2.0/MoFlow_0.2.0_x64-setup.exe"
    }
  }
}
```

### 构建产物

| 文件 | 说明 |
|------|------|
| `MoFlow_x.y.z_x64-setup.exe` | NSIS 安装包 |
| `MoFlow_x.y.z_x64-setup.exe.sig` | 更新签名（`createUpdaterArtifacts: true` 自动生成） |

### 发版流程

1. 同步版本号：`package.json` / `Cargo.toml` / `tauri.conf.json` 三处 version
2. 设置环境变量：`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. 执行 `bun run tauri build`
4. 从 `src-tauri/target/release/bundle/nsis/` 取安装包和 `.sig` 文件
5. 创建 GitHub Release（tag: `v0.2.0`），上传安装包 + `.sig` + `latest.json`

---

## 13. 实施步骤

| # | 步骤 | 涉及文件 |
|---|------|----------|
| 1 | 安装依赖 | `Cargo.toml`, `package.json` |
| 2 | 生成签名密钥对，配置 tauri.conf.json | `tauri.conf.json` |
| 3 | 添加 capabilities 权限 | `src-tauri/capabilities/default.json` |
| 4 | 注册 updater + process 插件 | `src-tauri/src/lib.rs` |
| 5 | 创建更新逻辑模块 | `src/lib/updater.ts` |
| 6 | 创建 updateStore | `src/stores/updateStore.ts` |
| 7 | 创建 UpdateDialog 组件 | `src/components/UpdateDialog/UpdateDialog.tsx` |
| 8 | 创建 AboutDialog 组件 | `src/components/AboutDialog/AboutDialog.tsx` |
| 9 | HamburgerMenu 添加「检查更新」 | `src/components/HamburgerMenu/HamburgerMenu.tsx` |
| 10 | App.tsx 集成 | `src/App.tsx` |
| 11 | 验证：`bun run lint` + `cargo build` | — |

---

## 14. 注意事项

- **签名私钥安全**：私钥不要提交到 Git，仅在 CI 环境变量中使用
- **Windows SmartScreen**：暂不做 Authenticode 签名，首次安装用户可能遇到 SmartScreen 警告
- **版本号同步**：发版前确保 `package.json`、`Cargo.toml`、`tauri.conf.json` 三处 version 一致
- **GitHub 仓库地址**：`endpoints` 中的 `<owner>/<repo>` 需在确定仓库后替换
- **开发模式限制**：`tauri-plugin-updater` 在开发模式下 `check()` 始终返回 `null`，需要在构建产物中测试
- **网络错误处理**：检查更新失败时静默处理，不打扰用户（仅手动检查时显示错误）
