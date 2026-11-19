/**
 * Xshell session importer.
 *
 * Reads NetSarang Xshell session files (`.xsh`, INI format, UTF-8 / UTF-16 /
 * GBK) either from the folders Xshell itself uses or from a `.xts` full backup
 * archive, turns every session into a b-shell bookmark payload and rebuilds
 * the Xshell folder tree as bookmark groups.
 *
 * Password fields in Xshell sessions are RC4 encrypted with a key derived
 * from the Windows SID and the account name (one SHA-256 check value is stored
 * with every password, so a wrong key is detected instead of producing
 * garbage). Sessions protected by an Xshell master password cannot be
 * decrypted here and come back with `passwordStatus: 'locked'`, so the UI can
 * ask the user to type those passwords once.
 *
 * Private keys (`.pri`, "NSSSH PRIVATE KEY" format) are converted into
 * standard OpenSSH PEM so the sessions using them keep working after import.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const zipRead = require('./zip-read')

const TYPE_MAP = {
  SSH: 'ssh',
  TELNET: 'telnet',
  RDP: 'rdp',
  VNC: 'vnc'
}
const DEFAULT_PORTS = {
  ssh: 22,
  telnet: 23,
  rdp: 3389,
  vnc: 5900
}
const ENCODE_MAP = {
  65001: 'utf8',
  936: 'gbk',
  950: 'big5',
  932: 'shiftjis',
  949: 'euckr',
  54936: 'gb18030',
  1251: 'cp1251',
  1252: 'windows-1252'
}
const GROUP_PREFIX = 'xshell-g-'
const BOOKMARK_PREFIX = 'xshell-b-'
const ROOT_GROUP_ID = GROUP_PREFIX + 'root'
const ARCHIVE_EXT_RE = /\.(xts|zip)$/i
const EXTRACT_DIR_PREFIX = 'b-shell-xshell-'
// A backup is small (a few MB); refuse absurd archives instead of filling /tmp.
const MAX_EXTRACT_BYTES = 512 * 1024 * 1024

function sha256 (buf) {
  return crypto.createHash('sha256').update(buf).digest()
}

function rc4 (key, data) {
  const S = Buffer.alloc(256)
  for (let i = 0; i < 256; i++) {
    S[i] = i
  }
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff
    const t = S[i]
    S[i] = S[j]
    S[j] = t
  }
  const out = Buffer.alloc(data.length)
  let i = 0
  j = 0
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff
    j = (j + S[i]) & 0xff
    const t = S[i]
    S[i] = S[j]
    S[j] = t
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff]
  }
  return out
}

/**
 * Xshell stores `SHA256(password)` as the last 32 bytes of the field and the
 * RC4 payload before it. Trying both SID layouts is cheap and lets the check
 * value decide which Xshell generation wrote the file.
 * @returns {{ password: string, status: 'ok'|'empty'|'locked' }}
 */
function decryptPassword (encrypted, ids) {
  if (!encrypted) {
    return { password: '', status: 'empty' }
  }
  const buf = Buffer.from(encrypted, 'base64')
  if (buf.length <= 32) {
    return { password: '', status: 'locked' }
  }
  const payload = buf.subarray(0, buf.length - 32)
  const check = buf.subarray(buf.length - 32)
  for (const id of ids) {
    const out = rc4(sha256(Buffer.from(id, 'ascii')), payload)
    if (sha256(out).equals(check)) {
      return { password: out.toString('utf8'), status: 'ok' }
    }
  }
  return { password: '', status: 'locked' }
}

/**
 * Xshell 7/8: reverse(SID) + user name, Xshell 6 and older: user name + SID.
 */
function getIdentity () {
  let username = ''
  try {
    username = os.userInfo().username
  } catch (e) {
    username = process.env.USERNAME || process.env.USER || ''
  }
  let sid = ''
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('whoami', ['/user'], {
        encoding: 'utf8',
        windowsHide: true
      })
      const m = out.match(/S-1-5-[0-9-]+/)
      if (m) {
        sid = m[0]
      }
    } catch (e) {
      // whoami is missing (very stripped Windows installs): passwords stay locked
    }
  }
  const candidates = []
  if (username && sid) {
    candidates.push(sid.split('').reverse().join('') + username)
    candidates.push(username + sid)
  }
  return { username, sid, candidates }
}

function decodeBuffer (buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le')
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2))
    if (body.length % 2 === 0) {
      body.swap16()
    }
    return body.toString('utf16le')
  }
  const utf8 = buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? buf.subarray(3).toString('utf8')
    : buf.toString('utf8')
  if (!utf8.includes('\uFFFD')) {
    return utf8
  }
  try {
    return require('iconv-lite').decode(buf, 'gbk')
  } catch (e) {
    return utf8
  }
}

function parseIni (text) {
  const sections = {}
  let current = ''
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const s = line.trim()
    if (!s || s[0] === '#' || s[0] === ';') {
      continue
    }
    const header = s.match(/^\[(.+)\]$/)
    if (header) {
      current = header[1].trim().toUpperCase()
      if (!sections[current]) {
        sections[current] = {}
      }
      continue
    }
    if (!current) {
      continue
    }
    const idx = s.indexOf('=')
    if (idx <= 0) {
      continue
    }
    sections[current][s.slice(0, idx).trim()] = s.slice(idx + 1).trim()
  }
  return sections
}

function readIni (file) {
  let buf
  try {
    buf = fs.readFileSync(file)
  } catch (e) {
    return null
  }
  try {
    return parseIni(decodeBuffer(buf))
  } catch (e) {
    return null
  }
}

function shortHash (str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 12)
}

function getPossibleRoots () {
  const env = process.env.XSHELL_SESSION_PATH || process.env.XSHELL_SESSIONS
  if (env) {
    return env.split(path.delimiter)
      .map(p => p.trim())
      .filter(Boolean)
  }
  const roots = []
  if (process.platform !== 'win32') {
    return roots
  }
  const docs = [path.join(os.homedir(), 'Documents')]
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer
  if (oneDrive) {
    docs.push(path.join(oneDrive, 'Documents'))
  }
  // Xshell 5-8 keep sessions under Documents\NetSarang Computer\<major>\Xshell
  const majors = []
  for (let v = 9; v >= 5; v--) {
    majors.push(String(v))
  }
  const bases = [...new Set(docs)]
  for (const base of bases) {
    for (const major of majors) {
      roots.push(path.join(base, 'NetSarang Computer', major, 'Xshell', 'Sessions'))
    }
  }
  const appData = process.env.APPDATA
  if (appData) {
    roots.push(path.join(appData, 'NetSarang', 'Xshell', 'Sessions'))
  }
  return roots
}

/**
 * Every directory that may hold NetSarang data (session tree root or its
 * ancestors), used to look for `SECSH/UserKeys` next to the sessions.
 */
function keySearchBases (base) {
  const bases = []
  let cur = path.resolve(base)
  for (let i = 0; i < 3; i++) {
    bases.push(cur)
    const parent = path.dirname(cur)
    if (parent === cur) {
      break
    }
    cur = parent
  }
  return bases
}

function walkSessions (dir, base, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSessions(full, base, out)
      continue
    }
    if (!/\.xsh$/i.test(entry.name)) {
      continue
    }
    out.push({
      filePath: full,
      relPath: path.relative(base, full),
      title: entry.name.replace(/\.xsh$/i, '')
    })
  }
}

function countSessions (dir) {
  const out = []
  walkSessions(dir, dir, out)
  return out.length
}

/**
 * An Xshell directory can be given at many levels (`...\8`, `...\8\Xshell`,
 * `...\8\Xshell\Sessions`, or the archive root). Pick the directory that owns
 * the most sessions, preferring the deeper one so the folder tree stays as the
 * user sees it in Xshell instead of gaining a `Xshell/Sessions` wrapper.
 */
function findSessionsRoot (base) {
  const candidates = [base]
  let level = [base]
  for (let depth = 0; depth < 3; depth++) {
    const next = []
    for (const dir of level) {
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (e) {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }
        // skip the data folders that never contain sessions
        if (/^(SECSH|Common|Themes|Log|Credential)$/i.test(entry.name)) {
          continue
        }
        const full = path.join(dir, entry.name)
        candidates.push(full)
        next.push(full)
      }
    }
    level = next
  }
  let best = ''
  let bestCount = -1
  let bestDepth = -1
  for (const candidate of candidates) {
    const count = countSessions(candidate)
    const depth = candidate.split(path.sep).length
    if (count > bestCount || (count === bestCount && count > 0 && depth > bestDepth)) {
      best = candidate
      bestCount = count
      bestDepth = depth
    }
  }
  return bestCount > 0 ? best : ''
}

function mapTerm (term) {
  const t = (term || '').toLowerCase()
  if (!t) {
    return 'xterm-256color'
  }
  if (t === 'xterm' || t === 'xterm-256color' || t.indexOf('xterm') === 0) {
    return t === 'xterm' ? 'xterm-256color' : t
  }
  if (t === 'vt100' || t === 'vt220' || t === 'ansi' || t === 'linux' || t === 'scoansi') {
    return t
  }
  return 'xterm-256color'
}

function mapEncode (codePage) {
  const cp = String(codePage || '').trim()
  return ENCODE_MAP[cp] || 'utf8'
}

function readUInt32 (buf, off) {
  return buf.readUInt32BE(off)
}

function readSshString (buf, off) {
  if (off + 4 > buf.length) {
    return null
  }
  const len = readUInt32(buf, off)
  const start = off + 4
  if (len > buf.length - start) {
    return null
  }
  return { data: buf.subarray(start, start + len), offset: start + len }
}

function sshString (buf) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(buf.length, 0)
  return Buffer.concat([len, buf])
}

function u32 (value) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(value >>> 0, 0)
  return buf
}

function wrapPem (body, label) {
  const lines = body.toString('base64').match(/.{1,70}/g) || []
  return [
    '-----BEGIN ' + label + '-----',
    ...lines,
    '-----END ' + label + '-----',
    ''
  ].join('\n')
}

/**
 * Xshell writes RSA/ECDSA/Ed25519 keys in its own "NSSSH" container: a
 * comment line, the SSH public key blob and one binary payload holding both
 * the OpenSSH public blob and the private scalar. Converting it to OpenSSH
 * format keeps key based sessions working after import.
 *
 * @returns {{name: string, type: string, comment: string, publicKey: string,
 *   privateKey: string, encrypted: boolean, unsupported: boolean}}
 */
function parseNsshKey (text, name) {
  const result = {
    name,
    type: '',
    comment: '',
    publicKey: '',
    privateKey: '',
    encrypted: false,
    unsupported: false
  }
  const lines = text.split(/\r?\n/)
  const begin = lines.findIndex(l => /BEGIN NSSSH PRIVATE KEY/i.test(l))
  const end = lines.findIndex(l => /END NSSSH PRIVATE KEY/i.test(l))
  if (begin < 0 || end < 0 || end <= begin) {
    result.unsupported = true
    return result
  }
  const head = lines.slice(begin + 1, end)
  for (const line of head) {
    const comment = line.match(/^Comment:\s*(.*)$/i)
    if (comment) {
      result.comment = comment[1].trim()
    }
    const key = line.match(/^Key:\s*\d+\s*,\s*(\S+)/i)
    if (key) {
      result.type = key[1]
    }
  }
  const payload = head.filter(l => !/^\s*(Comment|Key):/i.test(l)).join('')
  let all
  try {
    all = Buffer.from(payload, 'base64')
  } catch (e) {
    result.unsupported = true
    return result
  }
  // the SSH public key blob is stored in front of the NSSSH payload
  const keyType = readSshString(all, 0)
  const pub = keyType ? readSshString(all, keyType.offset) : null
  if (!keyType || !pub) {
    result.unsupported = true
    return result
  }
  const rest = all.subarray(pub.offset)
  if (rest.subarray(0, 13).toString('binary') !== 'nsssh-key-v6\0') {
    result.unsupported = true
    return result
  }
  let off = 13
  const cipher = readSshString(rest, off)
  if (!cipher) {
    result.unsupported = true
    return result
  }
  off = cipher.offset
  const kdf = readSshString(rest, off)
  off = kdf ? kdf.offset : off
  // unknown number of key derivation arguments; skip none of them for the
  // common `none/none` case and bail out on anything else
  if (cipher.data.toString() !== 'none') {
    result.encrypted = true
    result.unsupported = true
    return result
  }
  if (kdf && kdf.data.toString() !== 'none') {
    result.unsupported = true
    return result
  }
  if (off + 4 > rest.length) {
    result.unsupported = true
    return result
  }
  off += 4 // key derivation argument count, always 0 for unencrypted keys
  const nkeys = readUInt32(rest, off)
  off += 4
  if (nkeys !== 1) {
    result.unsupported = true
    return result
  }
  const blob = readSshString(rest, off)
  if (!blob || blob.data.length < 8) {
    result.unsupported = true
    return result
  }
  const check1 = readUInt32(blob.data, 0)
  const check2 = readUInt32(blob.data, 4)
  const secret = readSshString(blob.data, 8)
  if (!secret) {
    result.unsupported = true
    return result
  }
  const type = result.type || keyType.data.toString()
  // only key types whose private payload is a single scalar are supported
  if (type === 'ssh-rsa' || type === 'ssh-dss') {
    result.unsupported = true
    return result
  }
  // ed25519 stores `seed || publicKey`, which OpenSSH insists on being 64 bytes
  if (type === 'ssh-ed25519' && secret.data.length !== 64) {
    result.unsupported = true
    return result
  }
  const priv = Buffer.concat([
    u32(check1),
    u32(check2),
    sshString(Buffer.from(type)),
    sshString(pub.data),
    sshString(secret.data),
    sshString(Buffer.from(result.comment))
  ])
  let pad = 1
  let padded = priv
  while (padded.length % 8 !== 0) {
    padded = Buffer.concat([padded, Buffer.from([pad++])])
  }
  const pubBlob = Buffer.concat([
    sshString(Buffer.from(type)),
    sshString(pub.data)
  ])
  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'binary'),
    sshString(Buffer.from('none')),
    sshString(Buffer.from('none')),
    sshString(Buffer.alloc(0)),
    u32(1),
    sshString(pubBlob),
    sshString(padded)
  ])
  result.privateKey = wrapPem(body, 'OPENSSH PRIVATE KEY')
  const pubBody = pubBlob
  result.publicKey = type + ' ' + pubBody.toString('base64') +
    (result.comment ? ' ' + result.comment : '')
  return result
}

/**
 * Convert a `.xts` backup (ZIP with Xshell data folder layout) into a
 * temporary directory so the normal directory importer can read it.
 */
function extractArchive (file) {
  let buf
  try {
    buf = fs.readFileSync(file)
  } catch (e) {
    return { dir: '', error: 'cannot read archive: ' + e.message }
  }
  if (buf.length > MAX_EXTRACT_BYTES) {
    return { dir: '', error: 'archive too large' }
  }
  let entries
  try {
    entries = zipRead.listEntries(buf)
  } catch (e) {
    return { dir: '', error: 'not a valid .xts archive: ' + e.message }
  }
  const dir = path.join(os.tmpdir(), EXTRACT_DIR_PREFIX + shortHash(file + ':' + buf.length))
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    zipRead.extractTo(buf, entries, dir)
  } catch (e) {
    return { dir: '', error: 'cannot extract archive: ' + e.message }
  }
  return { dir, error: '' }
}

function findKeyDirs (bases) {
  const found = new Set()
  const probes = [
    path.join('SECSH', 'UserKeys'),
    path.join('com', 'SECSH', 'UserKeys'),
    'UserKeys'
  ]
  for (const base of bases) {
    for (const probe of probes) {
      const dir = path.join(base, probe)
      try {
        if (fs.statSync(dir).isDirectory()) {
          found.add(path.resolve(dir))
        }
      } catch (e) {
        // not there
      }
    }
  }
  return [...found]
}

function loadKeys (keyDirs) {
  const keys = []
  const stats = { total: 0, imported: 0, encrypted: 0, unsupported: 0 }
  const seen = new Set()
  for (const dir of keyDirs) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }
      const full = path.join(dir, entry.name)
      let text
      try {
        text = fs.readFileSync(full, 'utf8')
      } catch (e) {
        continue
      }
      if (text.indexOf('NSSSH PRIVATE KEY') < 0) {
        continue
      }
      stats.total++
      const name = entry.name.replace(/\.pri$/i, '')
      const key = parseNsshKey(text, name)
      if (key.encrypted) {
        stats.encrypted++
        continue
      }
      if (key.unsupported || !key.privateKey) {
        stats.unsupported++
        continue
      }
      if (seen.has(key.publicKey)) {
        continue
      }
      seen.add(key.publicKey)
      stats.imported++
      keys.push(key)
    }
  }
  return { keys, stats }
}

function findKey (keys, name) {
  if (!name) {
    return null
  }
  const wanted = name.trim().toLowerCase()
  const direct = keys.find(k => k.name.toLowerCase() === wanted)
  if (direct) {
    return direct
  }
  // Xshell may store the key file with the full user name or a suffix
  return keys.find(k => k.name.toLowerCase().indexOf(wanted) === 0) || null
}

function buildBookmark (session, identity, keys) {
  const ini = readIni(session.filePath)
  if (!ini) {
    return null
  }
  const connection = ini.CONNECTION || {}
  const auth = ini['CONNECTION:AUTHENTICATION'] || {}
  const ssh = ini['CONNECTION:SSH'] || {}
  const terminal = ini.TERMINAL || {}
  const windowOpts = ini['TERMINAL:WINDOW'] || {}
  const ftp = ini['CONNECTION:FTP'] || {}

  const protocol = (connection.Protocol || 'SSH').toUpperCase()
  const type = TYPE_MAP[protocol]
  if (!type) {
    return { unsupported: true, protocol, title: session.title }
  }
  const host = connection.Host || ''
  if (!host) {
    return { unsupported: true, protocol, title: session.title }
  }
  const port = Number(connection.Port) || DEFAULT_PORTS[type]
  const username = auth.UserName || ''
  const decrypted = type === 'ssh' || type === 'telnet'
    ? decryptPassword(auth.Password, identity.candidates)
    : { password: '', status: 'empty' }

  const userKey = (auth.UserKey || '').trim()
  const key = type === 'ssh' ? findKey(keys, userKey) : null

  const descriptionParts = []
  if (connection.Description) {
    descriptionParts.push(connection.Description)
  }
  if (userKey) {
    if (key) {
      descriptionParts.push('Xshell 密钥已导入: ' + key.name + ' (' + key.type + ')')
    } else {
      descriptionParts.push('Xshell 密钥: ' + userKey + ' (未在备份中找到, 请手动选择私钥)')
    }
  }
  if (decrypted.status === 'locked') {
    descriptionParts.push('密码由 Xshell 主密码保护, 导入后需在 b-shell 中重新输入')
  }
  descriptionParts.push('从 Xshell 导入: ' + session.relPath)

  const bookmark = {
    id: BOOKMARK_PREFIX + shortHash(session.relPath),
    title: session.title,
    host,
    port,
    username,
    type,
    description: descriptionParts.join('\n'),
    term: mapTerm(terminal.Type),
    encode: mapEncode(terminal.CodePage),
    color: type === 'ssh' ? '#0088cc' : undefined,
    enableSftp: true,
    passwordStatus: decrypted.status,
    xshellPath: session.relPath,
    xshellUserKey: userKey || undefined,
    folderPath: path.dirname(session.relPath) === '.' ? '' : path.dirname(session.relPath)
  }
  if (decrypted.password) {
    bookmark.password = decrypted.password
  }

  if (type === 'ssh') {
    const wantsKey = !!userKey && !auth.Password
    bookmark.useSshAgent = auth.UseAuthAgent === '1'
    bookmark.agentForward = ssh.AgentForwarding === '1'
    bookmark.x11 = ssh.ForwardX11 === '1'
    if (key) {
      // a converted key always wins: Xshell used it for this session
      bookmark.authType = 'privateKey'
      bookmark.privateKey = key.privateKey
    } else if (wantsKey) {
      bookmark.authType = 'privateKey'
    } else if (bookmark.useSshAgent) {
      bookmark.authType = 'password'
    } else {
      bookmark.authType = 'password'
    }
    if (ssh.InitRemoteDirectory && ssh.InitRemoteDirectory !== 'None') {
      bookmark.startDirectory = ssh.InitRemoteDirectory
    }
    if (ftp.Passive === '1') {
      bookmark.enableSftp = true
    }
  }

  if (type === 'telnet') {
    bookmark.loginPrompt = auth.TelnetLoginPrompt || ''
    bookmark.passwordPrompt = auth.TelnetPasswordPrompt || ''
  }

  if (windowOpts.ColorScheme) {
    bookmark.xshellColorScheme = windowOpts.ColorScheme
  }
  if (windowOpts.FontFace) {
    bookmark.xshellFont = windowOpts.FontFace + ' ' + (windowOpts.FontSize || '')
  }

  return bookmark
}

function buildGroups (root, bookmarks) {
  const groups = [{
    id: ROOT_GROUP_ID,
    title: 'Xshell',
    parentId: null,
    path: ''
  }]
  const byPath = { '': ROOT_GROUP_ID }
  for (const bookmark of bookmarks) {
    const folderPath = bookmark.folderPath
    if (!folderPath) {
      bookmark.xshellGroupId = ROOT_GROUP_ID
      continue
    }
    if (byPath[folderPath]) {
      bookmark.xshellGroupId = byPath[folderPath]
      continue
    }
    const parts = folderPath.split(path.sep)
    let parentPath = ''
    for (const part of parts) {
      const nextPath = parentPath ? parentPath + path.sep + part : part
      if (!byPath[nextPath]) {
        const id = GROUP_PREFIX + shortHash('xshell/' + nextPath)
        groups.push({
          id,
          title: part,
          parentId: byPath[parentPath],
          path: nextPath
        })
        byPath[nextPath] = id
      }
      parentPath = nextPath
    }
    bookmark.xshellGroupId = byPath[folderPath]
  }
  return groups
}

function statIsDir (p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch (e) {
    return false
  }
}

/**
 * Locate the session tree to import.
 * @returns {{root: string, source: {type: string, path: string}, error: string}}
 */
function resolveSessionsRoot (explicitRoot) {
  if (explicitRoot) {
    if (statIsDir(explicitRoot)) {
      return {
        root: explicitRoot,
        source: { type: 'dir', path: explicitRoot },
        error: ''
      }
    }
    if (ARCHIVE_EXT_RE.test(explicitRoot) || zipRead.isZip(explicitRoot)) {
      const extracted = extractArchive(explicitRoot)
      if (!extracted.dir) {
        return { root: '', source: { type: 'archive', path: explicitRoot }, error: extracted.error }
      }
      return {
        root: extracted.dir,
        source: { type: 'archive', path: explicitRoot },
        error: ''
      }
    }
    return {
      root: '',
      source: { type: 'unknown', path: explicitRoot },
      error: 'path does not exist'
    }
  }
  for (const candidate of getPossibleRoots()) {
    if (statIsDir(candidate)) {
      return { root: candidate, source: { type: 'dir', path: candidate }, error: '' }
    }
  }
  return { root: '', source: { type: 'none', path: '' }, error: '' }
}

/**
 * Read the Xshell backup descriptor (`xts.zcf`) when present. It records
 * whether the archive was written with a master password, which is what makes
 * stored session passwords unreadable.
 * @returns {{masterPassword: boolean|null, version: string}}
 */
function readArchiveMeta (bases) {
  for (const base of bases) {
    const zcf = path.join(base, 'xts.zcf')
    let stat
    try {
      stat = fs.statSync(zcf)
    } catch (e) {
      continue
    }
    if (!stat.isFile()) {
      continue
    }
    const ini = readIni(zcf)
    if (!ini) {
      continue
    }
    const info = ini.SESSIONINFO || {}
    return {
      masterPassword: String(info.Master || '0') === '1',
      version: String(info.Version || '')
    }
  }
  return { masterPassword: null, version: '' }
}

function loadXshellSessions (opts = {}) {
  const explicitRoot = opts && typeof opts.root === 'string' ? opts.root.trim() : ''
  const resolved = resolveSessionsRoot(explicitRoot)
  if (!resolved.root) {
    return {
      root: '',
      roots: [],
      source: resolved.source,
      error: resolved.error,
      identity: { username: getIdentity().username, canDecrypt: false },
      stats: emptyStats(),
      groups: [],
      bookmarks: [],
      unsupported: [],
      keys: [],
      keyStats: { total: 0, imported: 0, encrypted: 0, unsupported: 0 },
      meta: { masterPassword: false }
    }
  }
  const base = resolved.root
  const sessionsRoot = findSessionsRoot(base) || base
  const files = []
  walkSessions(sessionsRoot, sessionsRoot, files)
  const identity = getIdentity()

  const keyDirs = findKeyDirs(keySearchBases(sessionsRoot).concat([base]))
  const loaded = loadKeys(keyDirs)
  const keys = loaded.keys

  const bookmarks = []
  const unsupported = []
  const stats = emptyStats()
  const seen = new Set()
  for (const file of files) {
    stats.sessions++
    const built = buildBookmark(file, identity, keys)
    if (!built) {
      continue
    }
    if (built.unsupported) {
      stats.unsupported++
      unsupported.push({ title: built.title, protocol: built.protocol })
      continue
    }
    if (seen.has(built.id)) {
      continue
    }
    seen.add(built.id)
    if (built.type === 'ssh') {
      stats.ssh++
    } else if (built.type === 'telnet') {
      stats.telnet++
    } else {
      stats.other++
    }
    if (built.passwordStatus === 'ok') {
      stats.withPassword++
    } else if (built.passwordStatus === 'locked') {
      stats.lockedPassword++
    }
    if (built.privateKey) {
      stats.withKey++
    }
    bookmarks.push(built)
  }
  stats.imported = bookmarks.length
  const groups = buildGroups(sessionsRoot, bookmarks)
  const archiveMeta = readArchiveMeta(keySearchBases(sessionsRoot).concat([base]))
  return {
    root: sessionsRoot,
    roots: [sessionsRoot],
    source: resolved.source,
    error: '',
    identity: {
      username: identity.username,
      canDecrypt: identity.candidates.length > 0
    },
    stats,
    groups,
    bookmarks,
    unsupported,
    keys: keys.map(k => ({
      name: k.name,
      type: k.type,
      comment: k.comment,
      publicKey: k.publicKey
    })),
    keyStats: loaded.stats,
    meta: {
      // true when the backup was written with an Xshell master password;
      // sessions the running account cannot decrypt are counted separately
      masterPassword: archiveMeta.masterPassword,
      archiveVersion: archiveMeta.version,
      lockedPasswords: stats.lockedPassword
    }
  }
}

function emptyStats () {
  return {
    sessions: 0,
    imported: 0,
    ssh: 0,
    telnet: 0,
    other: 0,
    withPassword: 0,
    lockedPassword: 0,
    withKey: 0,
    unsupported: 0
  }
}

module.exports = {
  loadXshellSessions,
  decryptPassword,
  parseIni,
  decodeBuffer,
  getPossibleRoots,
  getIdentity,
  parseNsshKey,
  extractArchive,
  findSessionsRoot
}
