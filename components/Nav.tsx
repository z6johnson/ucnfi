import Link from "next/link";

const items: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/entities", label: "Baseline" },
  { href: "/compare", label: "Compare" },
  { href: "/chat", label: "Chat" },
  { href: "/memos", label: "Memos" },
];

export function Nav() {
  return (
    <header className="hairline flex items-end justify-between pb-4 pt-8">
      <Link href="/" className="no-underline">
        <div className="flex items-baseline gap-3">
          <span
            className="text-lg font-extrabold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            UCNFI
          </span>
          <span className="label">UC Next Frontier Initiative</span>
        </div>
      </Link>
      <nav className="flex items-center gap-6">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="label hover:text-[var(--color-accent)]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
