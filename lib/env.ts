import "server-only"

export function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

export function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() || ""
}
