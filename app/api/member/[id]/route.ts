import { NextResponse } from "next/server";
import { getMember } from "@/lib/committee";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const member = getMember(id);
  if (!member) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(member);
}
