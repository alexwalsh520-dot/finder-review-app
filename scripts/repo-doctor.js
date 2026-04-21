#!/usr/bin/env node

const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const args = new Set(process.argv.slice(2))

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim()
}

function fail(message) {
  console.error(`\nFinder Review doctor failed: ${message}\n`)
  process.exit(1)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

let repoRoot = ""

try {
  repoRoot = run("git", ["rev-parse", "--show-toplevel"])
} catch (error) {
  fail("Git repo not detected. Run this inside the finder-review-app repository.")
}

const repoName = path.basename(repoRoot)
if (repoName !== "finder-review-app") {
  fail(`expected repo root to be "finder-review-app" but found "${repoName}" at ${repoRoot}`)
}

let remoteUrl = ""
try {
  remoteUrl = run("git", ["config", "--get", "remote.origin.url"], { cwd: repoRoot })
} catch (error) {
  fail("missing remote.origin.url")
}

if (!/finder-review-app(?:\.git)?$/i.test(remoteUrl)) {
  fail(`origin remote does not look like the approval-desk repo: ${remoteUrl}`)
}

const statusOutput = run("git", ["status", "--porcelain"], { cwd: repoRoot })
const dirtyLines = statusOutput
  .split("\n")
  .map((line) => line.trimEnd())
  .filter(Boolean)

if (dirtyLines.length > 0 && !args.has("--allow-dirty")) {
  fail(`working tree is dirty:\n${dirtyLines.join("\n")}`)
}

const vercelProjectPath = path.join(repoRoot, ".vercel", "project.json")
let vercelProjectName = "unlinked"
if (fs.existsSync(vercelProjectPath)) {
  const vercelProject = readJson(vercelProjectPath)
  vercelProjectName = vercelProject.projectName || "unknown"
  if (vercelProjectName !== "finder-review-app") {
    fail(`linked Vercel project is "${vercelProjectName}", expected "finder-review-app"`)
  }
}

const workspaceRoot = path.dirname(repoRoot)
const siblingRepos = fs
  .readdirSync(workspaceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => name !== repoName)
  .filter((name) => fs.existsSync(path.join(workspaceRoot, name, ".git")))

console.log("Finder Review doctor passed.")
console.log(`Repo root: ${repoRoot}`)
console.log(`Origin: ${remoteUrl}`)
console.log(`Vercel project: ${vercelProjectName}`)
if (dirtyLines.length > 0) {
  console.log(`Working tree note: ${dirtyLines.length} uncommitted change(s) present; allowed for this run because --allow-dirty was used.`)
}
if (siblingRepos.length > 0) {
  console.log(`Workspace note: other repos detected nearby (${siblingRepos.join(", ")}). Ship the approval desk only from ${repoName}/.`)
}
