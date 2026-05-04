import { commandsCtx } from "@milkdown/kit/core";
import { markRule } from "@milkdown/kit/prose";
import { toggleMark } from "@milkdown/kit/prose/commands";
import {
  $command,
  $inputRule,
  $markAttr,
  $markSchema,
  $remark,
  $useKeymap,
} from "@milkdown/kit/utils";
import remarkHighlight from "./remarkHighlight";

export const highlightAttr = $markAttr("highlight");

export const remarkHighlightPlugin = $remark(
  "remarkHighlight",
  () => remarkHighlight
);

export const highlightSchema = $markSchema("highlight", (ctx) => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: (mark) => ["mark", ctx.get(highlightAttr.key)(mark)],
  parseMarkdown: {
    match: (node) => node.type === "mark",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "highlight",
    runner: (state, mark) => {
      state.withMark(mark, "mark");
    },
  },
}));

export const toggleHighlightCommand = $command(
  "ToggleHighlight",
  (ctx) => () => {
    return toggleMark(highlightSchema.type(ctx));
  }
);

export const highlightInputRule = $inputRule((ctx) => {
  return markRule(/(?<![=])(==)(.+?)\1(?![=])/, highlightSchema.type(ctx));
});

export const highlightKeymap = $useKeymap("highlightKeymap", {
  ToggleHighlight: {
    shortcuts: "Mod-Shift-h",
    command: (ctx) => {
      const commands = ctx.get(commandsCtx);
      return () => commands.call(toggleHighlightCommand.key);
    },
  },
});

export const highlightPlugin = [
  remarkHighlightPlugin,
  highlightAttr,
  highlightSchema,
  toggleHighlightCommand,
  highlightInputRule,
  highlightKeymap,
].flat();
