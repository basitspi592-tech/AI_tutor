import { describe, expect, it } from "vitest";
import { parseRange } from "../modules/video/http";
import { wavDurationSeconds } from "../modules/video/audio";

const SIZE = 1000;

function pcmWav(dataBytes: number, byteRate: number) {
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(byteRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe("parseRange", () => {
  it("returns null without a header", () => {
    expect(parseRange(null, SIZE)).toBeNull();
  });

  it("parses an explicit closed range", () => {
    expect(parseRange("bytes=0-499", SIZE)).toEqual({ start: 0, end: 499 });
  });

  it("parses an open-ended range", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("parses a suffix range", () => {
    expect(parseRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
  });

  it("clamps an end past the file size", () => {
    expect(parseRange("bytes=900-5000", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("clamps a suffix longer than the file", () => {
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("rejects a start beyond the file", () => {
    expect(parseRange("bytes=1000-", SIZE)).toBeNull();
  });

  it("rejects an inverted range", () => {
    expect(parseRange("bytes=500-100", SIZE)).toBeNull();
  });

  it("rejects multi-range and malformed headers", () => {
    expect(parseRange("bytes=0-99,200-299", SIZE)).toBeNull();
    expect(parseRange("items=0-99", SIZE)).toBeNull();
    expect(parseRange("bytes=abc-def", SIZE)).toBeNull();
  });
});

describe("wavDurationSeconds", () => {
  it("derives duration from the data chunk size and byte rate", () => {
    // 24000 mono 16-bit = 48000 bytes/sec, so 1.5s of audio is 72000 bytes.
    expect(wavDurationSeconds(pcmWav(72000, 48000))).toBeCloseTo(1.5, 6);
  });

  it("skips unknown chunks before data", () => {
    const base = pcmWav(48000, 48000);
    const extra = Buffer.alloc(12);
    extra.write("LIST", 0, "ascii");
    extra.writeUInt32LE(4, 4);
    const withChunk = Buffer.concat([base.subarray(0, 12), extra, base.subarray(12)]);
    expect(wavDurationSeconds(withChunk)).toBeCloseTo(1, 6);
  });

  it("rejects non-WAV input", () => {
    expect(() => wavDurationSeconds(Buffer.alloc(64))).toThrow(/unexpected format/);
    expect(() => wavDurationSeconds(Buffer.alloc(8))).toThrow(/unexpected format/);
  });
});
