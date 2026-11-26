import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { describeNotebookLMError } from "./client";

/** Returns the signed-in user id, or a ready-to-return 401 response. */
export async function requireUser(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { userId: session.user.id };
}

export function notebookError(err: unknown): NextResponse {
  if (err instanceof TypeError && "status" in err && err.status === 404) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { message, status } = describeNotebookLMError(err);
  if (status >= 500) console.error("[notebooklm]", err);
  return NextResponse.json({ error: message }, { status });
}
