import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Word } from "../lib/transcript";

export interface SkipRange {
  /** Inclusive start index into the words array */
  start: number;
  /** Inclusive end index */
  end: number;
}

/** Merge overlapping/adjacent ranges. */
function normalize(ranges: SkipRange[]): SkipRange[] {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: SkipRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function useSkipRanges(words: Word[]) {
  const [ranges, setRanges] = useState<SkipRange[]>([]);

  // Map of word index -> true if skipped. Built once per ranges change.
  const skipped = useMemo(() => {
    const set = new Set<number>();
    for (const r of ranges) {
      for (let i = r.start; i <= r.end; i++) set.add(i);
    }
    return set;
  }, [ranges]);

  const addRange = useCallback((start: number, end: number) => {
    if (start > end) [start, end] = [end, start];
    setRanges((prev) => normalize([...prev, { start, end }]));
  }, []);

  const removeAt = useCallback((index: number) => {
    setRanges((prev) => {
      const out: SkipRange[] = [];
      for (const r of prev) {
        if (index < r.start || index > r.end) {
          out.push(r);
          continue;
        }
        // Split the range around the removed index.
        if (index > r.start) out.push({ start: r.start, end: index - 1 });
        if (index < r.end) out.push({ start: index + 1, end: r.end });
      }
      return out;
    });
  }, []);

  // Sorted list of skip time intervals [startSec, endSec] for fast lookup.
  const timeIntervals = useMemo(() => {
    return ranges
      .map((r) => {
        const startWord = words[r.start];
        const endWord = words[r.end];
        if (!startWord || !endWord) return null;
        return [startWord.start, endWord.end] as [number, number];
      })
      .filter((x): x is [number, number] => x !== null)
      .sort((a, b) => a[0] - b[0]);
  }, [ranges, words]);

  /** Returns the end of the skip interval containing `t`, or null. */
  const skipEndAt = useCallback(
    (t: number): number | null => {
      for (const [s, e] of timeIntervals) {
        if (t >= s && t < e) return e;
        if (s > t) break;
      }
      return null;
    },
    [timeIntervals],
  );

  return { ranges, skipped, addRange, removeAt, skipEndAt };
}

/**
 * While the video is playing, jump past any skipped intervals.
 */
export function useSkipPlayback(
  video: HTMLVideoElement | null,
  skipEndAt: (t: number) => number | null,
) {
  const skipEndAtRef = useRef(skipEndAt);

  useEffect(() => {
    skipEndAtRef.current = skipEndAt;
  }, [skipEndAt]);

  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const tick = () => {
      if (!video.paused && !video.seeking) {
        const end = skipEndAtRef.current(video.currentTime);
        if (end !== null && end > video.currentTime) {
          video.currentTime = end + 0.001;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video]);
}
