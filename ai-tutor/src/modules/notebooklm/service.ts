import "server-only";
import path from "path" /*turbopackIgnore: true*/;
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/modules/ai-providers";
import { videoService, type VideoSection } from "@/modules/video/service";
import {
  ARTIFACT_KINDS,
  isNotebookLMConfigured,
  describeNotebookLMError,
  NotebookLMRequestError,
  type ArtifactKind,
} from "./client";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const ARTIFACT_DIR = path.join(UPLOAD_DIR, "notebooks");

/** Keep prompts inside a sane token budget regardless of source size. */
const MAX_CONTEXT_CHARS = 14000;
const MAX_URL_CHARS = 20000;

export interface GenerateArtifactInput {
  kind: ArtifactKind;
  language?: string;
  instructions?: string;
  reportFormat?: "study_guide" | "briefing_doc" | "blog_post" | "custom";
  quantity?: "fewer" | "standard" | "more";
  difficulty?: "easy" | "medium" | "hard";
  audioFormat?: "deep_dive" | "brief" | "critique" | "debate";
  audioLength?: "short" | "default" | "long";
  videoFormat?: "explainer" | "brief" | "cinematic";
}

function isArtifactKind(v: unknown): v is ArtifactKind {
  return typeof v === "string" && (ARTIFACT_KINDS as readonly string[]).includes(v);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Models sometimes wrap JSON in prose or fences; pull out the object. */
function parseJson<T = unknown>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new NotebookLMRequestError("The model did not return usable JSON", 502);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new NotebookLMRequestError("The model returned malformed JSON", 502);
  }
}

/** Crude but dependency-free readability pass for URL sources. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_URL_CHARS);
}

async function fetchUrlText(url: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AITutor/1.0)" },
    });
    if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status})`);
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    return type.includes("html") ? htmlToText(body) : body.slice(0, MAX_URL_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Interactive HTML (served into the sandboxed iframe)                 */
/* ------------------------------------------------------------------ */

interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

function buildQuizHtml(data: { title?: string; questions?: QuizQuestion[] }): string {
  const payload = JSON.stringify({
    title: data.title ?? "Quiz",
    questions: Array.isArray(data.questions) ? data.questions : [],
  }).replace(/<\//g, "<\\/");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;padding:20px}
  .wrap{max-width:640px;margin:0 auto}
  h1{font-size:18px;margin:0 0 4px}
  .meta{font-size:12px;color:#64748b;margin-bottom:16px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .q{font-size:16px;font-weight:600;margin-bottom:14px}
  .opt{display:block;width:100%;text-align:left;padding:12px 14px;margin:8px 0;border:1px solid #e2e8f0;border-radius:12px;background:#fff;font-size:14px;cursor:pointer;transition:.15s}
  .opt:hover{border-color:#93c5fd;background:#f0f7ff}
  .opt.correct{border-color:#34d399;background:#ecfdf5;font-weight:600}
  .opt.wrong{border-color:#fb7185;background:#fff1f2}
  .opt:disabled{cursor:default}
  .exp{margin-top:12px;font-size:13px;color:#475569;background:#f1f5f9;border-radius:10px;padding:10px 12px}
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px}
  button.nav{padding:10px 18px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;font-size:14px}
  button.nav:disabled{opacity:.45;cursor:default}
  .bar{height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-bottom:16px}
  .bar>i{display:block;height:100%;background:#2563eb;width:0}
  .score{font-size:15px;font-weight:700}
</style></head><body><div class="wrap">
<div id="app"></div>
<script>
const DATA=${payload};
const el=document.getElementById('app');
let i=0,answered=false,score=0,chosen=-1;
function render(){
  const q=DATA.questions[i];
  if(!q){el.innerHTML='<div class="card"><p>No questions.</p></div>';return;}
  const pct=Math.round((i/DATA.questions.length)*100);
  el.innerHTML='<h1>'+esc(DATA.title)+'</h1>'+
    '<div class="meta">Question '+(i+1)+' of '+DATA.questions.length+' &middot; Score '+score+'</div>'+
    '<div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="card"><div class="q">'+esc(q.question)+'</div>'+
    '<div id="opts"></div><div id="exp"></div>'+
    '<div class="row"><span class="score" id="sc"></span>'+
    '<button class="nav" id="next" '+(answered?'':'disabled')+'>'+(i+1<DATA.questions.length?'Next':'Finish')+'</button></div></div>';
  const opts=document.getElementById('opts');
  q.options.forEach((text,k)=>{
    const b=document.createElement('button');
    b.className='opt';b.textContent=text;
    b.onclick=()=>choose(k);opts.appendChild(b);
  });
  if(answered)reveal();
  document.getElementById('next').onclick=advance;
}
function choose(k){
  if(answered)return;answered=true;chosen=k;
  const correct=DATA.questions[i].answerIndex;
  if(k===correct)score++;
  document.querySelectorAll('.opt').forEach((b,idx)=>{b.disabled=true;if(idx===correct)b.classList.add('correct');else if(idx===k)b.classList.add('wrong');});
  reveal();
  document.getElementById('next').disabled=false;
}
function reveal(){
  const q=DATA.questions[i];
  document.getElementById('sc').textContent='Score: '+score+'/'+DATA.questions.length;
  const e=document.getElementById('exp');
  if(q.explanation)e.innerHTML='<div class="exp">'+esc(q.explanation)+'</div>';
}
function advance(){
  if(i+1<DATA.questions.length){i++;answered=false;chosen=-1;render();}
  else{el.innerHTML='<div class="card" style="text-align:center"><h1>Done!</h1><p class="meta">You scored '+score+' of '+DATA.questions.length+'</p><button class="nav" onclick="location.reload()">Try again</button></div>';}
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
render();
</script></div></body></html>`;
}

function buildFlashcardsHtml(data: {
  title?: string;
  cards?: { front: string; back: string }[];
}): string {
  const payload = JSON.stringify({
    title: data.title ?? "Flashcards",
    cards: Array.isArray(data.cards) ? data.cards : [],
  }).replace(/<\//g, "<\\/");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;padding:20px}
  .wrap{max-width:640px;margin:0 auto}
  h1{font-size:18px;margin:0 0 4px}
  .meta{font-size:12px;color:#64748b;margin-bottom:16px}
  .card{position:relative;min-height:240px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.06);transition:.2s}
  .face{font-size:19px;line-height:1.5;max-width:90%}
  .face.back{color:#3730a3;font-weight:600}
  .hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px}
  button.nav{padding:10px 18px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;font-weight:600;cursor:pointer;font-size:14px;color:#334155}
  button.nav.primary{background:#2563eb;border-color:#2563eb;color:#fff}
  button.nav:disabled{opacity:.45;cursor:default}
</style></head><body><div class="wrap">
<div id="app"></div>
<script>
const DATA=${payload};
const el=document.getElementById('app');
let i=0,flipped=false;
function render(){
  const c=DATA.cards[i];
  if(!c){el.innerHTML='<div class="card"><span class="face">No cards.</span></div>';return;}
  el.innerHTML='<h1>'+esc(DATA.title)+'</h1><div class="meta">Card '+(i+1)+' of '+DATA.cards.length+'</div>'+
    '<div class="card" id="card"><span class="face'+(flipped?' back':'')+'">'+esc(flipped?c.back:c.front)+'</span>'+
    '<span class="hint">'+(flipped?'Answer':'Prompt')+' &middot; tap to flip</span></div>'+
    '<div class="row"><button class="nav" id="prev">Previous</button><button class="nav primary" id="next">Next</button></div>';
  document.getElementById('card').onclick=()=>{flipped=!flipped;render();};
  document.getElementById('prev').onclick=()=>{if(i>0){i--;flipped=false;render();}};
  document.getElementById('next').onclick=()=>{if(i+1<DATA.cards.length){i++;flipped=false;render();}};
  document.getElementById('prev').disabled=i===0;
  document.getElementById('next').disabled=i+1>=DATA.cards.length;
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
render();
</script></div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

function contextBlock(focus: string, sources: string): string {
  const parts: string[] = [];
  if (focus) parts.push(`Focus / instructions: ${focus}`);
  parts.push(
    sources.trim()
      ? `Reference material:\n${sources}`
      : "There is no uploaded reference material, so teach from general knowledge."
  );
  return parts.join("\n\n");
}

export const notebooklmService = {
  isConfigured: isNotebookLMConfigured,

  async list(userId: string) {
    return prisma.notebook.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { sources: true, artifacts: true } } },
    });
  },

  async create(userId: string, title: string) {
    const clean = title.trim();
    if (!clean) throw new NotebookLMRequestError("A title is required");
    if (clean.length > 200) {
      throw new NotebookLMRequestError("Title must be 200 characters or fewer");
    }
    return prisma.notebook.create({
      data: { userId, lmId: randomUUID(), title: clean },
    });
  },

  async addSource(
    userId: string,
    localNotebookId: string,
    input: { url?: string; text?: string; title?: string; file?: File }
  ) {
    const notebook = await this._owned(userId, localNotebookId);

    let kind = "text";
    let title = input.title?.trim() || null;
    let url: string | null = null;
    let content: string | null = null;
    let status = "ready";
    let error: string | null = null;

    if (input.file) {
      kind = "file";
      title = title || input.file.name;
      const buffer = Buffer.from(await input.file.arrayBuffer());
      try {
        content =
          input.file.type.includes("pdf") || input.file.name.toLowerCase().endsWith(".pdf")
            ? await getAIProvider().extractFromPdf(buffer)
            : buffer.toString("utf-8").slice(0, MAX_URL_CHARS);
      } catch (err) {
        status = "error";
        error = messageOf(err).slice(0, 300);
      }
    } else if (input.url?.trim()) {
      kind = "url";
      url = input.url.trim();
      title = title || url;
      try {
        content = await fetchUrlText(url);
        if (!content) throw new Error("That page had no readable text");
      } catch (err) {
        status = "error";
        error = messageOf(err).slice(0, 300);
      }
    } else if (input.text?.trim()) {
      content = input.text.trim();
      title = title || "Pasted text";
    } else {
      throw new NotebookLMRequestError(
        "Provide a URL, a file, or some text to add as a source"
      );
    }

    return prisma.notebookSource.create({
      data: {
        notebookId: notebook.id,
        lmId: randomUUID(),
        title,
        kind,
        url,
        content,
        status,
        error,
      },
    });
  },

  async listSources(userId: string, localNotebookId: string) {
    const notebook = await this._owned(userId, localNotebookId);
    return prisma.notebookSource.findMany({
      where: { notebookId: notebook.id },
      orderBy: { createdAt: "desc" },
    });
  },

  async listArtifacts(userId: string, localNotebookId: string) {
    const notebook = await this._owned(userId, localNotebookId);
    return prisma.notebookArtifact.findMany({
      where: { notebookId: notebook.id },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Records a pending row and generates in the background; the UI polls
   *  refreshArtifact() until the status flips to completed or failed. */
  async generateArtifact(
    userId: string,
    localNotebookId: string,
    input: GenerateArtifactInput
  ) {
    if (!isArtifactKind(input.kind)) {
      throw new NotebookLMRequestError(
        `Unsupported artifact kind. Choose one of: ${ARTIFACT_KINDS.join(", ")}`
      );
    }

    const notebook = await this._owned(userId, localNotebookId);
    const artifact = await prisma.notebookArtifact.create({
      data: {
        notebookId: notebook.id,
        lmId: randomUUID(),
        kind: input.kind,
        status: "pending",
      },
    });

    this.runGeneration(userId, notebook.id, artifact.id, input).catch((err) => {
      console.error("[notebooks] generation crashed:", err);
    });

    return artifact;
  },

  async runGeneration(
    userId: string,
    notebookId: string,
    artifactId: string,
    input: GenerateArtifactInput
  ): Promise<void> {
    try {
      const sources = await this._sourceContext(notebookId);
      const focus = input.instructions?.trim() ?? "";
      const prompt = contextBlock(focus, sources);
      const provider = getAIProvider();
      const lang = input.language ? ` Respond in ${input.language}.` : "";

      if (input.kind === "report") {
        const format = input.reportFormat ?? "study_guide";
        const style =
          format === "briefing_doc"
            ? "a concise briefing document for decision-makers"
            : format === "blog_post"
              ? "an engaging blog post"
              : "a thorough study guide";
        const content = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You write ${style} in clean Markdown (headings, lists, bold).${lang} Ground everything in the reference material and be accurate.`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          maxTokens: 3000,
        });
        await this._complete(artifactId, { content: content.trim(), title: focus || "Report" });
        return;
      }

      if (input.kind === "mind_map") {
        const raw = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You build mind maps as nested Markdown bullet lists using "- " prefixes with 2-space indentation per level.${lang} Start with a single central topic, then 4-7 main branches, each with 2-4 child ideas. Return ONLY the list.`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.5,
          maxTokens: 1500,
        });
        await this._complete(artifactId, { content: raw.trim(), title: focus || "Mind map" });
        return;
      }

      if (input.kind === "quiz") {
        const count = input.quantity === "fewer" ? 4 : input.quantity === "more" ? 10 : 7;
        const raw = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You write multiple-choice quizzes. Return ONLY JSON: {"title":string,"questions":[{"question":string,"options":[string,string,string,string],"answerIndex":number,"explanation":string}]}. Exactly 4 options each, answerIndex 0-3.${lang}`,
            },
            {
              role: "user",
              content: `${prompt}\n\nWrite ${count} ${input.difficulty ?? "medium"}-difficulty questions.`,
            },
          ],
          temperature: 0.5,
          maxTokens: 3000,
        });
        const parsed = parseJson<{ title?: string; questions?: unknown[] }>(raw);
        await this._complete(artifactId, {
          content: JSON.stringify(parsed),
          title: parsed.title || focus || "Quiz",
        });
        return;
      }

      if (input.kind === "flashcards") {
        const raw = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You write study flashcards. Return ONLY JSON: {"title":string,"cards":[{"front":string,"back":string}]}.${lang}`,
            },
            { role: "user", content: `${prompt}\n\nWrite 10 ${input.difficulty ?? "medium"}-difficulty cards.` },
          ],
          temperature: 0.5,
          maxTokens: 2500,
        });
        const parsed = parseJson<{ title?: string; cards?: unknown[] }>(raw);
        await this._complete(artifactId, {
          content: JSON.stringify(parsed),
          title: parsed.title || focus || "Flashcards",
        });
        return;
      }

      if (input.kind === "audio") {
        const words = input.audioLength === "short" ? 180 : input.audioLength === "long" ? 650 : 350;
        const script = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You write spoken narration for a podcast-style explainer. Plain prose only, no markdown, no headings, no bullet characters, no emoji.${lang}`,
            },
            { role: "user", content: `${prompt}\n\nWrite about ${words} words of narration.` },
          ],
          temperature: 0.5,
          maxTokens: 2000,
        });
        const text = script.trim();
        const wav = await videoService.synthesizeNarration(text);
        await fs.mkdir(ARTIFACT_DIR, { recursive: true });
        await fs.writeFile(path.join(ARTIFACT_DIR, `${artifactId}.wav`), wav);
        await this._complete(artifactId, { content: text, title: focus || "Audio overview" });
        return;
      }

      if (input.kind === "video") {
        const raw = await provider.chat({
          messages: [
            {
              role: "system",
              content: `You write the narration for a short educational video. Return ONLY JSON: {"summary":string,"sections":[{"heading":string,"narration":string,"points":[string]}]}. "narration" is spoken prose (no markdown/emoji, say "x squared" not "x^2"), 50-110 words. "heading" max 4 words. "points" 3-4 short items. Produce 4-6 sections.${lang}`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          maxTokens: 3000,
        });
        const parsed = parseJson<{ summary?: string; sections?: VideoSection[] }>(raw);
        const sections = (Array.isArray(parsed.sections) ? parsed.sections : []).filter(
          (s) => s && typeof s.narration === "string" && s.narration.trim()
        );
        if (sections.length === 0) {
          throw new NotebookLMRequestError("The model did not return a usable script", 502);
        }
        const topic = focus || parsed.summary?.slice(0, 60) || "Overview";
        await videoService.renderSections(ARTIFACT_DIR, artifactId, topic, sections);
        const script = sections.map((s, i) => `${i + 1}. ${s.heading}\n${s.narration}`).join("\n\n");
        await this._complete(artifactId, { content: script, title: topic });
        return;
      }

      throw new NotebookLMRequestError(`Cannot generate "${input.kind}" here`);
    } catch (err) {
      await prisma.notebookArtifact
        .update({
          where: { id: artifactId },
          data: { status: "failed", error: messageOf(err).slice(0, 500) },
        })
        .catch(() => undefined);
    }
  },

  async refreshArtifact(userId: string, localArtifactId: string) {
    const artifact = await prisma.notebookArtifact.findFirst({
      where: { id: localArtifactId, notebook: { userId } },
    });
    if (!artifact) throw new NotebookLMRequestError("Artifact not found", 404);
    return artifact;
  },

  /** Raw HTML for quiz/flashcard artifacts, served into a sandboxed iframe. */
  async getInteractiveHtml(userId: string, localArtifactId: string): Promise<string> {
    const artifact = await this._ownedArtifact(userId, localArtifactId);
    if (!artifact.content) {
      throw new NotebookLMRequestError("That artifact has no interactive view yet", 409);
    }
    const data = parseJson(artifact.content);
    if (artifact.kind === "quiz") return buildQuizHtml(data as { title?: string; questions?: QuizQuestion[] });
    if (artifact.kind === "flashcards") return buildFlashcardsHtml(data as { title?: string; cards?: { front: string; back: string }[] });
    throw new NotebookLMRequestError("This artifact has no interactive view", 409);
  },

  /** Streams a finished video/audio artifact for inline playback. */
  async getArtifactFile(
    userId: string,
    localArtifactId: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const artifact = await this._ownedArtifact(userId, localArtifactId);
    if (artifact.kind !== "video" && artifact.kind !== "audio") {
      throw new NotebookLMRequestError("This artifact has no media file", 409);
    }
    if (artifact.status !== "completed") {
      throw new NotebookLMRequestError("That item is still generating", 409);
    }
    const contentType = artifact.kind === "video" ? "video/mp4" : "audio/wav";
    const ext = artifact.kind === "video" ? "mp4" : "wav";
    try {
      const buffer = await fs.readFile(path.join(ARTIFACT_DIR, `${artifact.id}.${ext}`));
      return { buffer, contentType };
    } catch {
      throw new NotebookLMRequestError("The generated file is missing", 404);
    }
  },

  async removeArtifact(userId: string, localArtifactId: string) {
    const artifact = await this._ownedArtifact(userId, localArtifactId);
    await prisma.notebookArtifact.delete({ where: { id: artifact.id } });
    await this._deleteFiles([artifact]);
    return { success: true };
  },

  async removeNotebook(userId: string, localNotebookId: string) {
    const notebook = await this._owned(userId, localNotebookId);
    const artifacts = await prisma.notebookArtifact.findMany({
      where: { notebookId: notebook.id },
    });
    await prisma.notebook.delete({ where: { id: notebook.id } });
    await this._deleteFiles(artifacts);
    return { success: true };
  },

  async _sourceContext(notebookId: string): Promise<string> {
    const sources = await prisma.notebookSource.findMany({
      where: { notebookId, status: "ready" },
      orderBy: { createdAt: "asc" },
    });
    const usable = sources.filter((s) => s.content?.trim());
    if (usable.length === 0) return "";
    let out = "";
    for (const s of usable) {
      const block = `### ${s.title ?? s.kind}\n${s.content!.trim()}\n\n`;
      if (out.length + block.length > MAX_CONTEXT_CHARS) {
        out += block.slice(0, MAX_CONTEXT_CHARS - out.length);
        break;
      }
      out += block;
    }
    return out;
  },

  async _complete(
    artifactId: string,
    data: { content: string; title?: string }
  ) {
    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { status: "completed", content: data.content, title: data.title ?? undefined, error: null },
    });
  },

  async _deleteFiles(artifacts: { id: string; kind: string }[]) {
    await Promise.all(
      artifacts
        .filter((a) => a.kind === "video" || a.kind === "audio")
        .map((a) =>
          fs
            .rm(path.join(ARTIFACT_DIR, `${a.id}.${a.kind === "video" ? "mp4" : "wav"}`), {
              force: true,
            })
            .catch(() => undefined)
        )
    );
  },

  async _ownedArtifact(userId: string, localArtifactId: string) {
    const artifact = await prisma.notebookArtifact.findFirst({
      where: { id: localArtifactId, notebook: { userId } },
    });
    if (!artifact) throw new NotebookLMRequestError("Artifact not found", 404);
    return artifact;
  },

  async _owned(userId: string, localNotebookId: string) {
    const notebook = await prisma.notebook.findFirst({
      where: { id: localNotebookId, userId },
    });
    if (!notebook) throw new NotebookLMRequestError("Notebook not found", 404);
    return notebook;
  },
};

export { describeNotebookLMError };
