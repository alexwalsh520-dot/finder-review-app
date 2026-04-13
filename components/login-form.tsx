"use client"

import { useRouter } from "next/navigation"
import { startTransition, useState } from "react"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Login failed.")
      }
      startTransition(() => {
        router.push("/dashboard")
        router.refresh()
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slateWarm" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slateWarm" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full"
        />
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="gold-button w-full px-4 py-3 text-sm"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}
