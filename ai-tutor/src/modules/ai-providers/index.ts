import type { AIProvider } from "./types";
import { GeminiProvider } from "./gemini";

export type { AIProvider, AIMessage } from "./types";

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (providerInstance) return providerInstance;

  const providerName = process.env.AI_PROVIDER || "gemini";

  switch (providerName) {
    case "gemini":
    default:
      providerInstance = new GeminiProvider();
      break;
  }

  return providerInstance;
}
