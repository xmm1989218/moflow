/* eslint-disable @typescript-eslint/no-explicit-any */

import { micromarkHighlight } from "./micromarkHighlight";
import {
  mdastHighlightFromMarkdown,
  mdastHighlightToMarkdown,
} from "./mdastHighlight";

function remarkHighlight(this: any): void {
  const data = this.data();

  const micromarkExtensions =
    data.micromarkExtensions ?? (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);

  micromarkExtensions.push(micromarkHighlight());
  fromMarkdownExtensions.push(mdastHighlightFromMarkdown());
  toMarkdownExtensions.push(mdastHighlightToMarkdown());
}

export default remarkHighlight;
