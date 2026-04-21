"use client"

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProtectedAppError({ error, reset }: Props) {
  return (
    <div className="mx-auto max-w-2xl p-6 md:p-8">
      <div className="panel space-y-4 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Finder Review</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">The app hit a server problem.</h2>
          <p className="mt-2 text-sm text-slateWarm">
            Try reloading this screen. If it keeps happening, go back to login and we can check the backend env or data connection next.
          </p>
        </div>

        {error?.message ? (
          <div className="panel-muted p-4">
            <p className="text-sm text-slateWarm">{error.message}</p>
            {error.digest ? <p className="mt-2 text-xs text-slateWarm/80">Digest: {error.digest}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="gold-button px-4 py-2 text-sm">
            Try again
          </button>
          <button type="button" onClick={() => window.location.assign("/login")} className="ghost-button px-4 py-2 text-sm">
            Go to login
          </button>
        </div>
      </div>
    </div>
  )
}
