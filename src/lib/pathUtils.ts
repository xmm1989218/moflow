export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function posixDirname(p: string): string {
  const posix = toPosix(p);
  const parts = posix.split("/").filter(Boolean);
  if (parts.length <= 1) return posix.startsWith("/") ? "/" : ".";
  return parts.slice(0, -1).join("/");
}

export function posixBasename(p: string): string {
  const posix = toPosix(p);
  const parts = posix.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}