import type { NodeView, NodeViewConstructor } from "@milkdown/prose/view";

const BLOCK_HTML_PATTERN =
  /^\s*<(address|article|aside|blockquote|details|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul|center)/i;

export function createHtmlNodeView(): NodeViewConstructor {
  return (node, view, getPos): NodeView => {
    const value: string = node.attrs.value ?? "";
    const isBlock = BLOCK_HTML_PATTERN.test(value);

    if (isBlock) {
      const container = document.createElement("div");
      container.className = "milkdown-html-block";

      const rendered = document.createElement("div");
      rendered.className = "html-rendered";
      rendered.innerHTML = value;

      const editor = document.createElement("textarea");
      editor.className = "html-source";
      editor.value = value;
      editor.spellcheck = false;
      editor.style.display = "none";

      container.appendChild(rendered);
      container.appendChild(editor);

      let isEditing = false;
      let currentNode = node;

      return {
        dom: container,

        update(newNode) {
          if (newNode.type.name !== "html") return false;
          currentNode = newNode;
          if (!isEditing) {
            rendered.innerHTML = newNode.attrs.value ?? "";
          }
          editor.value = newNode.attrs.value ?? "";
          return true;
        },

        selectNode() {
          isEditing = true;
          rendered.style.display = "none";
          editor.style.display = "";
          editor.value = currentNode.attrs.value ?? "";
          editor.focus();
        },

        deselectNode() {
          const newValue = editor.value;
          if (newValue !== (currentNode.attrs.value ?? "")) {
            const pos = getPos();
            if (pos !== undefined) {
              const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                value: newValue,
              });
              view.dispatch(tr);
            }
          }
          isEditing = false;
          rendered.innerHTML = newValue;
          rendered.style.display = "";
          editor.style.display = "none";
        },

        destroy() {
          container.remove();
        },
      };
    }

    const span = document.createElement("span");
    span.setAttribute("data-type", "html");
    span.setAttribute("data-value", value);
    span.textContent = value;
    span.className = "milkdown-html-inline";

    return {
      dom: span,

      update(newNode) {
        if (newNode.type.name !== "html") return false;
        span.textContent = newNode.attrs.value ?? "";
        span.setAttribute("data-value", newNode.attrs.value ?? "");
        return true;
      },

      destroy() {
        span.remove();
      },
    };
  };
}
