import "server-only";
import { generateSpeech } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { TtsError, type SynthesizeOptions, type TtsProvider, type TtsResult } from "../types";

/** Free-tier quotas are enforced per model, so several TTS models give the app
 *  multiple independent daily request buckets. `gemini-3.8-*` are the current
 *  flagships; the 3.1/2.5 previews are kept as extra fallbacks. */
const DEFAULT_MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

function models(): string[] {
  return (process.env.TTS_MODELS ? process.env.TTS_MODELS.split(",") : DEFAULT_MODELS)
    .map((m) => m.trim())
    .filter(Boolean);
}

const VOICE = process.env.TTS_VOICE || "Kore";

export const geminiTts: TtsProvider = {
  name: "gemini",
  async synthesize({ text }: SynthesizeOptions): Promise<TtsResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new TtsError("GEMINI_API_KEY is not configured");

    const google = createGoogleGenerativeAI({ apiKey });
    let lastError = "";

    for (const model of models()) {
      try {
        const { audio } = await generateSpeech({
          model: google.speech(model),
          text,
          voice: VOICE,
        });
        return { data: Buffer.from(audio.uint8Array), mime: "audio/wav" };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`[tts] gemini "${model}" failed: ${lastError}`);
      }
    }

    throw new TtsError(`all Gemini TTS models failed (${lastError})`);
  },
};
