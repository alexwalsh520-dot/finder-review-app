"use client"

import { useMemo, useState } from "react"
import type { MouseEvent } from "react"

import { formatShortDayLabel } from "@/lib/format"
import type { DailyEmailPerformanceRow } from "@/lib/types"

type Props = {
  rows: DailyEmailPerformanceRow[]
}

type Point = {
  x: number
  y: number
  value: number
  label: string
  hitTarget: boolean
}

function buildSmoothPath(points: Point[]) {
  if (!points.length) {
    return ""
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const controlX = (current.x + next.x) / 2
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`
  }
  return path
}

export function DailyProgressChart({ rows }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const width = 720
  const height = 220
  const paddingX = 28
  const paddingTop = 18
  const paddingBottom = 34
  const chartHeight = height - paddingTop - paddingBottom
  const maxValue = Math.max(...rows.map((row) => row.newEmails), 100)

  const points = useMemo<Point[]>(() => {
    if (!rows.length) {
      return []
    }
    const stepX = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0
    return rows.map((row, index) => ({
      x: paddingX + stepX * index,
      y: paddingTop + chartHeight - (row.newEmails / maxValue) * chartHeight,
      value: row.newEmails,
      label: formatShortDayLabel(row.day),
      hitTarget: row.hitTarget,
    }))
  }, [rows, maxValue])

  const hoveredPoint = hoveredIndex != null ? points[hoveredIndex] : null
  const linePath = buildSmoothPath(points)
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : ""

  function updateHoverFromPointer(event: MouseEvent<SVGSVGElement>) {
    if (!points.length) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) {
      return
    }
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * width
    let nextIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(points[index].x - relativeX)
      if (distance < bestDistance) {
        bestDistance = distance
        nextIndex = index
      }
    }
    setHoveredIndex(nextIndex)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[260px] w-full overflow-visible"
        onMouseMove={updateHoverFromPointer}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="daily-progress-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(201,169,110,0.35)" />
            <stop offset="100%" stopColor="rgba(201,169,110,0.03)" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#daily-progress-fill)" />
        <path d={linePath} fill="none" stroke="#c9a96e" strokeWidth="4" strokeLinecap="round" />

        {points.map((point, index) => (
          <g key={`${point.label}-${point.value}`}>
            <line x1={point.x} x2={point.x} y1={paddingTop} y2={height - paddingBottom} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 8" />
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === index ? 7 : 5}
              fill={point.hitTarget ? "#8ed8b1" : "#c9a96e"}
              stroke="#0c0c10"
              strokeWidth="3"
            />
            <text x={point.x} y={height - 8} textAnchor="middle" className="fill-white/35 text-[11px]">
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-2xl border border-white/[0.08] bg-[#111116] px-3 py-2 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          style={{ left: `${(hoveredPoint.x / width) * 100}%`, top: `${Math.max(((hoveredPoint.y - 50) / height) * 100, 2)}%` }}
        >
          <p className="font-medium text-ink">{hoveredPoint.value} new emails</p>
        </div>
      ) : null}
    </div>
  )
}
