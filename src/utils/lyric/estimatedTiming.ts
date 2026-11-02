import { clampLastLineEnd } from "lyric-kit";
import type { LyricFormat, LyricLine } from "@shared/types/lyrics";
import { parseLyricMarkdown } from "./markdown";

/**
 * Estimate grapheme timings for line-timed lyrics without changing real timings or markup.
 * @param lines - Parsed lyric lines.
 * @param format - The source lyric format.
 * @param duration - Current track duration in milliseconds.
 * @returns Lines with estimated timings where possible.
 */
export const estimateLyricTiming = (
  lines: LyricLine[],
  format: LyricFormat,
  duration?: number,
): LyricLine[] => {
  const last = lines.at(-1);
  const lastTimed =
    last &&
    (last.words.length > 1 || ["ttml", "lys", "yrc", "qrc", "krc"].includes(format)) &&
    last.words.some((word) => word.endTime > word.startTime);
  const bounded =
    !lastTimed && !last?.words.some((word) => word.ruby?.length || word.romanWord)
      ? clampLastLineEnd(lines, duration)
      : lines;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return bounded.map((line) => {
    const timed =
      (line.words.length > 1 || ["ttml", "lys", "yrc", "qrc", "krc"].includes(format)) &&
      line.words.some((word) => word.endTime > word.startTime);
    if (
      timed ||
      line.endTime <= line.startTime ||
      !line.words.length ||
      line.words.some((word) => word.ruby?.length || word.romanWord)
    )
      return line;
    const text = line.words.map((word) => word.word).join("");
    const visible = parseLyricMarkdown(text).sourceOffsets;
    const segments = Array.from(segmenter.segment(text));
    const visibleSegments = segments.filter((part) =>
      visible.some((offset) => offset >= part.index && offset < part.index + part.segment.length),
    );
    if (!visibleSegments.length) return line;
    let current = 0;
    const durationMs = line.endTime - line.startTime;
    const words = segments.map((part) => {
      const startTime =
        line.startTime + Math.round((durationMs * current) / visibleSegments.length);
      if (
        visible.some((offset) => offset >= part.index && offset < part.index + part.segment.length)
      )
        current++;
      const endTime = line.startTime + Math.round((durationMs * current) / visibleSegments.length);
      return { ...line.words[0], word: part.segment, startTime, endTime };
    });
    return { ...line, words };
  });
};
