import Link from "next/link"

/**
 * Root page — not a real entry point for users.
 *
 * Reporters arrive via the QR poster at /r/[sap_code].
 * Managers at /m/[sap_code]. HO at /ho.
 * This page exists so the root URL doesn't 404 during internal testing.
 */
export default function RootPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-display text-[28px] font-bold leading-9 text-slate-900">
        SafeReport
      </h1>
      <p className="text-[15px] leading-6 text-slate-600">
        Workplace safety incident reporting for Aditya Birla Fashion &amp; Retail.
      </p>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-[13px] leading-5 text-slate-700">
        <p className="font-medium text-slate-900">Where to go</p>
        <ul className="space-y-2">
          <li>
            Reporter:{" "}
            <Link
              href="/r/PNT-MUM-047"
              className="font-medium text-indigo-700 underline"
            >
              /r/PNT-MUM-047
            </Link>{" "}
            <span className="text-slate-400">(demo store)</span>
          </li>
          <li>
            Manager: <span className="text-slate-900">/m/[sap_code]</span>
            <span className="text-slate-400"> — Phase C</span>
          </li>
          <li>
            Head Office: <span className="text-slate-900">/ho</span>
            <span className="text-slate-400"> — Phase D</span>
          </li>
        </ul>
      </div>
    </main>
  )
}
