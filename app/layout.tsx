import type { Metadata } from "next"

import "@/app/globals.css"

export const metadata: Metadata = {
  title: "Finder Review App",
  description: "Review desk for finder_v1 leads",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
