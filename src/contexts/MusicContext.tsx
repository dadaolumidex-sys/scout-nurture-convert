import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { musicEngine, TRACKS, Track } from "@/lib/musicEngine";

interface MusicContextValue {
  playing: boolean;
  volume: number;
  track: Track;
  tracks: Track[];
  toggle: () => void;
  selectTrack: (id: string) => void;
  setVolume: (v: number) => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = musicEngine.subscribe(() => force((n) => n + 1));
    return () => {
      unsub();
    };
  }, []);

  const toggle = useCallback(() => {
    void musicEngine.toggle();
  }, []);
  const selectTrack = useCallback((id: string) => {
    void musicEngine.selectTrack(id);
  }, []);
  const setVolume = useCallback((v: number) => musicEngine.setVolume(v), []);

  return (
    <MusicContext.Provider
      value={{
        playing: musicEngine.playing,
        volume: musicEngine.volume,
        track: musicEngine.track,
        tracks: TRACKS,
        toggle,
        selectTrack,
        setVolume,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}
