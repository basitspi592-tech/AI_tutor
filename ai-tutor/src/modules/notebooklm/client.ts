import "server-only";

/** Artifact kinds the self-hosted generator can produce. */
export const ARTIFACT_KINDS = [
  "report",
  "quiz",
  "flashcards",
  "mind_map",
  "audio",
  "video",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export class NotebookLMRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "NotebookLMRequestError";
    this.status = status;
  }
}

/** Generation now runs entirely inside this app (LLM + TTS + ffmpeg), so the
 *  old "connect a Google account" gate is always open. Kept for API
 *  compatibility with the notebooks UI. */
export function isNotebookLMConfigured(): boolean {
  return true;
}

/** Maps thrown errors onto messages that are safe and useful to show a user. */
export function describeNotebookLMError(err: unknown): {
  message: string;
  status: number;
} {
  if (err instanceof NotebookLMRequestError) {
    return { message: err.message, status: err.status };
  }
  if (err instanceof Error) {
    return { message: err.message, status: 500 };
  }
  return { message: "Generation failed", status: 500 };
}
