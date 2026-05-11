import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import { join, dirname } from "@tauri-apps/api/path";

const ASSETS_DIR = "assets";

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

function getImageExt(file: File): string {
  const mimeMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
  };
  if (file.type && mimeMap[file.type]) return mimeMap[file.type];
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) return file.name.slice(dot).toLowerCase();
  return ".png";
}

export async function saveImageToFile(
  tabFilePath: string,
  data: Uint8Array,
  ext: string
): Promise<string> {
  const docDir = await dirname(tabFilePath);
  const assetsDir = await join(docDir, ASSETS_DIR);

  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }

  const filename = `${Date.now()}-${randomHex(4)}${ext}`;
  const fullPath = await join(assetsDir, filename);

  await invoke("allow_paths", { paths: [fullPath] });
  await writeFile(fullPath, data);

  return `./${ASSETS_DIR}/${filename}`;
}

export function resolveImagePath(
  src: string,
  docFilePath: string | null
): string {
  if (!src) return src;

  if (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("http://") ||
    src.startsWith("https://")
  ) {
    return src;
  }

  if (!docFilePath) return src;

  let absolutePath: string;
  if (src.startsWith("./") || src.startsWith("../")) {
    const docDir = dirnameSync(docFilePath);
    absolutePath = docDir + "/" + src;
  } else if (src.startsWith("/")) {
    absolutePath = src;
  } else {
    const docDir = dirnameSync(docFilePath);
    absolutePath = docDir + "/" + src;
  }

  absolutePath = normalizePath(absolutePath);
  return convertFileSrc(absolutePath);
}

function dirnameSync(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const idx = path.lastIndexOf(sep);
  return idx > 0 ? path.substring(0, idx) : ".";
}

function normalizePath(path: string): string {
  const isWin = path.includes("\\");
  const parts = path.split(isWin ? "\\" : "/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      }
    } else if (part !== ".") {
      result.push(part);
    }
  }
  return result.join(isWin ? "\\" : "/");
}

export { getImageExt };
