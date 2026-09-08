import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../ThemeContext";
import { useLocalStorage } from "../hooks/useLocalStorage";

// ─── Audio generators ────────────────────────────────────────────────────────

function makeWhiteNoise(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  return () => {
    try {
      src.stop();
    } catch {}
  };
}

function makeBrownNoise(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
    d[i] *= 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  return () => {
    try {
      src.stop();
    } catch {}
  };
}

function makePinkNoise(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  return () => {
    try {
      src.stop();
    } catch {}
  };
}

function makeRain(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  // Rumble layer (brown noise, low-pass)
  const rumbleBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const rd = rumbleBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    rd[i] = (last + 0.02 * w) / 1.02;
    last = rd[i];
    rd[i] *= 3.5;
  }
  // Drop layer (white noise, high-pass)
  const dropBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const dd = dropBuf.getChannelData(0);
  for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;

  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;
  rumbleSrc.loop = true;
  const dropSrc = ctx.createBufferSource();
  dropSrc.buffer = dropBuf;
  dropSrc.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 400;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 1200;
  hpf.Q.value = 0.4;

  const rGain = ctx.createGain();
  rGain.gain.value = 0.45;
  const dGain = ctx.createGain();
  dGain.gain.value = 0.55;

  rumbleSrc.connect(lpf);
  lpf.connect(rGain);
  rGain.connect(dest);
  dropSrc.connect(hpf);
  hpf.connect(dGain);
  dGain.connect(dest);
  rumbleSrc.start();
  dropSrc.start();
  return () => {
    try {
      rumbleSrc.stop();
      dropSrc.stop();
    } catch {}
  };
}

function makeOcean(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
    d[i] *= 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 250;
  const waveGain = ctx.createGain();
  waveGain.gain.value = 0.6;

  // Slow LFO (wave rhythm ~0.12Hz, one wave every ~8 seconds)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.35;
  lfo.connect(lfoGain);
  lfoGain.connect(waveGain.gain);

  src.connect(lpf);
  lpf.connect(waveGain);
  waveGain.connect(dest);
  src.start();
  lfo.start();
  return () => {
    try {
      src.stop();
      lfo.stop();
    } catch {}
  };
}

function makeForest(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Band-pass for leafy mid-frequencies
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 700;
  bpf.Q.value = 0.4;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.65;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.25;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.25;
  lfo.connect(lfoGain);
  lfoGain.connect(masterGain.gain);

  src.connect(bpf);
  bpf.connect(masterGain);
  masterGain.connect(dest);
  src.start();
  lfo.start();
  return () => {
    try {
      src.stop();
      lfo.stop();
    } catch {}
  };
}

function makeFire(ctx: AudioContext, dest: AudioNode): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
    d[i] *= 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 200;
  bpf.Q.value = 0.6;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0.7;

  // Flickering LFO
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2.5;
  lfo.type = "sawtooth";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.2;
  lfo.connect(lfoGain);
  lfoGain.connect(crackleGain.gain);

  src.connect(bpf);
  bpf.connect(crackleGain);
  crackleGain.connect(dest);
  src.start();
  lfo.start();
  return () => {
    try {
      src.stop();
      lfo.stop();
    } catch {}
  };
}

function makeBinaural(
  ctx: AudioContext,
  dest: AudioNode,
  beatHz: number,
): () => void {
  const baseFreq = 200;
  // Stereo merger: left ear gets baseFreq, right ear gets baseFreq + beatHz
  const merger = ctx.createChannelMerger(2);
  const leftOsc = ctx.createOscillator();
  leftOsc.frequency.value = baseFreq;
  leftOsc.type = "sine";
  const rightOsc = ctx.createOscillator();
  rightOsc.frequency.value = baseFreq + beatHz;
  rightOsc.type = "sine";
  const lGain = ctx.createGain();
  lGain.gain.value = 0.28;
  const rGain = ctx.createGain();
  rGain.gain.value = 0.28;
  leftOsc.connect(lGain);
  rightOsc.connect(rGain);
  lGain.connect(merger, 0, 0);
  rGain.connect(merger, 0, 1);
  merger.connect(dest);
  leftOsc.start();
  rightOsc.start();
  return () => {
    try {
      leftOsc.stop();
      rightOsc.stop();
    } catch {}
  };
}

// ─── Sound definitions ───────────────────────────────────────────────────────

type SoundId =
  | "white"
  | "brown"
  | "pink"
  | "rain"
  | "ocean"
  | "forest"
  | "fire"
  | "alpha"
  | "gamma";
type ImportedSong = { id: string; name: string; url: string };

const SOUNDS: {
  id: SoundId;
  name: string;
  emoji: string;
  desc: string;
  category: string;
  create: (ctx: AudioContext, dest: AudioNode) => () => void;
}[] = [
  {
    id: "brown",
    name: "Brown Noise",
    emoji: "🟫",
    desc: "Deep, warm rumble. Best for sustained focus.",
    category: "Noise",
    create: (ctx, dest) => makeBrownNoise(ctx, dest),
  },
  {
    id: "white",
    name: "White Noise",
    emoji: "⬜",
    desc: "Flat spectrum. Masks distracting sounds.",
    category: "Noise",
    create: (ctx, dest) => makeWhiteNoise(ctx, dest),
  },
  {
    id: "pink",
    name: "Pink Noise",
    emoji: "🌸",
    desc: "Balanced, like a gentle waterfall.",
    category: "Noise",
    create: (ctx, dest) => makePinkNoise(ctx, dest),
  },
  {
    id: "rain",
    name: "Rain",
    emoji: "🌧️",
    desc: "Steady rainfall. Calming and focusing.",
    category: "Nature",
    create: (ctx, dest) => makeRain(ctx, dest),
  },
  {
    id: "ocean",
    name: "Ocean Waves",
    emoji: "🌊",
    desc: "Slow rhythmic waves. Meditative and deep.",
    category: "Nature",
    create: (ctx, dest) => makeOcean(ctx, dest),
  },
  {
    id: "forest",
    name: "Forest",
    emoji: "🌲",
    desc: "Rustling leaves. Gentle and grounding.",
    category: "Nature",
    create: (ctx, dest) => makeForest(ctx, dest),
  },
  {
    id: "fire",
    name: "Fireplace",
    emoji: "🔥",
    desc: "Crackling fire. Warm and cosy.",
    category: "Nature",
    create: (ctx, dest) => makeFire(ctx, dest),
  },
  {
    id: "alpha",
    name: "Alpha Waves",
    emoji: "🧘",
    desc: "10 Hz binaural beat — relaxed focus. Use headphones.",
    category: "Binaural",
    create: (ctx, dest) => makeBinaural(ctx, dest, 10),
  },
  {
    id: "gamma",
    name: "Gamma Waves",
    emoji: "⚡",
    desc: "40 Hz binaural beat — high concentration. Use headphones.",
    category: "Binaural",
    create: (ctx, dest) => makeBinaural(ctx, dest, 40),
  },
];

const CATEGORIES = ["Noise", "Nature", "Binaural"];

const PRESETS: {
  name: string;
  emoji: string;
  desc: string;
  mix: Partial<Record<SoundId, number>>;
}[] = [
  {
    name: "Deep Focus",
    emoji: "🎯",
    desc: "Brown noise + alpha waves for sustained concentration",
    mix: { brown: 0.7, alpha: 0.4 },
  },
  {
    name: "Rainy Study",
    emoji: "📚",
    desc: "Rain with gentle forest undertone",
    mix: { rain: 0.8, forest: 0.35 },
  },
  {
    name: "Lo-Fi Vibe",
    emoji: "🎵",
    desc: "Pink noise + fireplace warmth",
    mix: { pink: 0.6, fire: 0.5 },
  },
  {
    name: "Ocean Zen",
    emoji: "🏄",
    desc: "Ocean waves with binaural alpha",
    mix: { ocean: 0.75, alpha: 0.35 },
  },
  {
    name: "Pure Focus",
    emoji: "🔬",
    desc: "Gamma binaural + white noise mask",
    mix: { gamma: 0.45, white: 0.5 },
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AmbientPlayer() {
  const { theme } = useTheme();
  const c = theme.accent;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  // Map of active sounds: id → { stop fn, gainNode }
  const activeRef = useRef<Map<SoundId, { stop: () => void; gain: GainNode }>>(
    new Map(),
  );

  const [playing, setPlaying] = useState<Set<SoundId>>(new Set());
  const [volumes, setVolumes] = useState<Record<SoundId, number>>(
    Object.fromEntries(SOUNDS.map((s) => [s.id, 0.7])) as Record<
      SoundId,
      number
    >,
  );
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useLocalStorage<string[]>(
    "sf-favorite-sounds",
    [],
  );
  const [importedSongs, setImportedSongs] = useState<ImportedSong[]>([]);
  const [playingSong, setPlayingSong] = useState<string | null>(null);
  const songAudioRef = useRef<HTMLAudioElement | null>(null);

  // Keep master gain in sync
  useEffect(() => {
    if (masterGainRef.current) masterGainRef.current.gain.value = masterVolume;
  }, [masterVolume]);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new AudioContext();
        const mg = ctxRef.current.createGain();
        mg.gain.value = masterVolume;
        mg.connect(ctxRef.current.destination);
        masterGainRef.current = mg;
      } catch {
        setError(
          "Your browser blocked audio. Click anywhere on the page first, then try again.",
        );
        return false;
      }
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {
        setError(
          "Audio was suspended. Please interact with the page and try again.",
        );
      });
    }
    return true;
  }, [masterVolume]);

  const toggleSound = useCallback(
    (id: SoundId) => {
      setError(null);
      if (activeRef.current.has(id)) {
        // Stop
        const entry = activeRef.current.get(id)!;
        entry.stop();
        activeRef.current.delete(id);
        setPlaying((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      } else {
        // Start
        if (!ensureContext()) return;
        const ctx = ctxRef.current!;
        const master = masterGainRef.current!;

        // Per-sound gain node so individual volume works
        const soundGain = ctx.createGain();
        soundGain.gain.value = volumes[id];
        soundGain.connect(master);

        const sound = SOUNDS.find((s) => s.id === id)!;
        const stop = sound.create(ctx, soundGain);

        activeRef.current.set(id, { stop, gain: soundGain });
        setPlaying((prev) => new Set([...prev, id]));
      }
    },
    [ensureContext, volumes],
  );

  const applyPreset = useCallback(
    (preset: (typeof PRESETS)[0]) => {
      setError(null);
      // Stop all current sounds
      activeRef.current.forEach((entry) => entry.stop());
      activeRef.current.clear();
      setPlaying(new Set());

      if (!ensureContext()) return;
      const ctx = ctxRef.current!;
      const master = masterGainRef.current!;

      const newPlaying = new Set<SoundId>();
      const newVolumes = { ...volumes };

      Object.entries(preset.mix).forEach(([id, vol]) => {
        const sid = id as SoundId;
        newVolumes[sid] = vol as number;
        const soundGain = ctx.createGain();
        soundGain.gain.value = vol as number;
        soundGain.connect(master);
        const sound = SOUNDS.find((s) => s.id === sid)!;
        const stop = sound.create(ctx, soundGain);
        activeRef.current.set(sid, { stop, gain: soundGain });
        newPlaying.add(sid);
      });

      setVolumes(newVolumes);
      setPlaying(newPlaying);
    },
    [ensureContext, volumes],
  );

  const stopAll = useCallback(() => {
    activeRef.current.forEach((entry) => entry.stop());
    activeRef.current.clear();
    setPlaying(new Set());
  }, []);

  const updateVolume = useCallback((id: SoundId, vol: number) => {
    setVolumes((prev) => ({ ...prev, [id]: vol }));
    const entry = activeRef.current.get(id);
    if (entry) entry.gain.gain.value = vol;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      activeRef.current.forEach((e) => e.stop());
      activeRef.current.clear();
    };
  }, []);

  const visibleSounds =
    activeCategory === "All"
      ? SOUNDS
      : SOUNDS.filter((s) => s.category === activeCategory);

  const anyPlaying = playing.size > 0;

  const importSong = (file: File) => {
    const url = URL.createObjectURL(file);
    setImportedSongs((songs) => [
      ...songs,
      { id: `${file.name}-${Date.now()}`, name: file.name, url },
    ]);
  };

  const toggleSong = (song: ImportedSong) => {
    if (playingSong === song.id) {
      songAudioRef.current?.pause();
      setPlayingSong(null);
      return;
    }
    if (!songAudioRef.current) songAudioRef.current = new Audio();
    songAudioRef.current.src = song.url;
    songAudioRef.current.loop = true;
    songAudioRef.current
      .play()
      .catch(() =>
        setError(
          "The browser blocked this song. Press play again to allow audio.",
        ),
      );
    setPlayingSong(song.id);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-bold tracking-tight mb-1"
          style={{ color: theme.text }}
        >
          Ambient Sounds
        </h1>
        <p className="text-sm" style={{ color: theme.textSubtle }}>
          Layer sounds to build your perfect focus environment. All generated
          in-browser — no internet required.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm animate-fade-in"
          style={{
            background: "rgba(232,83,42,0.15)",
            border: "1px solid rgba(232,83,42,0.3)",
            color: "#e8532a",
          }}
        >
          {error}
        </div>
      )}

      {/* Master controls */}
      <div
        className="flex flex-wrap items-center gap-4 mb-8 px-5 py-4 rounded-2xl"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: theme.textMuted, flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 5H5L7 3V11L5 9H2V5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
                strokeLinejoin="round"
              />
              <path
                d="M9 4.5C10.2 5.3 11 6.6 11 8C11 9.4 10.2 10.7 9 11.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Master
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: c }}
          />
          <span
            className="text-xs w-8 text-right"
            style={{
              color: theme.textSubtle,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {anyPlaying && (
            <>
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: c }}
              >
                <span
                  className="w-2 h-2 rounded-full animate-pulse-ring"
                  style={{ background: c }}
                />
                {playing.size} active
              </div>
              <button
                onClick={stopAll}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-70"
                style={{
                  background: theme.cardHover,
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                }}
              >
                Stop all
              </button>
            </>
          )}
          {!anyPlaying && (
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              No sounds playing
            </span>
          )}
        </div>
      </div>

      {/* Presets */}
      <section className="mb-8">
        <h2
          className="text-xs font-semibold tracking-widest uppercase mb-4"
          style={{ color: theme.textSubtle }}
        >
          Quick Mix Presets
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="rounded-xl p-3 text-left transition-all hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="text-2xl mb-1">{preset.emoji}</div>
              <div
                className="text-xs font-semibold mb-0.5"
                style={{ color: theme.text }}
              >
                {preset.name}
              </div>
              <div
                className="text-xs leading-tight"
                style={{ color: theme.textSubtle }}
              >
                {preset.desc}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section
        className="mb-8 rounded-2xl p-5"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
              Song Library
            </h2>
            <p className="text-xs mt-1" style={{ color: theme.textSubtle }}>
              Import your own songs, play them during study, or download them
              again.
            </p>
          </div>
          <label
            className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            style={{ background: c, color: theme.accentFg }}
          >
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(event) => {
                Array.from(event.target.files ?? []).forEach(importSong);
                event.currentTarget.value = "";
              }}
            />
            Import songs
          </label>
        </div>
        {importedSongs.length === 0 ? (
          <div className="text-xs py-3" style={{ color: theme.textSubtle }}>
            No personal songs imported yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {importedSongs.map((song) => (
              <div
                key={song.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                style={{ background: theme.cardHover }}
              >
                <span
                  className="text-xs truncate"
                  style={{ color: theme.text }}
                >
                  {song.name}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSong(song)}
                    className="px-2.5 py-1 rounded-lg text-xs"
                    style={{
                      background: playingSong === song.id ? c : theme.card,
                      color:
                        playingSong === song.id
                          ? theme.accentFg
                          : theme.textMuted,
                    }}
                  >
                    {playingSong === song.id ? "Pause" : "Play"}
                  </button>
                  <a
                    href={song.url}
                    download={song.name}
                    className="px-2.5 py-1 rounded-lg text-xs"
                    style={{ background: theme.card, color: theme.textMuted }}
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Category filter */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-5 w-fit"
        style={{ background: theme.card }}
      >
        {["All", ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background:
                activeCategory === cat ? theme.cardHover : "transparent",
              color: activeCategory === cat ? theme.text : theme.textSubtle,
              border:
                activeCategory === cat
                  ? `1px solid ${theme.border}`
                  : "1px solid transparent",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Sound grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {visibleSounds.map((sound) => {
          const active = playing.has(sound.id);
          const vol = volumes[sound.id];
          return (
            <div
              key={sound.id}
              className="rounded-2xl p-4 transition-all"
              style={{
                background: active ? `${c}12` : theme.card,
                border: `1px solid ${active ? `${c}35` : theme.border}`,
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 transition-all"
                    style={{ background: active ? `${c}25` : theme.cardHover }}
                  >
                    {sound.emoji}
                  </div>
                  <button
                    onClick={() =>
                      setFavorites((current) =>
                        current.includes(sound.id)
                          ? current.filter((id) => id !== sound.id)
                          : [...current, sound.id],
                      )
                    }
                    className="text-lg"
                    style={{
                      color: favorites.includes(sound.id)
                        ? "#f5a623"
                        : theme.textSubtle,
                    }}
                    title="Favorite sound"
                  >
                    {favorites.includes(sound.id) ? "★" : "☆"}
                  </button>
                  <div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: theme.text }}
                    >
                      {sound.name}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: theme.textSubtle }}
                    >
                      {sound.category}
                    </div>
                  </div>
                </div>

                {/* Play/pause button */}
                <button
                  onClick={() => toggleSound(sound.id)}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: active ? c : theme.cardHover,
                    color: active ? theme.accentFg : theme.textMuted,
                    border: `1px solid ${active ? c : theme.border}`,
                    boxShadow: active ? `0 0 16px ${c}50` : "none",
                  }}
                >
                  {active ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="currentColor"
                    >
                      <rect x="2" y="1.5" width="3" height="9" rx="1" />
                      <rect x="7" y="1.5" width="3" height="9" rx="1" />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="currentColor"
                    >
                      <path d="M2.5 2L10.5 6L2.5 10V2Z" />
                    </svg>
                  )}
                </button>
              </div>

              <p
                className="text-xs leading-relaxed mb-3"
                style={{ color: theme.textMuted }}
              >
                {sound.desc}
              </p>

              {/* Volume slider — only visible when active or always */}
              <div className="flex items-center gap-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{
                    color: active ? c : theme.textSubtle,
                    flexShrink: 0,
                  }}
                >
                  <path
                    d="M1 4H4L6 2V10L4 8H1V4Z"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    fill="none"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 3.5C8.9 4.2 9.5 5.1 9.5 6C9.5 6.9 8.9 7.8 8 8.5"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vol}
                  onChange={(e) =>
                    updateVolume(sound.id, parseFloat(e.target.value))
                  }
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: active ? c : theme.textSubtle }}
                  disabled={!active}
                />
                <span
                  className="text-xs w-7 text-right"
                  style={{
                    color: active ? c : theme.textSubtle,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {Math.round(vol * 100)}
                </span>
              </div>

              {/* Active pulse indicator */}
              {active && (
                <div className="flex items-center gap-1.5 mt-3 animate-fade-in">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full"
                      style={{
                        width: 3,
                        background: c,
                        height: 6 + Math.sin(i * 1.2) * 6,
                        opacity: 0.4 + i * 0.12,
                        animation: `pulse-ring ${0.8 + i * 0.15}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                  <span className="text-xs ml-1" style={{ color: c }}>
                    Playing
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Binaural tip */}
      <div
        className="rounded-2xl p-4 flex gap-3 items-start"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <span className="text-xl flex-shrink-0">🎧</span>
        <div>
          <div
            className="text-sm font-semibold mb-1"
            style={{ color: theme.text }}
          >
            Binaural beats require headphones
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: theme.textMuted }}
          >
            Alpha (10 Hz) and Gamma (40 Hz) binaural beats work by playing two
            slightly different frequencies — one in each ear. Your brain
            perceives the difference as a low-frequency pulse. This only works
            correctly through headphones or earbuds that keep left and right
            channels separated. Speakers mix the channels before they reach your
            ears, negating the effect.
          </p>
        </div>
      </div>
    </div>
  );
}
