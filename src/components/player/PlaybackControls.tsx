import { Play, Pause } from "lucide-react";
import { formatTime } from "../../lib/transcript";
import { Slider } from "../ui/slider";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-colors"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          )}
        </button>
        <div className="text-muted-foreground font-mono text-sm tabular-nums">
          <span className="text-foreground">{formatTime(currentTime)}</span>
          <span className="mx-1">/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Timeline currentTime={currentTime} duration={duration} onSeek={onSeek} />
    </div>
  );
}

function Timeline({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const ticks = useTicks(duration);
  return (
    <div className="w-full">
      <div className="text-muted-foreground/80 mb-1 flex w-full justify-between px-1 font-mono text-xs tabular-nums">
        {ticks.map((t) => (
          <span key={t}>{formatTime(t)}</span>
        ))}
      </div>
      <Slider
        value={[Math.min(currentTime, duration || 0)]}
        max={Math.max(duration, 0.001)}
        step={0.05}
        onValueChange={(v) => onSeek(v[0] ?? 0)}
        className="w-full"
        aria-label="Seek"
      />
    </div>
  );
}

function useTicks(duration: number): number[] {
  if (!duration || duration <= 0) return [0];
  const target = 8;
  const niceSteps = [5, 10, 15, 30, 60, 120, 300, 600];
  const step =
    niceSteps.find((s) => duration / s <= target) ??
    niceSteps[niceSteps.length - 1];
  const out: number[] = [];
  for (let t = 0; t <= duration; t += step) out.push(t);
  return out;
}
