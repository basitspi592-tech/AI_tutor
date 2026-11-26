import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const state = JSON.parse(readFileSync(join(homedir(), ".notebooklm", "session.json"), "utf-8"));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: state });
const page = await ctx.newPage();
await page.goto("https://notebook.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log("nav url:", page.url(), "| title:", await page.title());

const inPage = await page.evaluate(async () => {
  const out = {};
  try {
    const r = await fetch("https://notebook.google.com/", { credentials: "include" });
    const t = await r.text();
    out.root = { status: r.status, url: r.url, SNlM0e: t.includes("SNlM0e"), FdrFJe: t.includes("FdrFJe") };
  } catch (e) {
    out.root = { error: String(e) };
  }
  try {
    const r = await fetch("https://notebook.google.com/_/LabsTailwindUi/data/batchexecute?rpcids=x", { credentials: "include" });
    out.rpc = { status: r.status, url: r.url };
  } catch (e) {
    out.rpc = { error: String(e) };
  }
  return out;
});
console.log("in-page root fetch:", JSON.stringify(inPage.root));
console.log("in-page rpc fetch: ", JSON.stringify(inPage.rpc));
await browser.close();
