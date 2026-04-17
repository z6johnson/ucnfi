import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  passwordMatches,
  signSession,
} from "@/lib/adminSession";

export const runtime = "nodejs";

function safeRedirect(target: unknown): string {
  if (typeof target !== "string") return "/memos/new";
  if (!target.startsWith("/") || target.startsWith("//")) return "/memos/new";
  return target;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let password = "";
  let redirectTo = "/memos/new";

  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as {
        password?: unknown;
        redirect?: unknown;
      };
      if (typeof body.password === "string") password = body.password;
      redirectTo = safeRedirect(body.redirect);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }
  } else {
    const form = await req.formData();
    const pw = form.get("password");
    const r = form.get("redirect");
    if (typeof pw === "string") password = pw;
    redirectTo = safeRedirect(typeof r === "string" ? r : null);
  }

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not set on this deployment." },
      { status: 500 },
    );
  }

  if (!passwordMatches(password)) {
    const loginUrl = new URL(
      `/admin/login?error=1&redirect=${encodeURIComponent(redirectTo)}`,
      req.url,
    );
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const token = await signSession();
  if (!token) {
    return NextResponse.json(
      { error: "Could not sign session." },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(new URL(redirectTo, req.url), {
    status: 303,
  });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return res;
}
