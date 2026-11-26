import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const state = JSON.parse(readFileSync(join(homedir(), ".notebooklm", "session.json"), "utf-8"));
const ck = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

async function probe(label, url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 45000);
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: ck,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: ac.signal,
    });
    const html = await res.text();
    console.log(`[${label}] status=${res.status} final=${res.url}`);
    console.log(`[${label}] SNlM0e=${html.includes("SNlM0e")} FdrFJe=${html.includes("FdrFJe")} len=${html.length}`);
  } catch (e) {
    console.log(`[${label}] ERROR ${e.message}`);
  } finally {
    clearTimeout(t);
  }
}

await probe("new", "https://notebook.google.com/");
await probe("old", "https://notebooklm.google.com/");
