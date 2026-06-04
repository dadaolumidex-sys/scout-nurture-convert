import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Shared renderer for AI replies.
 * Uses GitHub-flavored markdown (tables, task lists, strikethrough, autolinks)
 * with readable spacing, clear headings, tidy bullets and code blocks.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "ai-readable-message max-w-none break-words text-base font-medium leading-7 text-foreground [overflow-wrap:anywhere]",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-4 text-xl font-bold leading-snug text-foreground first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2.5 mt-4 text-lg font-bold leading-snug text-foreground first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3.5 text-base font-bold leading-snug text-foreground first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-2 text-base font-medium leading-7 text-foreground first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="text-foreground">{children}</em>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-foreground marker:text-secondary">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 text-foreground marker:text-secondary marker:font-semibold">{children}</ol>,
          li: ({ children }) => <li className="pl-1 text-base font-medium leading-7 text-foreground">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-bold text-secondary underline underline-offset-4">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-secondary bg-muted/60 py-2 pl-4 pr-3 text-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm text-foreground">{children}</pre>,
          table: ({ children }) => <table className="my-3 w-full border-collapse text-sm text-foreground">{children}</table>,
          th: ({ children }) => <th className="border border-border bg-muted px-2 py-2 text-left font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-2 text-foreground">{children}</td>,
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
