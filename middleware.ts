import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminSession";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith("/api/memos");
  // Only gate mutating API calls. GET/HEAD (e.g. revalidation probes) pass.
  if (isApi && req.method !== "POST") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = await verifySession(cookie);
  if (ok) return NextResponse.next();

  if (isApi) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/memos/new", "/api/memos/:path*"],
};
