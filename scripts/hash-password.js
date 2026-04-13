const crypto = require("crypto")

const password = process.argv[2]

if (!password) {
  console.error("Usage: npm run hash-password -- \"your-password\"")
  process.exit(1)
}

const digest = crypto.createHash("sha256").update(password, "utf8").digest("hex")
console.log(`sha256:${digest}`)
