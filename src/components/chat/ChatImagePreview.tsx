import { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resolveChatImage } from "@/lib/chatImageStorage";

export function ChatImagePreview({ image, alt = "Screenshot" }: { image: string; alt?: string }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveChatImage(image).then((nextUrl) => { if (active) setUrl(nextUrl); }).catch(() => { if (active) setUrl(""); });
    return () => { active = false; };
  }, [image]);

  if (!url) return <div className="mb-2 flex h-16 w-24 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className="group relative mb-2 block overflow-hidden rounded-lg border border-border text-left">
        <img src={url} alt={`${alt} — tap to preview`} className="max-h-60 max-w-full object-contain" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/80 py-1 text-[11px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <ImageIcon className="h-3 w-3" /> Tap to preview
        </span>
      </button>
      <DialogContent className="max-w-4xl border-border bg-card p-2">
        <img src={url} alt={alt} className="max-h-[80vh] w-full rounded object-contain" />
      </DialogContent>
    </Dialog>
  );
}
