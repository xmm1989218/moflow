import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypePrismCommon } from "rehype-prism-plus";
import { openUrl } from "@tauri-apps/plugin-opener";
import "prismjs/themes/prism-tomorrow.css";
import "./MessageContent.css";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];
const rehypePlugins: Options["rehypePlugins"] = [[rehypePrismCommon, { ignoreMissing: true }]];

interface MessageContentProps {
  content: string;
}

export default function MessageContent({ content }: MessageContentProps) {
  return (
    <div className="moflow-ai-md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) openUrl(href);
              }}
              {...rest}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
