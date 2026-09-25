// Shared image validation — pure module (no dependencies), used by the
// backend upload helpers and the community pickers so both enforce the
// exact same rules. Node-testable: `node --input-type=module` import works.
//
// Root cause it fixes: the old check trusted ONLY the browser-provided MIME
// type (`IMAGE_TYPES.has(file.type)`), so a genuine PNG reported as
// `image/x-png` (legacy Windows), `image/jpg`/`image/pjpeg`, or an empty
// string (some Android file managers) was rejected with "Use a JPEG, PNG,
// WebP or GIF image." Now: MIME aliases + case-insensitive extension +
// magic-byte verification.

export const IMAGE_FORMAT_ERROR = "Use a JPEG, PNG, WebP or GIF image."

// Browser MIME values (and legacy aliases) we accept, by canonical kind.
const MIME_KINDS = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/x-png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

// Lowercase file extensions we accept, by canonical kind.
const EXT_KINDS = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
}

export function imageKindFromMime(mime) {
  return (
    MIME_KINDS[
      String(mime || "")
        .toLowerCase()
        .trim()
    ] || null
  )
}

export function imageKindFromExt(name) {
  // File.name is a plain filename, never a URL — do NOT split on ?# (a file
  // legitimately named "photo#1.png" must keep its real extension).
  const base = String(name || "")
  const dot = base.lastIndexOf(".")
  if (dot < 0 || dot === base.length - 1) return null
  return EXT_KINDS[base.slice(dot + 1).toLowerCase()] || null
}

// Magic-byte detection for the four supported formats.
// PNG: 89 50 4E 47 0D 0A 1A 0A · JPEG: FF D8 FF ·
// GIF: "GIF87a"/"GIF89a" · WebP: "RIFF"...."WEBP".
export function imageKindFromBytes(u8) {
  if (!u8 || u8.length < 4) return null
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47 &&
    u8[4] === 0x0d &&
    u8[5] === 0x0a &&
    u8[6] === 0x1a &&
    u8[7] === 0x0a
  ) {
    return "png"
  }
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "jpeg"
  if (
    u8[0] === 0x47 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x38 &&
    (u8[4] === 0x37 || u8[4] === 0x39) &&
    u8[5] === 0x61
  )
    return "gif"
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

export function imageSizeError(maxBytes) {
  const mb = maxBytes / 1048576
  const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1)
  return `Image is too large. Maximum size is ${label} MB.`
}

// Returns an error string, or null when the file is a supported image.
// Size is checked FIRST so oversized files get the size message, never the
// format message. Never throws for File-like input.
//
// Diagnostics: every decision is recorded to window.__sfLastImageDiag plus a
// single console.debug line (DevTools only — nothing user-facing), so a real
// browser rejection can be traced to its exact condition: filename, MIME,
// size, first bytes, per-signal kinds, and verdict.
function recordImageDiag(rec) {
  try {
    const entry = { at: new Date().toISOString(), ...rec }
    if (typeof window !== "undefined") {
      window.__sfLastImageDiag = entry
      console.debug(
        "[sf-image]",
        entry.verdict,
        entry.caller || "-",
        JSON.stringify({
          name: entry.name,
          type: entry.type,
          size: entry.size,
          magic: entry.magicHex,
        }),
      )
    }
  } catch {
    /* diagnostics must never break uploads */
  }
}
function hexHead(u8, n = 16) {
  try {
    return [...u8.slice(0, n)]
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ")
  } catch {
    return ""
  }
}
export async function validateImageFile(file, maxBytes, caller = "") {
  const base = {
    caller,
    name: file?.name,
    type: file?.type,
    size: file?.size,
    lastModified: file?.lastModified,
  }
  const fail = (verdict, message, extra = {}) => {
    recordImageDiag({ ...base, ...extra, verdict })
    return message
  }
  if (!file || typeof file !== "object" || typeof file.size !== "number") {
    return fail("reject:no-file", "Choose an image file first")
  }
  if (!(file.size > 0))
    return fail("reject:empty", "That image looks empty — pick another")
  if (file.size > maxBytes) return fail("reject:size", imageSizeError(maxBytes))
  const mimeKind = imageKindFromMime(file.type)
  const extKind = imageKindFromExt(file.name)
  let magicKind = null
  let magicHex = ""
  let bytesOk = false
  try {
    if (
      typeof file.slice === "function" &&
      typeof file.arrayBuffer === "function"
    ) {
      const buf = await file.slice(0, 16).arrayBuffer()
      const head = new Uint8Array(buf)
      bytesOk = head.length > 0
      magicHex = hexHead(head)
      magicKind = imageKindFromBytes(head)
    }
  } catch {
    magicKind = null
  }
  const signals = { mimeKind, extKind, magicKind, bytesOk, magicHex }
  if (!mimeKind && !extKind)
    return fail("reject:unlabeled", IMAGE_FORMAT_ERROR, signals)
  if (magicKind) {
    // Bytes are authoritative: accept when they match either label, reject
    // masquerades (e.g. photo.png containing a script).
    return magicKind === mimeKind || magicKind === extKind
      ? fail("accept", null, signals)
      : fail("reject:mismatch", IMAGE_FORMAT_ERROR, signals)
  }
  // Bytes unreadable (practically never in modern browsers): trust a real
  // browser-sniffed MIME, but never an extension claim alone.
  return mimeKind
    ? fail("accept:unverified", null, signals)
    : fail("reject:unverifiable", IMAGE_FORMAT_ERROR, signals)
}
