"use client"

import { useRouter } from "next/navigation"
import { startTransition, useState } from "react"

export function SettingsToggle({ initialValue }: { initialValue: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)

  async function updateValue(nextValue: boolean) {
    setPending(true)
    setStatus("")
    try {
      const response = await fetch("/api/settings/require-owner-approval", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: nextValue }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Update failed.")
      }
      setValue(nextValue)
      setStatus("Saved")
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Update failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="panel-muted flex items-center justify-between px-4 py-4">
        <div>
          <p className="font-medium text-ink">Require owner approval</p>
          <p className="mt-1 text-sm text-slateWarm">
            When on, every VA decision still goes through Alex. When off, VA-marked Qualified leads go straight to Ready for Smartlead, while Not qualified leads still go to Alex.
          </p>
        </div>
        <input type="checkbox" checked={value} onChange={(event) => updateValue(event.target.checked)} disabled={pending} />
      </label>
      {status ? <p className="text-sm text-slateWarm">{status}</p> : null}
    </div>
  )
}
