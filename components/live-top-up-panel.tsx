"use client"

import { startTransition, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { formatDateTime } from "@/lib/format"
import type { TopUpStatus } from "@/lib/types"

type Props = {
  initialTopUp: TopUpStatus
  compact?: boolean
  showButton?: boolean
}

function statusTone(status: TopUpStatus["status"]) {
  if (status === "running") {
    return "text-amber-200"
  }
  if (status === "completed") {
    return "text-emerald-300"
  }
  if (status === "failed") {
    return "text-rose-300"
  }
  if (status === "requested") {
    return "text-sky-300"
  }
  return "text-ink"
}

function statusLabel(status: TopUpStatus["status"]) {
  if (status === "requested") {
    return "Queued"
  }
  if (status === "running") {
    return "Running"
  }
  if (status === "completed") {
    return "Done"
  }
  if (status === "failed") {
    return "Failed"
  }
  return "Idle"
}

function eventTone(status: string) {
  if (status === "error") {
    return "text-rose-300"
  }
  if (status === "warning" || status === "partial") {
    return "text-amber-200"
  }
  return "text-emerald-300"
}

export function LiveTopUpPanel({ initialTopUp, compact = false, showButton = true }: Props) {
  const router = useRouter()
  const [topUp, setTopUp] = useState(initialTopUp)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState("")

  useEffect(() => {
    setTopUp(initialTopUp)
  }, [initialTopUp])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const response = await fetch("/api/run-status", { cache: "no-store" })
        if (!response.ok) {
          return
        }
        const payload = await response.json()
        if (!cancelled && payload.topUp) {
          setTopUp(payload.topUp as TopUpStatus)
        }
      } catch {
        // Keep last known status in place if polling fails.
      }
    }

    poll()
    const interval = window.setInterval(poll, topUp.status === "running" || topUp.status === "requested" ? 10000 : 30000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [topUp.status])

  const shortfall = useMemo(() => topUp.shortfall, [topUp])
  const showRecentActivity = topUp.status === "running" || topUp.status === "requested" || topUp.status === "failed"
  const liveMode = topUp.status === "running" || topUp.status === "requested"
  const latestEvent = topUp.recentEvents[0] || null
  const terminalLine = latestEvent
    ? `> ${latestEvent.label.toLowerCase()} · ${latestEvent.message}`
    : topUp.status === "running"
      ? `> scraper live · polling progress every 10 seconds`
      : topUp.status === "requested"
        ? `> scraper queued · waiting to start`
        : `> scraper idle`

  async function requestTopUp() {
    setPending(true)
    setStatus("")
    try {
      const response = await fetch("/api/top-up", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "Top-up request failed.")
      }
      setStatus("Top-up request sent.")
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Top-up request failed.")
    } finally {
      setPending(false)
    }
  }

  const buttonDisabled = pending || !topUp.canRequestTopUp || topUp.status === "requested" || topUp.status === "running"

  if (compact) {
    return (
      <div className={liveMode ? "scraper-live-shell" : ""}>
        <div className={`${liveMode ? "scraper-live-inner" : "panel-muted"} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-ink">Top-up</p>
              <span className={`text-sm font-semibold ${statusTone(topUp.status)}`}>{statusLabel(topUp.status)}</span>
            </div>
            <p className="mt-1 text-xs text-slateWarm">{topUp.latestMessage.replace(/\bWorker\b/g, "Scraper").replace(/\bworker\b/g, "scraper")}</p>
            <div className="mt-2 max-w-full overflow-hidden">
              <div className="scraper-terminal-line">
                <span className="scraper-terminal-dot" />
                <span className="truncate">{terminalLine.replace(/\bWorker\b/g, "Scraper").replace(/\bworker\b/g, "scraper")}</span>
                {liveMode ? <span className="scraper-terminal-caret">_</span> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showButton ? (
              <button type="button" onClick={requestTopUp} disabled={buttonDisabled} className="gold-button px-3 py-2 text-sm">
                {pending
                  ? "Requesting..."
                  : topUp.status === "running"
                    ? "Scraping..."
                    : topUp.status === "requested"
                      ? "Queued..."
                      : topUp.mode === "emails"
                        ? `Get ${shortfall} more`
                        : topUp.canRequestTopUp
                          ? "Top up"
                          : "Finish review first"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-label">Top-up</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{topUp.title}</h3>
          <p className="mt-2 text-sm text-slateWarm">{topUp.latestMessage}</p>
        </div>
        {showButton ? (
          <button type="button" onClick={requestTopUp} disabled={buttonDisabled} className="gold-button px-4 py-3 text-sm">
            {pending
              ? "Requesting..."
              : topUp.mode === "emails"
                ? "Get more emails"
                : topUp.mode === "qualified"
                  ? "Top up qualified leads"
                  : "Finish review first"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-semibold ${statusTone(topUp.status)}`}>{statusLabel(topUp.status)}</span>
        {topUp.requestedAt ? <span className="text-slateWarm">Requested {formatDateTime(topUp.requestedAt)}</span> : null}
        {topUp.startedAt ? <span className="text-slateWarm">Started {formatDateTime(topUp.startedAt)}</span> : null}
        {topUp.completedAt || topUp.failedAt ? (
          <span className="text-slateWarm">Finished {formatDateTime(topUp.completedAt || topUp.failedAt)}</span>
        ) : null}
      </div>

      {status ? <p className="mt-4 text-sm text-slateWarm">{status}</p> : null}

      {showRecentActivity ? (
        <div className="mt-5 space-y-3">
          {topUp.recentEvents.length ? (
            topUp.recentEvents.map((event) => (
              <article key={event.id} className="panel-muted px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{event.label}</p>
                  <p className={`text-xs uppercase tracking-[0.2em] ${eventTone(event.status)}`}>{event.status}</p>
                </div>
                <p className="mt-2 text-sm text-slateWarm">{event.message}</p>
                <p className="mt-2 text-xs text-slateWarm">{formatDateTime(event.created_at)}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slateWarm">No scraper activity for today yet.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
