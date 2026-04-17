import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function safeRedirect(target: string | undefined): string {
  if (!target) return "/memos/new";
  if (!target.startsWith("/") || target.startsWith("//")) return "/memos/new";
  return target;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const redirectTo = safeRedirect(firstString(sp.redirect));
  const hasError = firstString(sp.error) === "1";

  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Admin</span>
        <h1 className="display mt-2">Sign in</h1>
        <p
          className="prose-body mt-4 max-w-xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Editing routes are gated by a single shared password. After signing
          in you&rsquo;ll be redirected to{" "}
          <code>{redirectTo}</code>.
        </p>
      </header>

      <form
        method="POST"
        action="/api/admin/login"
        className="mt-8 flex max-w-md flex-col gap-6"
      >
        <input type="hidden" name="redirect" value={redirectTo} />
        <label className="flex flex-col gap-2">
          <span className="label">Password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="ucnfi-input"
          />
        </label>

        {hasError ? (
          <div
            className="rail-accent"
            style={{ borderLeftColor: "var(--color-danger)" }}
          >
            <span className="label" style={{ color: "var(--color-danger)" }}>
              Incorrect password
            </span>
          </div>
        ) : null}

        <div className="hairline flex items-center justify-between gap-6 pt-4">
          <Link
            href="/"
            className="label"
            style={{ color: "var(--color-text-subtle)" }}
          >
            ← Home
          </Link>
          <button
            type="submit"
            className="label"
            style={{ color: "var(--color-accent)", cursor: "pointer" }}
          >
            Sign in ↵
          </button>
        </div>
      </form>
    </div>
  );
}
