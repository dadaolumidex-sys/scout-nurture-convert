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
        "prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed",
        // paragraphs & general text
        "prose-p:text-foreground prose-p:my-2 prose-p:leading-relaxed",
        // headings
        "prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-headings:leading-snug",
        "prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px]",
        "first:prose-headings:mt-0",
        // emphasis
        "prose-strong:text-foreground prose-strong:font-semibold prose-em:text-foreground",
        // lists
        "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5",
        "prose-li:text-foreground prose-li:my-1 prose-li:marker:text-primary marker:font-semibold",
        // links
        "prose-a:text-primary prose-a:font-medium prose-a:underline-offset-2 hover:prose-a:underline",
        // inline code & code blocks
        "prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:content-[''] prose-code:after:content-['']",
        "prose-pre:bg-card prose-pre:border prose-pre:border-border prose-pre:rounded-xl prose-pre:text-[13px] prose-pre:my-3 prose-pre:overflow-x-auto",
        // blockquotes
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground prose-blockquote:not-italic prose-blockquote:my-2",
        // tables
        "prose-table:my-3 prose-table:text-[13px] prose-th:text-foreground prose-th:border-border prose-td:border-border prose-td:text-foreground",
        // horizontal rule
        "prose-hr:border-border prose-hr:my-4",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
