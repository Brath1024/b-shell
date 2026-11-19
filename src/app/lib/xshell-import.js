/**
 * Xshell session importer.
 *
 * Reads NetSarang Xshell session files (`.xsh`, INI format, UTF-8 / UTF-16 /
 * GBK) from the folders Xshell itself uses, turns every session into a
 * b-shell bookmark payload and rebuilds the Xshell folder tree as bookmark
 * groups.
 *
 * Password fields in Xshell sessions are RC4 encrypted with a key derived
 * from the Windows SID and the account name (one SHA-256 check value is stored
 * with every password, so a wrong key is detected instead of producing
 * garbage). Sessions protected by an Xshell master password cannot be
 * decrypted here and come back with `passwordStatus: 'locked'`, so the UI can
 * ask the user to type those passwords once.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

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

function buildBookmark (session, identity) {
  const ini = readIni(session.filePath)
  if (!ini) {
    return null
  }
  const connection = ini['CONNECTION'] || {}
  const auth = ini['CONNECTION:AUTHENTICATION'] || {}
  const ssh = ini['CONNECTION:SSH'] || {}
  const terminal = ini['TERMINAL'] || {}
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

  const descriptionParts = []
  if (connection.Description) {
    descriptionParts.push(connection.Description)
  }
  const userKey = auth.UserKey || ''
  if (userKey) {
    descriptionParts.push('Xshell 密钥: ' + userKey)
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
    folderPath: path.dirname(session.relPath) === '.' ? '' : path.dirname(session.relPath)
  }
  if (decrypted.password) {
    bookmark.password = decrypted.password
  }

  if (type === 'ssh') {
    bookmark.authType = auth.UseAuthAgent === '1'
      ? 'password'
      : (auth.UserKey && !auth.Password ? 'privateKey' : 'password')
    bookmark.useSshAgent = auth.UseAuthAgent === '1'
    bookmark.agentForward = ssh.AgentForwarding === '1'
    bookmark.x11 = ssh.ForwardX11 === '1'
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

function loadXshellSessions (opts = {}) {
  const explicitRoot = opts && typeof opts.root === 'string' ? opts.root : ''
  const roots = explicitRoot ? [explicitRoot] : getPossibleRoots()
  let root = ''
  const files = []
  for (const candidate of roots) {
    let stat
    try {
      stat = fs.statSync(candidate)
    } catch (e) {
      continue
    }
    if (!stat.isDirectory()) {
      continue
    }
    const found = []
    walkSessions(candidate, candidate, found)
    if (!root) {
      root = candidate
    }
    if (found.length) {
      files.push(...found.map(f => ({ ...f, root: candidate })))
    }
  }
  const identity = getIdentity()
  const bookmarks = []
  const unsupported = []
  const stats = {
    sessions: 0,
    imported: 0,
    ssh: 0,
    telnet: 0,
    other: 0,
    withPassword: 0,
    lockedPassword: 0,
    unsupported: 0
  }
  const seen = new Set()
  for (const file of files) {
    stats.sessions++
    const built = buildBookmark(file, identity)
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
    bookmarks.push(built)
  }
  stats.imported = bookmarks.length
  const groups = buildGroups(root, bookmarks)
  return {
    root,
    roots: [...new Set(files.map(f => f.root))],
    identity: {
      username: identity.username,
      canDecrypt: identity.candidates.length > 0
    },
    stats,
    groups,
    bookmarks,
    unsupported
  }
}

module.exports = {
  loadXshellSessions,
  decryptPassword,
  parseIni,
  decodeBuffer,
  getPossibleRoots,
  getIdentity
}
