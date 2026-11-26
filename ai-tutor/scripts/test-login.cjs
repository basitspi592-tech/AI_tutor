const BASE = "http://localhost:3000";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];

let cookies = {};

function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
}

function cookieHeader() {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function step(label, fn) {
  const res = await fn();
  saveCookies(res);
  console.log(`  ${label}: HTTP ${res.status}`);
  return res;
}

async function main() {
  console.log(`Logging in as ${EMAIL}\n`);

  const csrfRes = await step("GET csrf", () => fetch(`${BASE}/api/auth/csrf`));
  const { csrfToken } = await csrfRes.json();

  const form = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: `${BASE}/en/tutor`,
    json: "true",
  });

  const callbackRes = await step("POST credentials", () =>
    fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
      body: form.toString(),
      redirect: "manual",
    }),
  );

  const callbackBody = await callbackRes.text();
  if (callbackRes.status >= 400) {
    console.log(`  FAILED: ${callbackBody.slice(0, 200)}`);
    return;
  }

  const sessionRes = await step("GET session", () =>
    fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } }),
  );
  const session = await sessionRes.json();

  if (session?.user?.id) {
    console.log(`\n  SUCCESS - signed in as ${session.user.email} (id ${session.user.id})`);
  } else {
    console.log(`\n  FAILED - no session returned: ${JSON.stringify(session).slice(0, 200)}`);
  }
}

main();
