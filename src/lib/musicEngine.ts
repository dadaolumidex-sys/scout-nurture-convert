/**
 * Generative ambient / lofi music engine using the Web Audio API.
 *
 * No audio files are needed, so playback works fully offline and only ever
 * runs while the app is open. Each "track" is a mood preset that generates
 * an endless, gentle soundscape (soft pads, mellow melody, optional rain).
 */

export interface Track {
  id: string;
  name: string;
  emoji: string;
  /** scale intervals (semitones) used for melody/pads */
  scale: number[];
  /** root note frequency */
  root: number;
  /** chord roots (scale degrees) cycled for the progression */
  progression: number[];
  /** seconds per chord */
  chordTime: number;
  /** melody note probability per step */
  melodyDensity: number;
  /** add soft rain/noise texture */
  rain: boolean;
  /** oscillator waveform for pads */
  wave: OscillatorType;
}

export const TRACKS: Track[] = [
  {
    id: "lofi",
    name: "Lofi Chill",
    emoji: "🎧",
    scale: [0, 2, 3, 5, 7, 9, 10],
    root: 220, // A3
    progression: [0, 5, 3, 4],
    chordTime: 6,
    melodyDensity: 0.5,
    rain: false,
    wave: "triangle",
  },
  {
    id: "focus",
    name: "Deep Focus",
    emoji: "🧠",
    scale: [0, 2, 4, 7, 9],
    root: 196, // G3
    progression: [0, 3, 4, 0],
    chordTime: 8,
    melodyDensity: 0.3,
    rain: false,
    wave: "sine",
  },
  {
    id: "rain",
    name: "Calm Rain",
    emoji: "🌧️",
    scale: [0, 3, 5, 7, 10],
    root: 174, // F3
    progression: [0, 4, 5, 3],
    chordTime: 9,
    melodyDensity: 0.25,
    rain: true,
    wave: "sine",
  },
  {
    id: "dream",
    name: "Dreamy",
    emoji: "✨",
    scale: [0, 2, 4, 6, 9, 11],
    root: 261.63, // C4
    progression: [0, 4, 2, 5],
    chordTime: 7,
    melodyDensity: 0.45,
    rain: false,
    wave: "triangle",
  },
];

function midiToFreq(root: number, semitones: number) {
  return root * Math.pow(2, semitones / 12);
}

type Listener = () => void;

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private scheduler: number | null = null;
  private step = 0;
  private nextNoteTime = 0;

  private _playing = false;
  private _volume = 0.5;
  private _trackId: string = TRACKS[0].id;

  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get playing() {
    return this._playing;
  }
  get volume() {
    return this._volume;
  }
  get track() {
    return TRACKS.find((t) => t.id === this._trackId) || TRACKS[0];
  }

  private ensureContext() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
    }
    this.emit();
  }

  async selectTrack(id: string) {
    const wasPlaying = this._playing;
    this._trackId = id;
    if (wasPlaying) {
      this.stop(false);
      await this.play();
    }
    this.emit();
  }

  async toggle() {
    if (this._playing) this.stop();
    else await this.play();
  }

  async play() {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    this._playing = true;
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.1;
    if (this.track.rain) this.startRain();
    this.scheduler = window.setInterval(() => this.scheduleAhead(), 100);
    this.emit();
  }

  stop(emit = true) {
    this._playing = false;
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.stopRain();
    if (this.ctx) void this.ctx.suspend();
    if (emit) this.emit();
  }

  private scheduleAhead() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.5) {
      this.scheduleStep(this.nextNoteTime);
      const stepDur = 0.5; // eighth-ish steps
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private scheduleStep(time: number) {
    const t = this.track;
    const stepsPerChord = Math.round(t.chordTime / 0.5);
    const chordIndex = Math.floor(this.step / stepsPerChord) % t.progression.length;
    const degree = t.progression[chordIndex];
    const localStep = this.step % stepsPerChord;

    // Pad: trigger a soft chord at the start of each chord block
    if (localStep === 0) {
      const chordTones = [0, 2, 4].map((i) => t.scale[(degree + i) % t.scale.length] + (i >= t.scale.length ? 12 : 0));
      chordTones.forEach((semi, idx) => {
        this.playPad(midiToFreq(t.root, semi + degree), time, t.chordTime, idx === 0 ? 0.07 : 0.04);
      });
      // bass
      this.playBass(midiToFreq(t.root / 2, t.scale[degree % t.scale.length]), time, t.chordTime);
    }

    // Melody: occasional gentle notes
    if (Math.random() < t.melodyDensity && localStep % 2 === 0) {
      const note = t.scale[Math.floor(Math.random() * t.scale.length)] + degree + 12;
      this.playMelody(midiToFreq(t.root, note), time, 0.6);
    }
  }

  private playPad(freq: number, time: number, dur: number, peak: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    osc.type = this.track.wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 1.2);
    gain.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.1);
  }

  private playBass(freq: number, time: number, dur: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.06, time + 0.4);
    gain.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.1);
  }

  private playMelody(freq: number, time: number, dur: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private startRain() {
    if (!this.ctx || !this.master) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.rainSource = source;
    this.rainGain = gain;
  }

  private stopRain() {
    if (this.rainSource) {
      try {
        this.rainSource.stop();
      } catch {
        /* noop */
      }
      this.rainSource.disconnect();
      this.rainSource = null;
    }
    if (this.rainGain) {
      this.rainGain.disconnect();
      this.rainGain = null;
    }
  }
}

export const musicEngine = new MusicEngine();
