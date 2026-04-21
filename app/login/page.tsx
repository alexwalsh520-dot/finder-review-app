import { redirect } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import { getSession } from "@/lib/auth"

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="grid w-full max-w-5xl gap-8 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#111216] shadow-[0_30px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6 bg-[#0d0e12] px-8 py-10 text-white lg:px-10 lg:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emberSoft">Finder Review App</p>
          <div className="space-y-4">
            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Review new leads cleanly before they ever reach Smartlead.
            </h1>
            <p className="max-w-lg text-base text-stone-300">
              The scraper finds the leads, Supabase stores the truth, and this app is the review desk for names,
              quality, approval, export, and sent-state tracking.
            </p>
          </div>
          <div className="grid gap-4 text-sm text-stone-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <p className="font-semibold text-white">VA Queue</p>
              <p className="mt-2">Fix first names and move clean leads forward fast.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <p className="font-semibold text-white">Owner Review</p>
              <p className="mt-2">Flagged leads wait for your final call before export.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <p className="font-semibold text-white">Automatic Sent Sync</p>
              <p className="mt-2">As Smartlead receives leads, the app reflects it back automatically.</p>
            </div>
          </div>
        </section>
        <section className="flex items-center bg-[#111216] px-8 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ember">Sign In</p>
              <h2 className="text-3xl font-semibold text-ink">Open the review desk</h2>
              <p className="text-sm text-slateWarm">Use your owner or reviewer credentials from Vercel env.</p>
            </div>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  )
}
