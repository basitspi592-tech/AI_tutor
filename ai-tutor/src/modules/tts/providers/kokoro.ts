import "server-only";
import type { GenerateOptions, KokoroTTS } from "kokoro-js";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { TtsError, type SynthesizeOptions, type TtsProvider, type TtsResult } from "../types";

/** 100% offline, unlimited narration via the Kokoro ONNX model (Apache-2.0).
 *  The model is lazily loaded once per process and cached. */
const MODEL_ID = process.env.KOKORO_MODEL || "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = process.env.KOKORO_VOICE || "af_heart";

let modelPromise: Promise<KokoroTTS> | null = null;

function loadModel(): Promise<KokoroTTS> {
  if (!modelPromise) {
    modelPromise = import("kokoro-js")
      .then((m) => m.KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" }))
      .catch((err) => {
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

export const kokoroTts: TtsProvider = {
  name: "kokoro",
  async synthesize({ text, voice }: SynthesizeOptions): Promise<TtsResult> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-kokoro-"));
    const out = path.join(dir, "audio.wav");
    try {
      const tts = await loadModel();
      const voiceId = (voice || DEFAULT_VOICE) as GenerateOptions["voice"];
      const audio = await tts.generate(text, { voice: voiceId });
      await audio.save(out);
      const data = await fs.readFile(out);
      return { data, mime: "audio/wav" };
    } catch (err) {
      throw new TtsError(`Kokoro TTS failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
