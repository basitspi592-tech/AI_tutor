import "server-only";
import { TtsError, type SynthesizeOptions, type TtsProvider, type TtsResult } from "../types";

/** Free, no-key fallback using Google Translate's speech endpoint. Requests are
 *  capped at ~200 characters, so longer narration is chunked and concatenated. */
const MAX_CHARS = 180;

function chunk(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const parts: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = (current ? `${current} ${word}` : word).trim();
    if (candidate.length > MAX_CHARS && current) {
      parts.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export const translateTts: TtsProvider = {
  name: "translate",
  async synthesize({ text, language }: SynthesizeOptions): Promise<TtsResult> {
    const tl = (language || "en").split("-")[0] || "en";
    const pieces = chunk(text);
    const buffers: Buffer[] = [];

    try {
      for (const piece of pieces) {
        const url =
          "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob" +
          `&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(piece)}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            Referer: "https://translate.google.com/",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
    } catch (err) {
      throw new TtsError(
        `Google Translate TTS failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return { data: Buffer.concat(buffers), mime: "audio/mpeg" };
  },
};
