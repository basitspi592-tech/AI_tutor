import "server-only";
import path from "path" /*turbopackIgnore: true*/;
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/modules/ai-providers";
import { ragService } from "@/modules/rag/service";
import { wavDurationSeconds } from "@/modules/video/audio";
import { synthesizeNarrationWav } from "@/modules/tts";

const run = promisify(execFile);

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const VIDEO_DIR = path.join(UPLOAD_DIR, "videos");

const FONT_FILE = process.env.VIDEO_FONT || "C:/Windows/Fonts/segoeui.ttf";

const WIDTH = 1280;
const HEIGHT = 720;
const BACKGROUND = "0x0f172a";

const MAX_SECTIONS = 6;
const MAX_POINTS = 4;
const MAX_POINT_CHARS = 46;
const MAX_HEADING_CHARS = 40;
const MIN_SIMILARITY = 0.2;

export interface VideoSection {
  heading: string;
  narration: string;
  points: string[];
}

export interface VideoSource {
  ref: number;
  title: string;
  chunkIndex: number;
  similarity: number;
}

export class VideoGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "VideoGenerationError";
    this.status = status;
  }
}

const SCRIPT_PROMPT = `You are a tutor who writes the narration for a short educational explainer video.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{"summary": "two or three sentence overview", "sections": [{"heading": "short title", "narration": "spoken prose", "points": ["short point"]}]}

Rules for "narration":
- Write for the ear: plain spoken sentences only.
- No markdown, bullet characters, emoji, asterisks or inline headings.
- Never write formulas, code or symbols that cannot be spoken aloud. Say "x squared" rather than "x^2".
- Expand any abbreviation the first time it is used.
- 50 to 110 words per section.

Rules for "heading": at most 4 words.
Rules for "points": 3 or 4 items, each under 40 characters, no trailing punctuation.

Produce between 4 and ${MAX_SECTIONS} sections that build the topic up from first principles.`;
/** drawtext cannot wrap, so long text is hard-split into separate lines. */
function toLines(text: string, max: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && current.length + 1 + word.length > max) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines.slice(0, maxLines).map((line) =>
    line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
  );
}

function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function parseScript(raw: string): { summary: string; sections: VideoSection[] } {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  let parsed: { summary?: string; sections?: VideoSection[] };
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      parsed = {};
    }
  } else {
    parsed = {};
  }

  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .filter((s): s is VideoSection => !!s && typeof s.narration === "string" && s.narration.trim().length > 0)
    .slice(0, MAX_SECTIONS)
    .map((s) => ({
      heading: clamp(String(s.heading ?? "Section"), MAX_HEADING_CHARS),
      narration: s.narration.trim(),
      points: (Array.isArray(s.points) ? s.points : [])
        .slice(0, MAX_POINTS)
        .map((p) => clamp(String(p), MAX_POINT_CHARS))
        .filter((p) => p.length > 0),
    }));

  if (sections.length === 0) {
    throw new VideoGenerationError("The model did not return a usable script");
  }

  return { summary: String(parsed.summary ?? "").trim(), sections };
}

function toPlainScript(sections: VideoSection[]): string {
  return sections.map((s, i) => `## ${i + 1}. ${s.heading}\n\n${s.narration}`).join("\n\n");
}

/** ffmpeg only accepts a path option value that is single-quoted *and* has its
 *  colons backslash-escaped; either alone makes drawtext report that both
 *  text and textfile were supplied. */
function escapeFilterPath(p: string): string {
  return `'${p.replace(/\\/g, "/").replace(/'/g, "'\\''").replace(/:/g, "\\:")}'`;
}

/** The concat demuxer resolves `file` entries relative to the list file, so a
 *  relative path gets double-prefixed. Basenames are unambiguous here because
 *  the list lives in the same directory. */
function concatList(dir: string, files: string[], name: string): Promise<void> {
  return fs.writeFile(
    path.join(dir, name),
    files.map((f) => `file '${path.basename(f)}'`).join("\n"),
    "utf-8"
  );
}

/** ffmpeg's banner buries the real error, so keep only the diagnostic lines. */
function ffmpegMessage(err: unknown): string {
  const stderr = (err as { stderr?: string })?.stderr ?? "";
  const meaningful = stderr
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.trim() &&
        !/^ffmpeg version|^built with|^configuration:|^lib[a-z]+\s|^Copyright/.test(l)
    );
  const diagnostics = meaningful.filter((l) =>
    /error|invalid|impossible|unable|failed|cannot|no such/i.test(l)
  );
  return (diagnostics.length ? diagnostics : meaningful).slice(-2).join(" ").slice(0, 400);
}

export class VideoService {
  async list(userId: string) {
    return prisma.topicVideo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async get(userId: string, id: string) {
    return prisma.topicVideo.findFirst({ where: { id, userId } });
  }

  async create(userId: string, topic: string) {
    const record = await prisma.topicVideo.create({ data: { userId, topic } });

    this.generate(userId, record.id, topic).catch((err) => {
      console.error("Video generation crashed:", err);
    });

    return record;
  }

  async generate(userId: string, videoId: string, topic: string): Promise<void> {
    await prisma.topicVideo.update({
      where: { id: videoId },
      data: { status: "PROCESSING" },
    });

    try {
      const { summary, sections, sources } = await this.writeScript(userId, topic);

      // Persist the script before rendering so the user still gets the readable
      // script and summary even if FFmpeg fails.
      await prisma.topicVideo.update({
        where: { id: videoId },
        data: {
          summary,
          script: toPlainScript(sections),
          sections: sections as unknown as object,
          sources: sources as unknown as object,
        },
      });

      const outDir = path.join(VIDEO_DIR, userId);
      await fs.mkdir(outDir, { recursive: true });

      const { durationSeconds } = await this.render(videoId, outDir, topic, sections);

      await prisma.topicVideo.update({
        where: { id: videoId },
        data: {
          status: "READY",
          videoPath: path.join(outDir, `${videoId}.mp4`),
          audioPath: path.join(outDir, `${videoId}.wav`),
          durationSeconds,
        },
      });
    } catch (err) {
      const message = err instanceof Error && "stderr" in err ? ffmpegMessage(err) : String(err);
      console.error("Video generation failed:", err);
      await prisma.topicVideo.update({
        where: { id: videoId },
        data: { status: "ERROR", errorMessage: message.slice(0, 500) },
      });
    }
  }

  /** Self-hosted Notebooks reuse the exact TTS pipeline for narration. */
  async synthesizeNarration(text: string): Promise<Buffer> {
    return this.synthesize(text);
  }

  /** Renders an mp4 slideshow from pre-generated sections (used by Notebooks). */
  async renderSections(
    outDir: string,
    videoId: string,
    topic: string,
    sections: VideoSection[]
  ): Promise<{ durationSeconds: number }> {
    await fs.mkdir(outDir, { recursive: true });
    return this.render(videoId, outDir, topic, sections);
  }

  /** Goes through the shared provider so its multi-model quota fallback applies. */
  private async writeScript(userId: string, topic: string) {
    let context = "";
    const sources: VideoSource[] = [];

    try {
      const chunks = await ragService.retrieveRelevantChunks(userId, topic, 6);
      const usable = chunks.filter((c) => Number(c.similarity) >= MIN_SIMILARITY);
      usable.forEach((c, i) => {
        sources.push({
          ref: i + 1,
          title: c.originalName,
          chunkIndex: c.chunkIndex,
          similarity: Number(Number(c.similarity).toFixed(3)),
        });
      });
      context = usable
        .map((c, i) => `[S${i + 1}] ${c.originalName}\n${c.content}`)
        .join("\n\n");
    } catch (err) {
      console.error("Video RAG retrieval failed:", err);
    }

    const grounded = context.trim().length > 0;

    const raw = await getAIProvider().chat({
      messages: [
        { role: "system", content: SCRIPT_PROMPT },
        {
          role: "user",
          content: grounded
            ? `Topic: ${topic}\n\nGround the explanation in these sources. Do not say "according to the source" - just teach it.\n\n${context}`
            : `Topic: ${topic}\n\nYou have no uploaded documents on this topic, so teach it from general knowledge.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 3000,
    });

    return { ...parseScript(raw), sources };
  }

  /** Narration via the shared TTS fallback chain (Gemini -> Edge -> Kokoro ->
   *  Google Translate -> Windows SAPI), so one exhausted provider never fails
   *  the whole render. Always returns canonical PCM WAV. */
  private async synthesize(text: string): Promise<Buffer> {
    try {
      return await synthesizeNarrationWav({ text });
    } catch (err) {
      throw new VideoGenerationError(err instanceof Error ? err.message : String(err));
    }
  }

  private async render(videoId: string, outDir: string, topic: string, sections: VideoSection[]) {
    const segDir = path.join(outDir, `${videoId}-segments`);
    await fs.mkdir(segDir, { recursive: true });

    const segments: string[] = [];
    let total = 0;

    try {
      for (const [index, section] of sections.entries()) {
        const wavPath = path.join(segDir, `seg-${index}.wav`);
        const mp4Path = path.join(segDir, `seg-${index}.mp4`);

        const audioBuffer = await this.synthesize(section.narration);
        const duration = wavDurationSeconds(audioBuffer);
        await fs.writeFile(wavPath, audioBuffer);

        await this.buildSegment({
          mp4Path,
          wavPath,
          duration,
          segDir,
          index,
          topic,
          section,
        });

        segments.push(mp4Path);
        total += duration;
      }

      await concatList(segDir, segments, "video-concat.txt");

      const finalPath = path.join(outDir, `${videoId}.mp4`);
      await run(ffmpegPath!, [
        "-y",
        "-f", "concat",
        "-safe", "0",
"-i", path.join(segDir, "video-concat.txt"),
        // Re-encoded rather than stream-copied: per-segment durations differ and
        // a copy would let timestamps drift between sections.
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        "-movflags", "+faststart",
        finalPath,
      ]);

      await this.concatAudio(segments, segDir, path.join(outDir, `${videoId}.wav`));

      return { durationSeconds: Number(total.toFixed(2)) };
    } finally {
      await fs.rm(segDir, { recursive: true, force: true });
    }
  }

  /** One drawtext filter per line, chained by label. Text arrives through
   *  textfile= so colons, quotes and % in headings cannot break the filter. */
  private async buildSegment(opts: {
    mp4Path: string;
    wavPath: string;
    duration: number;
    segDir: string;
    index: number;
    topic: string;
    section: VideoSection;
  }) {
    const { mp4Path, wavPath, duration, segDir, index, topic, section } = opts;
    const font = escapeFilterPath(FONT_FILE);

    const lines: { name: string; text: string; y: number; size: number; color: string }[] = [];

    if (index === 0) {
      const [firstTopicLine] = toLines(topic, 54, 1);
      if (firstTopicLine) {
        lines.push({ name: "topic", text: firstTopicLine, y: 84, size: 32, color: "0x818cf8" });
      }
    }

    const headingTop = index === 0 ? 180 : 150;
    toLines(section.heading, MAX_HEADING_CHARS, 2).forEach((text, i) => {
      lines.push({ name: `h${i}`, text, y: headingTop + i * 54, size: 48, color: "0xf1f5f9" });
    });

    const points = section.points
      .flatMap((p) => toLines(p, MAX_POINT_CHARS, 1))
      .slice(0, MAX_POINTS);
    points.forEach((text, i) => {
      lines.push({ name: `p${i}`, text: `•  ${text}`, y: 340 + i * 62, size: 28, color: "0xa5b4fc" });
    });

    const parts: string[] = [];
    let label = "0:v";

    for (const [i, line] of lines.entries()) {
      const textPath = path.join(segDir, `t-${index}-${line.name}.txt`);
      await fs.writeFile(textPath, line.text, "utf-8");
      const next = `v${i}`;
      parts.push(
        `[${label}]drawtext=fontfile=${font}:textfile=${escapeFilterPath(textPath)}:` +
          `x=(w-tw)/2:y=${line.y}:fontsize=${line.size}:fontcolor=${line.color}[${next}]`
      );
      label = next;
    }

    parts.push(`[${label}]null[outv]`);

    await run(ffmpegPath!, [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=${BACKGROUND}:s=${WIDTH}x${HEIGHT}:d=${(duration + 0.25).toFixed(3)}`,
      "-i", wavPath,
      "-filter_complex", parts.join(";"),
      "-map", "[outv]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-ac", "2",
      "-shortest",
      mp4Path,
    ]);
  }

  private async concatAudio(segments: string[], segDir: string, outPath: string) {
    const wavs = segments.map((mp4) => mp4.replace(/\.mp4$/, ".wav"));
    await concatList(segDir, wavs, "audio-concat.txt");

    await run(ffmpegPath!, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", path.join(segDir, "audio-concat.txt"),
      "-c:a", "pcm_s16le",
      outPath,
    ]);
  }
}

export const videoService = new VideoService();