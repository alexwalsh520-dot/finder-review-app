import { requireSession } from "@/lib/auth"
import { getRequireOwnerApproval } from "@/lib/data"
import { SettingsToggle } from "@/components/settings-toggle"

export default async function SettingsPage() {
  await requireSession(["owner"])
  const requireOwnerApproval = await getRequireOwnerApproval()

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Review workflow controls</h2>
      </div>
      <div className="panel p-5">
        <SettingsToggle initialValue={requireOwnerApproval} />
      </div>
    </div>
  )
}
