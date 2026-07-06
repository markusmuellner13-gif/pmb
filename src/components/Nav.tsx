"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Opportunities" },
  { href: "/positions", label: "Positions" },
  { href: "/trades", label: "Trades" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex h-16 w-full items-center justify-between border-b border-[var(--border-hairline)] px-6 md:h-full md:w-56 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-6">
      <div className="flex items-center gap-2 md:mb-8 md:px-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--series-blue)] shadow-[0_0_12px_var(--series-blue)]" />
        <span className="text-sm font-semibold tracking-wide text-text-primary">
          POLYBOT
        </span>
      </div>
      <div className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-1">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--surface-2)] text-text-primary"
                  : "text-text-secondary hover:bg-[var(--surface-2)]/60 hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <button
        onClick={logout}
        className="hidden text-left text-xs text-text-muted hover:text-text-secondary md:mt-auto md:block md:px-3"
      >
        Sign out
      </button>
    </nav>
  );
}
