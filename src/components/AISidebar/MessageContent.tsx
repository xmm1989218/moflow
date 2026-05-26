import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypePrismCommon } from "rehype-prism-plus";
import { openUrl } from "@tauri-apps/plugin-opener";
import { XCircle, AlertTriangle } from "lucide-react";
import "prismjs/themes/prism-tomorrow.css";
import "./MessageContent.css";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];
const rehypePlugins: Options["rehypePlugins"] = [[rehypePrismCommon, { ignoreMissing: true }]];

interface MessageContentProps {
  content: string;
}

function Callout({ type, children }: { type: "error" | "warning"; children: React.ReactNode }) {
  return (
    <div className={`moflow-ai-callout moflow-ai-callout-${type}`}>
      <span className="moflow-ai-callout-icon">
        {type === "error" ? (
          <XCircle size={14} />
        ) : (
          <AlertTriangle size={14} />
        )}
      </span>
      <div className="moflow-ai-callout-body">{children}</div>
    </div>
  );
}

export default function MessageContent({ content }: MessageContentProps) {
  if (content.startsWith("|?")) {
    const body = content.slice(2);
    return (
      <Callout type="error">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} onClick={(e) => { e.preventDefault(); if (href) openUrl(href); }} {...rest}>{children}</a>
          ),
        }}>{body}</ReactMarkdown>
      </Callout>
    );
  }

  if (content.startsWith("|!")) {
    const body = content.slice(2);
    return (
      <Callout type="warning">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} onClick={(e) => { e.preventDefault(); if (href) openUrl(href); }} {...rest}>{children}</a>
          ),
        }}>{body}</ReactMarkdown>
      </Callout>
    );
  }

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