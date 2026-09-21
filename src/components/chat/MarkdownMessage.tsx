import { memo } from "react";
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
 *
 * Memoized: parsing markdown is expensive, so we only re-render when the
 * message content (or className) actually changes — this keeps typing in the
 * chat box fast even in long conversations.
 */
function MarkdownMessageBase({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "ai-readable-message max-w-none break-words text-[15px] font-medium leading-6 text-foreground [overflow-wrap:anywhere] sm:text-base sm:leading-7",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-4 text-lg font-bold leading-snug text-foreground first:mt-0 sm:text-xl">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2.5 mt-4 text-base font-bold leading-snug text-foreground first:mt-0 sm:text-lg">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3.5 text-[15px] font-bold leading-snug text-foreground first:mt-0 sm:text-base">{children}</h3>,
          p: ({ children }) => <p className="my-2 text-[15px] font-medium leading-6 text-foreground first:mt-0 last:mb-0 sm:text-base sm:leading-7">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="text-foreground">{children}</em>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-foreground marker:text-secondary">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 text-foreground marker:text-secondary marker:font-semibold">{children}</ol>,
          li: ({ children }) => <li className="pl-1 text-[15px] font-medium leading-6 text-foreground sm:text-base sm:leading-7">{children}</li>,
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
          // A reply written for a client is sometimes returned in a Markdown
          // code fence. Keep its line breaks, but show it as normal readable
          // text instead of a cramped sideways-scrolling code box.
          pre: ({ children }) => <pre className="my-3 whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-foreground [&>code]:!bg-transparent [&>code]:!p-0 [&>code]:!font-sans [&>code]:!text-[15px] sm:text-base sm:leading-7">{children}</pre>,
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

export const MarkdownMessage = memo(MarkdownMessageBase);
