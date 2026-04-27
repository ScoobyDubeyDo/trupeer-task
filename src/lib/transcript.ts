export interface Word {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | string;
  logprob?: number;
}

export interface Transcript {
  text: string;
  words: Word[];
}

export interface VideoMeta {
  src: string;
  background: string;
  duration?: number;
}

const TRANSCRIPT_URL = "/assets/transcript.json";
const VIDEO_SRC = "/assets/video.mp4";

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function fetchTranscript(): Promise<Transcript> {
  const res = await fetch(TRANSCRIPT_URL);
  if (!res.ok) throw new Error("Failed to fetch transcript");
  const data = (await res.json()) as Transcript;
  return delay(data, 200);
}

export async function fetchVideoMeta(): Promise<VideoMeta> {
  return delay({
    src: VIDEO_SRC,
    background: "/assets/background.jpg",
  });
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
