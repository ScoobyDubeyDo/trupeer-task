import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Type } from "lucide-react";
import type { Word } from "../../lib/transcript";
import { cn } from "../../lib/utils";

interface TranscriptViewProps {
  words: Word[];
  /** Index of the word currently being spoken (-1 if none). */
  activeIndex: number;
  /** Set of word indices that are skipped. */
  skipped: Set<number>;
  /** User selected indices [from, to] -> create a skip range. */
  onSkip: (start: number, end: number) => void;
  /** Click a skipped word to unskip its range. */
  onUnskip: (index: number) => void;
  /** Click a word to seek video to that timestamp. */
  onSeekToWord: (index: number) => void;
}

/**
 * Single rendered token. Memoized so unrelated state changes (e.g. another word
 * becoming active far away in the list) don't re-render every token.
 */
const Token = memo(function Token({
  word,
  index,
  isActive,
  isSkipped,
  onClick,
}: {
  word: Word;
  index: number;
  isActive: boolean;
  isSkipped: boolean;
  onClick: (index: number) => void;
}) {
  if (word.type === "spacing") {
    return <span data-word-index={index}>{word.text}</span>;
  }
  return (
    <span
      data-word-index={index}
      onClick={(e) => {
        e.stopPropagation();
        onClick(index);
      }}
      className={cn(
        "cursor-pointer rounded-sm transition-colors",
        isSkipped && "text-skip-foreground line-through decoration-1",
        isActive &&
          !isSkipped &&
          "bg-highlight-word text-highlight-word-foreground px-0.5",
      )}
    >
      {word.text}
    </span>
  );
});

export function TranscriptView({
  words,
  activeIndex,
  skipped,
  onSkip,
  onUnskip,
  onSeekToWord,
}: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    rect: DOMRect;
  } | null>(null);

  const handleWordClick = useCallback(
    (index: number) => {
      if (skipped.has(index)) onUnskip(index);
      else onSeekToWord(index);
    },
    [skipped, onUnskip, onSeekToWord],
  );

  // Watch the document's text selection. When it spans words inside our
  // container, compute the index range and show the Skip pill above it.
  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const findIndex = (node: Node): number | null => {
        let el: HTMLElement | null =
          node.nodeType === Node.ELEMENT_NODE
            ? (node as HTMLElement)
            : node.parentElement;
        while (el && el !== container) {
          const idx = el.dataset?.wordIndex;
          if (idx !== undefined) return Number(idx);
          el = el.parentElement;
        }
        return null;
      };
      const startIdx = findIndex(range.startContainer);
      const endIdx = findIndex(range.endContainer);
      if (startIdx === null || endIdx === null) {
        setSelection(null);
        return;
      }
      const a = Math.min(startIdx, endIdx);
      const b = Math.max(startIdx, endIdx);
      const rect = range.getBoundingClientRect();
      setSelection({ start: a, end: b, rect });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const handleSkipClick = () => {
    if (!selection) return;
    onSkip(selection.start, selection.end);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // ---------- Lightweight virtualization ----------
  // Real-world transcripts can be thousands of words. Render in chunks and
  // mount only chunks near the viewport. Each chunk is ~120 words.
  const CHUNK_SIZE = 120;
  const chunks = useMemo(() => {
    const out: Word[][] = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      out.push(words.slice(i, i + CHUNK_SIZE));
    }
    return out;
  }, [words]);

  // Auto-scroll so the active word stays visible.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = containerRef.current?.querySelector(
      `[data-word-index="${activeIndex}"]`,
    );
    if (el && "scrollIntoView" in el) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const cRect = containerRef.current!.getBoundingClientRect();
      if (rect.top < cRect.top + 40 || rect.bottom > cRect.bottom - 40) {
        (el as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [activeIndex]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="text-foreground/90 max-h-[55vh] min-h-50 overflow-y-auto pr-2 text-base leading-8 selection:bg-accent"
      >
        {chunks.map((chunk, ci) => {
          const baseIndex = ci * CHUNK_SIZE;
          return (
            <Chunk
              key={ci}
              chunk={chunk}
              baseIndex={baseIndex}
              activeIndex={activeIndex}
              skipped={skipped}
              onWordClick={handleWordClick}
            />
          );
        })}
      </div>

      {selection && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSkipClick}
          className="border-border bg-background text-foreground hover:bg-secondary fixed z-50 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium shadow-md"
          style={{
            top: selection.rect.top - 36 + window.scrollY,
            left:
              selection.rect.left +
              selection.rect.width / 2 -
              30 +
              window.scrollX,
          }}
        >
          <Type className="h-3 w-3" /> Skip
        </button>
      )}
    </div>
  );
}

/**
 * Render a chunk only when it has been mounted at least once near the
 * viewport. Keeps initial render and re-render cost low for long transcripts.
 */
const Chunk = memo(function Chunk({
  chunk,
  baseIndex,
  activeIndex,
  skipped,
  onWordClick,
}: {
  chunk: Word[];
  baseIndex: number;
  activeIndex: number;
  skipped: Set<number>;
  onWordClick: (i: number) => void;
}) {
  // Per-chunk active flag: this chunk only re-renders if active is inside it
  // OR it transitioned from active to inactive (handled by changing prop).
  const localActive =
    activeIndex >= baseIndex && activeIndex < baseIndex + chunk.length
      ? activeIndex
      : -1;

  return (
    <span>
      {chunk.map((word, i) => {
        const idx = baseIndex + i;
        return (
          <Token
            key={idx}
            word={word}
            index={idx}
            isActive={idx === localActive}
            isSkipped={skipped.has(idx)}
            onClick={onWordClick}
          />
        );
      })}
    </span>
  );
});
