import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Send, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ChatComposerHandle = {
  setText: (text: string) => void;
  focus: () => void;
};

interface ChatComposerProps {
  variant: "mobile" | "desktop";
  loading: boolean;
  hasPendingImages: boolean;
  onSend: (text: string) => void;
  onPickImage: () => void;
}

/**
 * Self-contained message input. It keeps the typed text in its OWN local state
 * so keystrokes never re-render the parent ChatPage (and its message list).
 * This is what keeps typing fast, especially on phones with long chats.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  ({ variant, loading, hasPendingImages, onSend, onPickImage }, ref) => {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      setText: (t: string) => {
        setText(t);
        textareaRef.current?.focus();
      },
      focus: () => textareaRef.current?.focus(),
    }));

    const submit = () => {
      const trimmed = text.trim();
      if ((!trimmed && !hasPendingImages) || loading) return;
      onSend(trimmed || (hasPendingImages ? "Check this conversation and give me the perfect next reply" : text));
      setText("");
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    const disabled = loading || (!text.trim() && !hasPendingImages);

    if (variant === "mobile") {
      return (
        <div className="flex items-end gap-2 p-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground" onClick={onPickImage} type="button">
            <ImagePlus className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              placeholder="Ask anything..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-[120px] text-sm rounded-2xl px-4 py-2.5"
              onKeyDown={onKeyDown}
              rows={1}
            />
          </div>
          <Button onClick={submit} disabled={disabled} className="gradient-primary text-primary-foreground h-10 w-10 p-0 rounded-full shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            placeholder="Type your message or upload a conversation screenshot..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none pr-10 min-h-[72px]"
            onKeyDown={onKeyDown}
          />
          <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onPickImage} type="button">
            <ImagePlus className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={submit} disabled={disabled} className="gradient-primary text-primary-foreground self-end h-10 w-10 p-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);

ChatComposer.displayName = "ChatComposer";
