export interface SynthesizeOptions {
  text: string;
  /** BCP-47-ish language code, e.g. "en", "ar", "fr", "ur". */
  language?: string;
  /** Optional provider-specific voice id. */
  voice?: string;
}

export interface TtsResult {
  data: Buffer;
  /** MIME of the raw audio; anything other than audio/wav is converted. */
  mime: string;
}

export interface TtsProvider {
  name: string;
  synthesize(opts: SynthesizeOptions): Promise<TtsResult>;
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsError";
  }
}
