/**
 * Minimal ZIP reader, used to open Xshell `.xts` backup archives.
 *
 * `.xts` is a plain ZIP (deflate or stored entries) that mirrors the Xshell
 * data folder. Node already ships zlib, so reading it needs no dependency, and
 * keeping the reader here means the importer stays self contained.
 *
 * Only what a backup needs is implemented: no encryption, no ZIP64 (those
 * archives would be larger than 4 GiB).
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

function findEocd (buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      return i
    }
  }
  return -1
}

/**
 * Archives written by Xshell store non-ASCII names as GBK without setting the
 * UTF-8 flag, so decode strictly as UTF-8 first and fall back to GBK.
 */
function decodeName (raw, flags) {
  if (flags & 0x800) {
    return raw.toString('utf8')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch (e) {
    try {
      return require('iconv-lite').decode(raw, 'gbk')
    } catch (err) {
      return raw.toString('latin1')
    }
  }
}

function listEntries (buf) {
  const eocd = findEocd(buf)
  if (eocd < 0) {
    throw new Error('not a zip archive (no end of central directory)')
  }
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error('broken zip central directory at entry ' + i)
    }
    const flags = buf.readUInt16LE(offset + 8)
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const size = buf.readUInt32LE(offset + 24)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = decodeName(buf.subarray(offset + 46, offset + 46 + nameLen), flags)
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('zip64 archives are not supported: ' + name)
    }
    entries.push({
      name: name.replace(/\\/g, '/'),
      flags,
      method,
      compressedSize,
      size,
      localOffset
    })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readEntry (buf, entry) {
  const off = entry.localOffset
  if (buf.readUInt32LE(off) !== LOCAL_SIG) {
    throw new Error('broken zip local header: ' + entry.name)
  }
  const nameLen = buf.readUInt16LE(off + 26)
  const extraLen = buf.readUInt16LE(off + 28)
  const start = off + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) {
    return Buffer.from(raw)
  }
  if (entry.method === 8) {
    return zlib.inflateRawSync(raw)
  }
  throw new Error('unsupported zip compression method ' + entry.method + ' for ' + entry.name)
}

function isZip (file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const head = Buffer.alloc(4)
    fs.readSync(fd, head, 0, 4, 0)
    return head[0] === 0x50 && head[1] === 0x4b
  } catch (e) {
    return false
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd)
    }
  }
}

/**
 * Extract matching entries below `dest`, refusing anything that would escape
 * it. Returns the number of files written.
 */
function extractTo (buf, entries, dest, accept) {
  let written = 0
  const root = path.resolve(dest)
  for (const entry of entries) {
    if (entry.name.endsWith('/')) {
      continue
    }
    if (accept && !accept(entry.name)) {
      continue
    }
    const target = path.resolve(root, entry.name)
    if (target !== root && !target.startsWith(root + path.sep)) {
      continue
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, readEntry(buf, entry))
    written++
  }
  return written
}

module.exports = {
  listEntries,
  readEntry,
  extractTo,
  isZip,
  decodeName
}
