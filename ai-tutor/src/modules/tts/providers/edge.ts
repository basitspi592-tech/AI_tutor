import "server-only";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { EdgeTTS } from "node-edge-tts";
import { TtsError, type SynthesizeOptions, type TtsProvider, type TtsResult } from "../types";

/** Microsoft Edge Read Aloud voices are free and effectively unlimited, with
 *  no API key. Picks a native neural voice per app language. */
function voiceFor(language?: string): { voice: string; lang: string } {
  const l = (language || "en").toLowerCase();
  if (l.startsWith("ar")) return { voice: "ar-SA-HamedNeural", lang: "ar-SA" };
  if (l.startsWith("fr")) return { voice: "fr-FR-DeniseNeural", lang: "fr-FR" };
  if (l.startsWith("ur")) return { voice: "ur-PK-AsadNeural", lang: "ur-PK" };
  return { voice: process.env.EDGE_TTS_VOICE || "en-US-AriaNeural", lang: "en-US" };
}

export const edgeTts: TtsProvider = {
  name: "edge",
  async synthesize({ text, language }: SynthesizeOptions): Promise<TtsResult> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-edge-"));
    const out = path.join(dir, "audio.mp3");
    try {
      const { voice, lang } = voiceFor(language);
      const tts = new EdgeTTS({
        voice,
        lang,
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      });
      await tts.ttsPromise(text, out);
      const data = await fs.readFile(out);
      return { data, mime: "audio/mpeg" };
    } catch (err) {
      throw new TtsError(`Edge TTS failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
