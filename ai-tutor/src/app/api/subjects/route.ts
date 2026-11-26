import { NextResponse } from "next/server";
import { curriculumService } from "@/modules/curriculum/service";

export async function GET() {
  const subjects = await curriculumService.getSubjects();
  return NextResponse.json({ subjects });
}
