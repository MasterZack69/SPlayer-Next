import { describe, expect, it } from "vitest";
import type { LyricLine } from "@shared/types/lyrics";
import { estimateLyricTiming } from "./estimatedTiming";
import { prepareLyricMarkdown } from "./markdown";

/** Build a line-timed lyric for timing tests. @param text - Raw lyric text. */
const makeLine = (text: string): LyricLine => ({
  startTime: 1000,
  endTime: 5000,
  words: [{ word: text, startTime: 1000, endTime: 5000 }],
  translatedLyric: "",
  romanLyric: "",
  isBG: false,
  isDuet: false,
});

describe("estimated lyric timing", () => {
  it("uses visible graphemes without consuming time on emphasis delimiters", () => {
    const source = makeLine("**A**👩‍👩‍👧‍👦B");
    const [result] = estimateLyricTiming([source], "lrc", 5000);
    expect(result.words.map((word) => word.word).join("")).toBe("**A**👩‍👩‍👧‍👦B");
    const visible = prepareLyricMarkdown(result, false);
    expect(visible.words.map((word) => word.word).join("")).toBe("A👩‍👩‍👧‍👦B");
    expect(visible.inlineStyles.main).toEqual([{ start: 0, end: 1, bold: true, italic: false }]);
    expect(
      result.words
        .filter((word) => word.word === "*")
        .every((word) => word.startTime === word.endTime),
    ).toBe(true);
    expect(result.words.find((word) => word.word === "👩‍👩‍👧‍👦")?.endTime).toBeGreaterThan(
      result.words.find((word) => word.word === "👩‍👩‍👧‍👦")!.startTime,
    );
    expect(source.words).toHaveLength(1);
  });
  it("preserves real word timings and ruby metadata", () => {
    const line = makeLine("First");
    line.words = [
      { word: "First", startTime: 1000, endTime: 2000 },
      { word: "Second", startTime: 2000, endTime: 5000 },
    ];
    expect(estimateLyricTiming([line], "lrc", 5000)[0].words).toEqual(line.words);
    const ruby = makeLine("word");
    ruby.words[0].ruby = [{ word: "reading", startTime: 1000, endTime: 5000 }];
    expect(estimateLyricTiming([ruby], "lrc", 5000)[0].words).toEqual(ruby.words);
  });
});
