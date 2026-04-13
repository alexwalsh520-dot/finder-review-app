import "server-only"

import { createHash, createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getEnv } from "@/lib/env"
import type { AppRole, SessionPayload } from "@/lib/types"

const COOKIE_NAME = "finder-review-session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

function signatureFor(payload: string): string {
  return createHmac("sha256", getEnv("SESSION_SECRET")).update(payload).digest("base64url")
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${signatureFor(body)}`
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".")
  if (!body || !signature) {
    return null
  }
  const expected = signatureFor(body)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload
    if (!payload.exp || payload.exp < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function getCredential(role: AppRole) {
  if (role === "owner") {
    return {
      role,
      email: getEnv("OWNER_EMAIL").trim().toLowerCase(),
      hash: getEnv("OWNER_PASSWORD_HASH").trim(),
    }
  }
  return {
    role,
    email: getEnv("REVIEWER_EMAIL").trim().toLowerCase(),
    hash: getEnv("REVIEWER_PASSWORD_HASH").trim(),
  }
}

function verifyHash(password: string, expectedHash: string): boolean {
  const normalized = expectedHash.replace(/^sha256:/, "")
  const actual = sha256(password)
  const expectedBuf = Buffer.from(normalized, "utf8")
  const actualBuf = Buffer.from(actual, "utf8")
  if (expectedBuf.length !== actualBuf.length) {
    return false
  }
  return timingSafeEqual(expectedBuf, actualBuf)
}

export async function authenticateUser(email: string, password: string): Promise<SessionPayload | null> {
  const normalizedEmail = email.trim().toLowerCase()
  for (const role of ["owner", "reviewer"] as const) {
    const credential = getCredential(role)
    if (normalizedEmail !== credential.email) {
      continue
    }
    if (!verifyHash(password, credential.hash)) {
      return null
    }
    return {
      email: credential.email,
      role,
      exp: Date.now() + SESSION_TTL_MS,
    }
  }
  return null
}

export async function setSessionCookie(payload: SessionPayload) {
  cookies().set(COOKIE_NAME, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) {
    return null
  }
  return decode(token)
}

export async function requireApiSession(roles?: AppRole[]): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw new Error("Authentication required.")
  }
  if (roles && !roles.includes(session.role)) {
    throw new Error("You do not have permission to do that.")
  }
  return session
}

export async function requireSession(roles?: AppRole[]) {
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  if (roles && !roles.includes(session.role)) {
    redirect("/dashboard")
  }
  return session
}
