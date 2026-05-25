import { describe, it, expect } from "vitest";
import { parseArgs } from "../lib/skillManager";

describe("parseArgs", () => {
  it("returns empty array for empty string", () => {
    expect(parseArgs("")).toEqual([]);
  });

  it("splits simple space-separated args", () => {
    expect(parseArgs("convert input.md")).toEqual(["convert", "input.md"]);
  });

  it("preserves quoted path without quotes", () => {
    expect(parseArgs('convert "C:\\Users\\file.md"')).toEqual(["convert", "C:\\Users\\file.md"]);
  });

  it("handles multiple quoted paths", () => {
    expect(parseArgs('convert "C:\\path\\file.md" --theme simple --output "C:\\path\\out"')).toEqual([
      "convert",
      "C:\\path\\file.md",
      "--theme",
      "simple",
      "--output",
      "C:\\path\\out",
    ]);
  });

  it("preserves spaces inside quotes", () => {
    expect(parseArgs('--output "C:\\my path\\out"')).toEqual(["--output", "C:\\my path\\out"]);
  });

  it("collapses multiple spaces between args", () => {
    expect(parseArgs("  a   b  c  ")).toEqual(["a", "b", "c"]);
  });

  it("returns single arg without spaces", () => {
    expect(parseArgs("file.md")).toEqual(["file.md"]);
  });

  it("handles unclosed quote by treating rest as single arg", () => {
    expect(parseArgs('"unclosed path')).toEqual(["unclosed path"]);
  });

  it("skips empty quoted string", () => {
    expect(parseArgs('""')).toEqual([]);
  });

  it("handles --name value with spaces in value", () => {
    expect(parseArgs('--name "hello world"')).toEqual(["--name", "hello world"]);
  });

  it("handles mixed quoted and unquoted args", () => {
    expect(parseArgs('--format pdf "input file.md" --verbose')).toEqual([
      "--format",
      "pdf",
      "input file.md",
      "--verbose",
    ]);
  });

  it("handles adjacent quoted segments", () => {
    expect(parseArgs('"first arg""second arg"')).toEqual(["first argsecond arg"]);
  });

  it("preserves spaces inside quotes with backslash paths", () => {
    expect(parseArgs('convert "C:\\Users\\file ha.md"')).toEqual(["convert", "C:\\Users\\file ha.md"]);
  });

  it("real-world skill script args", () => {
    expect(
      parseArgs(
        'convert "C:\\Users\\xumingmin\\Desktop\\temp\\blog-agent-19days.md" --theme simple --output "C:\\Users\\xumingmin\\Desktop\\temp"'
      )
    ).toEqual([
      "convert",
      "C:\\Users\\xumingmin\\Desktop\\temp\\blog-agent-19days.md",
      "--theme",
      "simple",
      "--output",
      "C:\\Users\\xumingmin\\Desktop\\temp",
    ]);
  });
});
