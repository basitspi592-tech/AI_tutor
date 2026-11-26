import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_DIR = join(homedir(), ".notebooklm");
const SESSION_FILE = join(SESSION_DIR, "session.json");

const APP_URL = "https://notebook.google.com/";
const LEGACY_HOSTS = new Set(["notebook.google.com", "notebooklm.google.com"]);

if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hostOf(page) {
  try {
    return new URL(page.url()).hostname;
  } catch {
    return "";
  }
}

console.log("A browser window will open. Please log in to your Google account.");
console.log("Waiting for sign-in...");

const browser = await chromium.launch({
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
});

try {
  const context = await browser.newContext();
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

  // Wait until Google auth cookies (SID) exist AND we are back on the app host.
  for (;;) {
    let cookies = [];
    try {
      cookies = await context.cookies();
    } catch {
      console.error("Browser closed before login completed.");
      process.exit(1);
    }
    const hasSid = cookies.some((c) => c.name === "SID" && c.value);
    const onApp = LEGACY_HOSTS.has(hostOf(page));
    if (hasSid && onApp) break;
    await sleep(1500);
  }

  await page.goto(APP_URL, { waitUntil: "load" }).catch(() => {});

  const storageState = await context.storageState();
  writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));

  console.log("\nLogin successful!");
  console.log(`Session saved to: ${SESSION_FILE}`);
  console.log(`Cookies captured: ${storageState.cookies.length}`);
} catch (err) {
  console.error("Login failed:", err instanceof Error ? err.message : err);
} finally {
  await browser.close();
}
