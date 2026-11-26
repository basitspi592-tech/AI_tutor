import "server-only";
import { TtsError, type SynthesizeOptions, type TtsProvider } from "./types";
import { geminiTts } from "./providers/gemini";
import { edgeTts } from "./providers/edge";
import { kokoroTts } from "./providers/kokoro";
import { translateTts } from "./providers/translate";
import { sapiTts } from "./providers/sapi";
import { toWav } from "./wav";

const REGISTRY: Record<string, TtsProvider> = {
  gemini: geminiTts,
  edge: edgeTts,
  kokoro: kokoroTts,
  translate: translateTts,
  sapi: sapiTts,
};

/** Ordered fallback chain; override with TTS_PROVIDERS="gemini,edge,...". */
const DEFAULT_ORDER = ["gemini", "edge", "kokoro", "translate", "sapi"];

function chain(): string[] {
  const raw = process.env.TTS_PROVIDERS;
  return (raw ? raw.split(",") : DEFAULT_ORDER)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Synthesizes narration and always returns canonical PCM WAV. Providers are
 * tried in order until one succeeds:
 *   1. gemini     - free-tier multi-model TTS (highest quality)
 *   2. edge       - Microsoft Edge Read Aloud (free, unlimited, no key)
 *   3. kokoro     - 100% offline local ONNX model (unlimited)
 *   4. translate  - Google Translate speech (free, no key)
 *   5. sapi       - Windows built-in speech (offline, win32 only)
 */
export async function synthesizeNarrationWav(opts: SynthesizeOptions): Promise<Buffer> {
  const failures: string[] = [];

  for (const name of chain()) {
    const provider = REGISTRY[name];
    if (!provider) {
      failures.push(`${name}: unknown provider`);
      continue;
    }

    try {
      const result = await provider.synthesize(opts);
      const wav = result.mime === "audio/wav" ? result.data : await toWav(result.data);
      if (!wav.length) throw new TtsError("provider returned empty audio");
      if (name !== "gemini") console.error(`[tts] narration synthesized with "${name}"`);
      return wav;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${name}: ${message}`);
      console.error(`[tts] provider "${name}" failed: ${message}`);
    }
  }

  throw new TtsError(`Every TTS provider failed → ${failures.join(" | ")}`);
}

export type { SynthesizeOptions } from "./types";
