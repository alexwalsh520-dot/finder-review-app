import type { FileEntry } from "@/lib/types"

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})

const SHORT_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
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

function toOrdinal(value: number): string {
  const remainder = value % 100
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`
  }
  const lastDigit = value % 10
  if (lastDigit === 1) {
    return `${value}st`
  }
  if (lastDigit === 2) {
    return `${value}nd`
  }
  if (lastDigit === 3) {
    return `${value}rd`
  }
  return `${value}th`
}

export function formatDayLabel(value: string | null | undefined): string {
  if (!value) {
    return "—"
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  const monthLabel = DAY_LABEL_FORMATTER.format(date).replace(/\s+\d+$/, "")
  return `${monthLabel} ${toOrdinal(Number(day))}`
}

export function formatShortDayLabel(value: string | null | undefined): string {
  if (!value) {
    return "—"
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  return SHORT_DAY_LABEL_FORMATTER.format(date)
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
