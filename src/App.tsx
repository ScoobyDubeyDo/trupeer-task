import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchTranscript,
  fetchVideoMeta,
  type Transcript,
  type VideoMeta,
} from "./lib/transcript";
import {
  CanvasPlayer,
  type CanvasPlayerHandle,
} from "./components/player/CanvasPlayer";
import { TranscriptView } from "./components/player/TranscriptView";
import { PlaybackControls } from "./components/player/PlaybackControls";
import { Slider } from "./components/ui/slider";
import { useVideoElement } from "./hooks/useVideoElement";
import { useSkipPlayback, useSkipRanges } from "./hooks/useSkipRanges";

export default function App() {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchTranscript(), fetchVideoMeta()])
      .then(([t, m]) => {
        if (!alive) return;
        setTranscript(t);
        setMeta(m);
      })
      .catch((e) => alive && setError(e?.message ?? "Failed to load"));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (!transcript || !meta) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </main>
    );
  }

  return <Composer transcript={transcript} meta={meta} />;
}

function Composer({
  transcript,
  meta,
}: {
  transcript: Transcript;
  meta: VideoMeta;
}) {
  const [padding, setPadding] = useState(20);
  const [rounding, setRounding] = useState(32);

  const playerRef = useRef<CanvasPlayerHandle>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const onReady = useCallback((v: HTMLVideoElement) => {
    videoRef.current = v;
    setVideo(v);
  }, []);

  const { isPlaying, duration, currentTime } = useVideoElement(video);

  const { skipped, addRange, removeAt, skipEndAt } = useSkipRanges(
    transcript.words,
  );
  useSkipPlayback(video, skipEndAt);

  const wordStarts = useMemo(
    () => transcript.words.map((w) => w.start),
    [transcript.words],
  );
  const activeIndex = useMemo(() => {
    if (currentTime <= 0) return -1;
    let lo = 0;
    let hi = transcript.words.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wordStarts[mid] <= currentTime) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }, [currentTime, wordStarts, transcript.words]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  }, []);

  const seekToWord = useCallback(
    (idx: number) => {
      const w = transcript.words[idx];
      const v = videoRef.current;
      if (w && v) {
        v.currentTime = w.start;
        if (v.paused) void v.play();
      }
    },
    [transcript.words],
  );

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto grid max-w-400 grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <aside className="flex flex-col gap-8">
          <section>
            <h2 className="text-foreground mb-3 text-sm font-medium">Script</h2>
            <TranscriptView
              words={transcript.words}
              activeIndex={activeIndex}
              skipped={skipped}
              onSkip={addRange}
              onUnskip={removeAt}
              onSeekToWord={seekToWord}
            />
          </section>

          <section className="flex flex-col gap-5">
            <ControlSlider
              label="Padding"
              value={padding}
              onChange={setPadding}
            />
            <ControlSlider
              label="Rounding"
              value={rounding}
              onChange={setRounding}
            />
          </section>
        </aside>

        <section className="flex flex-col gap-6">
          <div className="bg-secondary/40 ring-border/60 relative aspect-video w-full overflow-hidden rounded-2xl ring-1">
            <CanvasPlayer
              ref={playerRef}
              videoSrc={meta.src}
              backgroundSrc={meta.background}
              padding={padding}
              rounding={rounding}
              onReady={onReady}
            />
          </div>

          <PlaybackControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            onTogglePlay={togglePlay}
            onSeek={seek}
          />
        </section>
      </div>
    </main>
  );
}

function ControlSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-foreground mb-2 text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground w-6 text-right font-mono text-xs tabular-nums">
          00
        </span>
        <Slider
          value={[value]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => onChange(v[0] ?? 0)}
          className="flex-1"
        />
        <span className="bg-secondary text-foreground inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 font-mono text-xs tabular-nums">
          {String(value).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
