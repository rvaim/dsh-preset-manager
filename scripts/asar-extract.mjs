// Extract one file from an Electron app.asar archive without any dependency.
// Electron's asar format: 8-byte header (4-byte UInt32 size prefix metadata,
// then a JSON directory header, then the concatenated file bytes).
import { openSync, readSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [, , archivePath, innerPath, outputPath] = process.argv
if (!archivePath || !innerPath || !outputPath) {
  console.error('usage: node asar-extract.mjs <archive.asar> <inner/path> <output>')
  process.exit(2)
}

const fd = openSync(archivePath, 'r')

// The first 16 bytes: two UInt32LE pickle fields, then the header size.
const head = Buffer.alloc(16)
readSync(fd, head, 0, 16, 0)
const headerPickleSize = head.readUInt32LE(4)
const headerStringSize = head.readUInt32LE(12)

const headerBuffer = Buffer.alloc(headerStringSize)
readSync(fd, headerBuffer, 0, headerStringSize, 16)
const header = JSON.parse(headerBuffer.toString('utf8'))

// The file data begins immediately after the 8-byte size field plus the whole
// header pickle. `headerPickleSize` already covers the pickle's own length
// prefix and its JSON payload, so adding another 8 here would shift every
// extracted byte forward and silently truncate the first characters of a file.
const baseOffset = 8 + headerPickleSize

const segments = innerPath.split('/').filter((segment) => segment !== '')
let node = header
for (const segment of segments) {
  if (!node.files || node.files[segment] === undefined) {
    console.error(`not found in archive: ${innerPath} (missing ${segment})`)
    process.exit(1)
  }
  node = node.files[segment]
}
if (node.files) {
  console.error(`is a directory: ${innerPath}`)
  process.exit(1)
}

const size = Number(node.size)
const offset = baseOffset + Number(node.offset)
const out = Buffer.alloc(size)
readSync(fd, out, 0, size, offset)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, out)
console.log(`extracted ${innerPath} -> ${outputPath} (${size} bytes)`)
