import { NextResponse } from "next/server";
import { runCycle } from "../../../../lib/cycle";

/** Lets a logged-in dashboard user trigger a scan on demand, outside the
 * regular GitHub Actions schedule. Protected by the same session cookie as
 * the rest of the dashboard (see proxy.ts). */
export async function POST() {
  const summary = await runCycle();
  return NextResponse.json(summary);
}
