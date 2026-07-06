"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "incorrect password");
        return;
      }
      router.push(params.get("from") ?? "/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glow-border card w-full max-w-sm p-8"
    >
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--series-blue)] shadow-[0_0_16px_var(--series-blue)]" />
        <span className="text-sm font-semibold tracking-widest text-text-primary">POLYBOT</span>
      </div>
      <h1 className="text-lg font-semibold text-text-primary">Sign in to your bot</h1>
      <p className="mt-1 mb-6 text-sm text-text-secondary">
        Autonomous Polymarket scanner &amp; trader. Paper mode by default — no real funds are
        touched until you explicitly enable live trading in Settings.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Dashboard password</span>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-[var(--series-blue)]"
        />
      </label>
      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}
      <button
        type="submit"
        disabled={pending || password.length === 0}
        className="mt-5 w-full rounded-lg bg-[var(--series-blue)] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
