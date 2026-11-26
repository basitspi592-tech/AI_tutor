import "server-only";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { TtsError, type SynthesizeOptions, type TtsProvider, type TtsResult } from "../types";

const run = promisify(execFile);

/** Zero-install offline narration on Windows using the built-in System.Speech
 *  voices. Only attempted on win32; elsewhere the provider is skipped. */
export const sapiTts: TtsProvider = {
  name: "sapi",
  async synthesize({ text }: SynthesizeOptions): Promise<TtsResult> {
    if (process.platform !== "win32") {
      throw new TtsError("Windows SAPI is only available on Windows");
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-sapi-"));
    const txt = path.join(dir, "in.txt");
    const out = path.join(dir, "out.wav");

    try {
      await fs.writeFile(txt, text, "utf-8");
      const quote = (p: string) => p.replace(/'/g, "''");
      const script = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        `$s.SetOutputToWaveFile('${quote(out)}')`,
        `$s.Speak([System.IO.File]::ReadAllText('${quote(txt)}'))`,
        "$s.Dispose()",
      ].join("; ");

      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        timeout: 120000,
      });

      const data = await fs.readFile(out);
      return { data, mime: "audio/wav" };
    } catch (err) {
      throw new TtsError(`Windows SAPI failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
