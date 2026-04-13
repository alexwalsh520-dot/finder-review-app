import type { FileEntry } from "@/lib/types"

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "—"
  }
  return DATE_TIME_FORMATTER.format(date)
}

export function compactNumber(value: number | null | undefined): string {
  if (value == null) {
    return "—"
  }
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function createInstagramUrl(handle: string | null | undefined): string {
  if (!handle) {
    return "#"
  }
  return `https://instagram.com/${handle.replace(/^@/, "")}`
}

export function fileLabel(entry: FileEntry): string {
  return `${entry.day} · ${entry.name}`
}
