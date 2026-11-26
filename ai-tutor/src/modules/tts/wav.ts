import "server-only";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

/** Re-encodes any audio buffer to canonical 24 kHz mono PCM WAV, which is what
 *  the video renderer expects (see wavDurationSeconds).
 *
 *  The output goes to a seekable temp file rather than stdout: when ffmpeg
 *  writes a WAV to a pipe it cannot seek back to patch the RIFF/data sizes and
 *  emits 0xFFFFFFFF placeholders, which corrupts the duration math. */
export async function toWav(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary is unavailable");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-wav-"));
  const out = path.join(dir, "out.wav");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath!, [
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-ar", "24000",
        "-ac", "1",
        out,
      ]);

      const err: Buffer[] = [];
      child.stderr.on("data", (d: Buffer) => err.push(d));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input);
    });

    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
