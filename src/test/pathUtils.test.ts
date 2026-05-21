import { describe, it, expect } from "vitest";
import { toPosix, posixDirname, posixBasename } from "../lib/pathUtils";

describe("pathUtils toPosix", () => {
  it("leaves posix paths unchanged", () => {
    expect(toPosix("/home/user/docs")).toBe("/home/user/docs");
  });

  it("converts backslashes to forward slashes", () => {
    expect(toPosix("C:\\Users\\docs")).toBe("C:/Users/docs");
  });

  it("handles mixed separators", () => {
    expect(toPosix("C:\\Users/docs\\file.txt")).toBe("C:/Users/docs/file.txt");
  });

  it("handles no separators", () => {
    expect(toPosix("file.txt")).toBe("file.txt");
  });

  it("handles empty string", () => {
    expect(toPosix("")).toBe("");
  });

  it("handles UNC paths", () => {
    expect(toPosix("\\\\server\\share\\dir")).toBe("//server/share/dir");
  });

  it("handles trailing backslash", () => {
    expect(toPosix("C:\\Users\\docs\\")).toBe("C:/Users/docs/");
  });

  it("handles multiple consecutive backslashes", () => {
    expect(toPosix("C:\\\\Users\\\\docs")).toBe("C://Users//docs");
  });
});

describe("pathUtils posixDirname", () => {
  it("returns parent directory of posix path", () => {
    expect(posixDirname("/home/user/docs")).toBe("home/user");
  });

  it("returns parent directory of windows path", () => {
    expect(posixDirname("C:\\Users\\docs\\file.txt")).toBe("C:/Users/docs");
  });

  it("returns root for single-level absolute path", () => {
    expect(posixDirname("/home")).toBe("/");
  });

  it("returns dot for single-level relative path", () => {
    expect(posixDirname("file.txt")).toBe(".");
  });

  it("returns dot for empty string", () => {
    expect(posixDirname("")).toBe(".");
  });

  it("handles mixed separators", () => {
    expect(posixDirname("C:\\Users/docs\\file.txt")).toBe("C:/Users/docs");
  });

  it("handles deep paths", () => {
    expect(posixDirname("a/b/c/d/e.txt")).toBe("a/b/c/d");
  });

  it("handles two-level relative path", () => {
    expect(posixDirname("src/index.ts")).toBe("src");
  });

  it("handles drive letter only", () => {
    expect(posixDirname("C:")).toBe(".");
  });

  it("handles trailing slash", () => {
    expect(posixDirname("/home/user/docs/")).toBe("home/user");
  });
});

describe("pathUtils posixBasename", () => {
  it("returns filename from posix path", () => {
    expect(posixBasename("/home/user/docs/file.txt")).toBe("file.txt");
  });

  it("returns filename from windows path", () => {
    expect(posixBasename("C:\\Users\\docs\\file.txt")).toBe("file.txt");
  });

  it("returns last directory for directory path", () => {
    expect(posixBasename("/home/user/docs")).toBe("docs");
  });

  it("handles single filename", () => {
    expect(posixBasename("file.txt")).toBe("file.txt");
  });

  it("handles empty string", () => {
    expect(posixBasename("")).toBe("");
  });

  it("handles mixed separators", () => {
    expect(posixBasename("C:\\Users/docs\\file.txt")).toBe("file.txt");
  });

  it("handles trailing slash", () => {
    expect(posixBasename("/home/user/docs/")).toBe("docs");
  });

  it("handles root path", () => {
    expect(posixBasename("/")).toBe("");
  });

  it("handles drive letter", () => {
    expect(posixBasename("C:\\")).toBe("C:");
  });
});
