import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { documentService } from "@/modules/documents/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const documents = await documentService.getUserDocuments(userId);
  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const document = await documentService.uploadDocument(userId, file);
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    console.error("Document upload failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to upload document",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Document id is required" },
        { status: 400 }
      );
    }

    await documentService.deleteDocument(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document deletion failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete document",
      },
      { status: 400 }
    );
  }
}
