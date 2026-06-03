import { useState } from "react";
import { Play, Pause, Music2, Volume2, ChevronUp } from "lucide-react";
import { useMusic } from "@/contexts/MusicContext";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function MiniMusicPlayer() {
  const { playing, volume, track, tracks, toggle, selectTrack, setVolume } = useMusic();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed left-0 right-0 z-40 bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-3 flex justify-center px-3 pointer-events-none">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-2 py-1.5 shadow-lg",
          "w-full max-w-md md:max-w-sm"
        )}
      >
        <button
          onClick={toggle}
          aria-label={playing ? "Pause music" : "Play music"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            playing ? "gradient-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Choose music track"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left hover:bg-muted/60"
            >
              <span className="text-base leading-none">{track.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{track.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {playing ? "Now playing · focus mode" : "Tap play to relax"}
                </span>
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            className="w-72 bg-card border-border p-3"
          >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Music2 className="h-3.5 w-3.5 text-primary" /> Background music
            </p>
            <div className="grid grid-cols-2 gap-2">
              {tracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTrack(t.id)}
                  aria-pressed={t.id === track.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                    t.id === track.id
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                  )}
                >
                  <span className="text-base leading-none">{t.emoji}</span>
                  <span className="truncate font-medium">{t.name}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Slider
                value={[Math.round(volume * 100)]}
                max={100}
                step={1}
                onValueChange={(v) => setVolume(v[0] / 100)}
                aria-label="Music volume"
              />
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              Plays only inside the app and works fully offline. Enjoy your focus session 🎶
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
