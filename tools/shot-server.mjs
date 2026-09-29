// Receives { name, data } JSON posts (data = PNG dataURL) and writes
// docs/img/<name>.png. Used to capture real StudyFlow screens for the
// documentation build. Run: node tools/shot-server.mjs
import http from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "docs", "img")
mkdirSync(outDir, { recursive: true })

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
      res.end()
      return
    }

    if (req.method !== "POST" || !req.url.startsWith("/shot")) {
      res.statusCode = 404
      res.end("not found")
      return
    }

    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      try {
        const { name, data } = JSON.parse(body)
        const b64 = String(data).split(",")[1] || ""
        const file = join(outDir, `${name}.png`)
        writeFileSync(file, Buffer.from(b64, "base64"))
        res.end(`saved ${name}`)
      } catch (err) {
        res.statusCode = 500
        res.end(String(err))
      }
    })
  })
  .listen(4180, () => console.log("shot server on :4180"))
