import { describe, it, expect } from "vitest";
import { safeFileName } from "../lib/chatPersistence";

describe("chatPersistence safeFileName", () => {
  it("leaves simple IDs unchanged", () => {
    expect(safeFileName("abc-123")).toBe("abc-123");
  });

  it("replaces colons", () => {
    expect(safeFileName("dir:C:/projects/foo")).toBe("dir_C__projects_foo");
  });

  it("replaces forward slashes", () => {
    expect(safeFileName("dir:/home/user/docs")).toBe("dir__home_user_docs");
  });

  it("replaces backslashes", () => {
    expect(safeFileName("dir:D:\\Users\\docs")).toBe("dir_D__Users_docs");
  });

  it("replaces mixed separators", () => {
    expect(safeFileName("dir:C:/Users\\docs")).toBe("dir_C__Users_docs");
  });

  it("handles empty string", () => {
    expect(safeFileName("")).toBe("");
  });

  it("handles UUID-style keys", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(safeFileName(uuid)).toBe(uuid);
  });
});
