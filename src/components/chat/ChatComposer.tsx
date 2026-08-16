import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Send, ImagePlus, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { readDraft, writeDraft } from "@/lib/draftStorage";

type VoiceResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type VoiceErrorEvent = Event & { error: string };

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: ((event: VoiceErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;

function getVoiceRecognition(): VoiceRecognitionConstructor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}

export type ChatComposerHandle = {
  setText: (text: string) => void;
  focus: () => void;
};

interface ChatComposerProps {
  variant: "mobile" | "desktop";
  loading: boolean;
  hasPendingImages: boolean;
  draftKey: string;
  onSend: (text: string) => void;
  onPickImage: () => void;
}

/**
 * Self-contained message input. It keeps the typed text in its OWN local state
 * so keystrokes never re-render the parent ChatPage (and its message list).
 * This is what keeps typing fast, especially on phones with long chats.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  ({ variant, loading, hasPendingImages, draftKey, onSend, onPickImage }, ref) => {
    const [text, setText] = useState("");
    const [loadedDraftKey, setLoadedDraftKey] = useState("");
    const [listening, setListening] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const enterDraftRef = useRef<{ value: string; start: number; end: number } | null>(null);
    const recognitionRef = useRef<VoiceRecognition | null>(null);
    const voiceBaseTextRef = useRef("");
    const finalTranscriptRef = useRef("");

    // Keep one private draft per conversation. This survives navigation and a
    // browser/app restart, but is never part of the message history.
    useEffect(() => {
      setText(readDraft(draftKey));
      setLoadedDraftKey(draftKey);
    }, [draftKey]);

    useEffect(() => {
      if (loadedDraftKey === draftKey) writeDraft(draftKey, text);
    }, [draftKey, loadedDraftKey, text]);

    const updateText = (nextText: string) => {
      // Store during the input event too. On phones an app can be suspended
      // before React has a chance to run its normal save effect.
      writeDraft(draftKey, nextText);
      setText(nextText);
    };

    useEffect(() => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    }, []);

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
      if (listening) {
        recognitionRef.current?.stop();
        setListening(false);
      }
      onSend(text);
      updateText("");
    };

    const disabled = loading || (!text.trim() && !hasPendingImages);

    const stopVoiceTyping = () => {
      recognitionRef.current?.stop();
      setListening(false);
    };

    const toggleVoiceTyping = () => {
      if (listening) {
        stopVoiceTyping();
        return;
      }

      const Recognition = getVoiceRecognition();
      if (!Recognition) {
        toast.error("Voice typing isn't supported in this browser. Try Chrome or Edge.");
        return;
      }

      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      voiceBaseTextRef.current = text.trimEnd();
      finalTranscriptRef.current = "";

      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          const transcript = result[0]?.transcript || "";
          if (result.isFinal) finalTranscriptRef.current += `${transcript} `;
          else interim += transcript;
        }
        const spoken = `${finalTranscriptRef.current}${interim}`.trim();
        const base = voiceBaseTextRef.current;
        updateText(`${base}${base && spoken ? " " : ""}${spoken}`);
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      };

      recognition.onerror = (event) => {
        setListening(false);
        recognitionRef.current = null;
        const message = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow microphone permission and try again."
          : event.error === "no-speech"
            ? "I couldn't hear anything. Tap the microphone and try again."
            : "Voice typing stopped unexpectedly. Please try again.";
        toast.error(message);
      };

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
        toast.info("Listening… speak naturally, then tap Stop when finished.");
      } catch {
        recognitionRef.current = null;
        setListening(false);
        toast.error("Voice typing couldn't start. Please try again.");
      }
    };

    const addNewLine = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      enterDraftRef.current = { value: text, start, end };
      const nextText = `${text.slice(0, start)}\n${text.slice(end)}`;
      updateText(nextText);
      window.requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
    };

    const preserveNewLine = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      const draft = enterDraftRef.current;
      enterDraftRef.current = null;
      if (!draft || text.includes("\n")) return;
      const restored = `${draft.value.slice(0, draft.start)}\n${draft.value.slice(draft.end)}`;
      updateText(restored);
    };

    if (variant === "mobile") {
      return (
        <div className="flex items-end gap-2 p-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground" onClick={onPickImage} type="button">
            <ImagePlus className="h-5 w-5" />
          </Button>
          <Button
            variant={listening ? "destructive" : "ghost"}
            size="icon"
            className={`h-10 w-10 shrink-0 ${listening ? "animate-pulse" : "text-muted-foreground"}`}
            onClick={toggleVoiceTyping}
            disabled={loading}
            type="button"
            aria-label={listening ? "Stop voice typing" : "Start voice typing"}
            title={listening ? "Stop voice typing" : "Voice typing"}
          >
            {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
          </Button>
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Ask anything..."
              value={text}
              onChange={(e) => updateText(e.target.value)}
              onKeyDownCapture={addNewLine}
              onKeyUp={preserveNewLine}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-[120px] text-sm rounded-2xl px-4 py-2.5 pr-10"
              rows={1}
            />
            {text && (
              <Button type="button" variant="ghost" size="icon" onClick={() => updateText("")} className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Clear draft" title="Clear draft">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button type="button" onClick={(e) => { if (e.detail > 0) submit(); }} disabled={disabled} className="gradient-primary text-primary-foreground h-10 w-10 p-0 rounded-full shrink-0">
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
            onChange={(e) => updateText(e.target.value)}
            onKeyDownCapture={addNewLine}
            onKeyUp={preserveNewLine}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none pr-20 min-h-[72px]"
            rows={3}
          />
          <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onPickImage} type="button">
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button
            variant={listening ? "destructive" : "ghost"}
            size="icon"
            className={`absolute right-10 bottom-1 h-8 w-8 ${listening ? "animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
            onClick={toggleVoiceTyping}
            disabled={loading}
            type="button"
            aria-label={listening ? "Stop voice typing" : "Start voice typing"}
            title={listening ? "Stop voice typing" : "Voice typing"}
          >
            {listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </Button>
          {text && (
            <Button type="button" variant="ghost" size="icon" onClick={() => updateText("")} className="absolute right-[4.5rem] bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Clear draft" title="Clear draft">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button type="button" onClick={(e) => { if (e.detail > 0) submit(); }} disabled={disabled} className="gradient-primary text-primary-foreground self-end h-10 w-10 p-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);

ChatComposer.displayName = "ChatComposer";
