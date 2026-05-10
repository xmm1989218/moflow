export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  lineStart: number;
  lineEnd: number;
  children: OutlineItem[];
}

export function buildOutlineTree(docContent: string): OutlineItem[] {
  const lines = docContent.split("\n");
  const flat: { id: string; level: number; text: string; lineStart: number; lineEnd: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      flat.push({
        id: `h-${i + 1}`,
        level: match[1].length,
        text: match[2].trim(),
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }

  if (flat.length === 0) return [];

  for (let i = 0; i < flat.length; i++) {
    const next = i + 1 < flat.length ? flat[i + 1].lineStart - 1 : lines.length;
    flat[i].lineEnd = next;
  }

  const root: OutlineItem[] = [];
  const stack: OutlineItem[] = [];

  for (const item of flat) {
    const node: OutlineItem = { ...item, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}
