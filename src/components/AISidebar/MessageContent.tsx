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

function Callout({ type, children }: { type: "error" | "warning"; children: React.ReactNode }) {
  return (
    <div className={`moflow-ai-callout moflow-ai-callout-${type}`}>
      <span className="moflow-ai-callout-icon">
        {type === "error" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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