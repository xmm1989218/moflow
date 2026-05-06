import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypePrismPlus from "rehype-prism-plus";
import { openUrl } from "@tauri-apps/plugin-opener";
import "prismjs/themes/prism.css";
import "prismjs/themes/prism-tomorrow.css";
import "./MessageContent.css";

interface MessageContentProps {
  content: string;
}

export default function MessageContent({ content }: MessageContentProps) {
  return (
    <div className="moflow-ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypePrismPlus, { ignoreMissing: true }]]}
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
