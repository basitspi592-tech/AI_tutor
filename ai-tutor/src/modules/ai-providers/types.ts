export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIProvider {
  id: string;
  name: string;
  chat(params: {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
  chatStream(params: {
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncIterable<string>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  extractFromPdf(buffer: Buffer): Promise<string>;
}
