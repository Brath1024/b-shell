/**
 * Xshell importer: session parsing, password decryption, private key
 * conversion and `.xts` (zip) archive import.
 *
 * Everything here runs against temporary fixtures, never against the real
 * Xshell data folder of the machine running the tests.
 */

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const importer = require('../../app/lib/xshell-import')
const zipRead = require('../../app/lib/zip-read')

const tmpRoots = []

function tmpDir (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bshell-xshell-test-'))
  tmpRoots.push(dir)
  if (name) {
    const sub = path.join(dir, name)
    fs.mkdirSync(sub, { recursive: true })
    return sub
  }
  return dir
}

after(() => {
  for (const dir of tmpRoots) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function sha256 (buf) {
  return crypto.createHash('sha256').update(buf).digest()
}

// Xshell's own password protection: RC4(SHA256(key)) over the password with
// SHA256(password) appended as a check value.
function encryptPassword (password, key) {
  const rc4 = (k, data) => {
    const S = Buffer.alloc(256)
    for (let i = 0; i < 256; i++) S[i] = i
    let j = 0
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + k[i % k.length]) & 0xff
      const t = S[i]
      S[i] = S[j]
      S[j] = t
    }
    const out = Buffer.alloc(data.length)
    let x = 0
    j = 0
    for (let n = 0; n < data.length; n++) {
      x = (x + 1) & 0xff
      j = (j + S[x]) & 0xff
      const t = S[x]
      S[x] = S[j]
      S[j] = t
      out[n] = data[n] ^ S[(S[x] + S[j]) & 0xff]
    }
    return out
  }
  const plain = Buffer.from(password, 'utf8')
  const payload = rc4(sha256(Buffer.from(key, 'ascii')), plain)
  return Buffer.concat([payload, sha256(plain)]).toString('base64')
}

function sessionIni (opts) {
  const lines = [
    '[CONNECTION]',
    'Host=' + opts.host,
    'Port=' + (opts.port || 22),
    'Protocol=' + (opts.protocol || 'SSH'),
    'Description=' + (opts.description || ''),
    '[CONNECTION:AUTHENTICATION]',
    'UserName=' + (opts.username || 'root'),
    'Password=' + (opts.password || ''),
    'UserKey=' + (opts.userKey || ''),
    'UseAuthAgent=0',
    '[CONNECTION:SSH]',
    'ForwardX11=' + (opts.x11 ? '1' : '0'),
    'AgentForwarding=0',
    'InitRemoteDirectory=' + (opts.startDirectory || ''),
    '[TERMINAL]',
    'Type=xterm',
    'CodePage=' + (opts.codePage || 65001),
    '[TERMINAL:WINDOW]',
    'ColorScheme=XTerm',
    'FontFace=DejaVu Sans Mono',
    'FontSize=11',
    '[CONNECTION:FTP]',
    'Passive=1',
    ''
  ]
  return lines.join('\r\n')
}

function writeSession (dir, name, ini, encoding = 'utf16') {
  const file = path.join(dir, name + '.xsh')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const text = sessionIni(ini)
  if (encoding === 'utf16') {
    fs.writeFileSync(file, Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le')
    ]))
  } else {
    fs.writeFileSync(file, text, 'utf8')
  }
  return file
}

function sshString (buf) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(buf.length, 0)
  return Buffer.concat([len, buf])
}

// Build a NSSSH private key file the way Xshell writes it: an OpenSSH public
// key blob followed by Xshell's own private payload.
function buildNsshKey ({ secret, pub, comment, keyType = 'ssh-ed25519', cipher = 'none' }) {
  const pubBlob = Buffer.concat([
    sshString(Buffer.from(keyType)),
    sshString(pub)
  ])
  const check = crypto.randomBytes(4)
  // Xshell stores the ed25519 private scalar as `seed || publicKey` (64 bytes),
  // exactly like OpenSSH does, so expand a bare 32 byte seed here.
  const scalar = keyType === 'ssh-ed25519' && secret.length === 32
    ? Buffer.concat([secret, pub])
    : secret
  const priv = Buffer.concat([
    check,
    check,
    sshString(scalar),
    sshString(Buffer.from(comment))
  ])
  let padded = priv
  let pad = 1
  while (padded.length % 8 !== 0) {
    padded = Buffer.concat([padded, Buffer.from([pad++])])
  }
  const payload = Buffer.concat([
    Buffer.from('nsssh-key-v6\0', 'binary'),
    sshString(Buffer.from(cipher)),
    sshString(Buffer.from('none')),
    Buffer.alloc(4),
    (() => {
      const n = Buffer.alloc(4)
      n.writeUInt32BE(1, 0)
      return n
    })(),
    sshString(padded)
  ])
  const body = Buffer.concat([pubBlob, payload]).toString('base64')
  const lines = ['---- BEGIN NSSSH PRIVATE KEY ----',
    'Comment: ' + comment,
    'Key: 2, ' + keyType]
  for (let i = 0; i < body.length; i += 60) {
    lines.push(body.slice(i, i + 60))
  }
  lines.push('---- END NSSSH PRIVATE KEY ----', '')
  return lines.join('\r\n')
}

// Minimal zip writer (stored entries) so `.xts` support can be tested without
// keeping a binary fixture in the repository.
function buildZip (files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

function crc32 (buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

describe('xshell-import: decoding and ini parsing', () => {
  it('decodes UTF-16LE, UTF-16BE and UTF-8 session files', () => {
    const text = '[CONNECTION]\r\nHost=example.com\r\n'
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    assert.equal(importer.decodeBuffer(le), text)
    const beBody = Buffer.from(text, 'utf16le')
    beBody.swap16()
    const be = Buffer.concat([Buffer.from([0xfe, 0xff]), beBody])
    assert.equal(importer.decodeBuffer(be), text)
    assert.equal(importer.decodeBuffer(Buffer.from(text, 'utf8')), text)
  })

  it('parses sections and keys', () => {
    const ini = importer.parseIni(sessionIni({ host: 'h1', username: 'u1' }))
    assert.equal(ini.CONNECTION.Host, 'h1')
    assert.equal(ini['CONNECTION:AUTHENTICATION'].UserName, 'u1')
  })
})

describe('xshell-import: password decryption', () => {
  const ids = ['cbaSID', 'abcSID']

  it('decrypts a password with a matching SID layout', () => {
    const encrypted = encryptPassword('s3cret!', 'abcSID')
    const res = importer.decryptPassword(encrypted, ids)
    assert.equal(res.status, 'ok')
    assert.equal(res.password, 's3cret!')
  })

  it('reports locked passwords instead of garbage', () => {
    const encrypted = encryptPassword('s3cret!', 'otherSID')
    const res = importer.decryptPassword(encrypted, ids)
    assert.equal(res.status, 'locked')
    assert.equal(res.password, '')
    assert.deepEqual(importer.decryptPassword('', ids), {
      password: '',
      status: 'empty'
    })
  })
})

describe('xshell-import: private keys', () => {
  it('converts a NSSSH ed25519 key into a usable OpenSSH key', () => {
    const ssh2 = require('@electerm/ssh2')
    const pair = ssh2.utils.generateKeyPairSync('ed25519')
    const secret = crypto.randomBytes(32)
    // derive the public key from the secret so the signature can verify
    const ed = require('crypto').createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        secret
      ]),
      format: 'der',
      type: 'pkcs8'
    })
    const pubDer = require('crypto').createPublicKey(ed).export({
      type: 'spki',
      format: 'der'
    })
    const pub = pubDer.subarray(pubDer.length - 32)
    const text = buildNsshKey({
      secret,
      pub,
      comment: 'user@host'
    })
    const key = importer.parseNsshKey(text, 'testkey')
    assert.equal(key.unsupported, false)
    assert.equal(key.encrypted, false)
    assert.match(key.privateKey, /^-----BEGIN OPENSSH PRIVATE KEY-----/)
    assert.match(key.publicKey, /^ssh-ed25519 /)
    const parsed = ssh2.utils.parseKey(key.privateKey)
    assert.equal(parsed.type, 'ssh-ed25519')
    assert.equal(parsed.comment, 'user@host')
    const data = Buffer.from('b-shell key check')
    assert.equal(parsed.verify(data, parsed.sign(data)), true)
    assert.ok(pair) // keep the import so the dependency is exercised
  })

  it('refuses encrypted or foreign key containers', () => {
    assert.equal(importer.parseNsshKey('not a key', 'x').unsupported, true)
    const text = buildNsshKey({
      secret: crypto.randomBytes(32),
      pub: crypto.randomBytes(32),
      comment: 'c',
      cipher: 'aes256-cbc'
    })
    const key = importer.parseNsshKey(text, 'x')
    assert.equal(key.encrypted, true)
    assert.equal(key.unsupported, true)
  })
})

describe('xshell-import: session tree', () => {
  let root
  before(() => {
    root = tmpDir()
    const sessions = path.join(root, 'Xshell', 'Sessions')
    writeSession(path.join(sessions), 'server-a', {
      host: '10.0.0.1',
      username: 'root',
      password: encryptPassword('pa', 'unknownSID')
    })
    writeSession(path.join(sessions, 'lab'), 'server-b', {
      host: '10.0.0.2',
      username: 'ubuntu',
      codePage: 936,
      x11: true,
      startDirectory: '/opt/app'
    })
    const keySecret = crypto.randomBytes(32)
    const keyPub = crypto.randomBytes(32)
    const keysDir = path.join(root, 'SECSH', 'UserKeys')
    fs.mkdirSync(keysDir, { recursive: true })
    fs.writeFileSync(
      path.join(keysDir, 'lab-key.pri'),
      buildNsshKey({ secret: keySecret, pub: keyPub, comment: 'lab' })
    )
    writeSession(path.join(sessions, 'lab'), 'server-c', {
      host: '10.0.0.3',
      username: 'deploy',
      userKey: 'lab-key'
    })
  })

  it('finds the sessions folder from any parent level', () => {
    const expected = path.join(root, 'Xshell', 'Sessions')
    assert.equal(importer.findSessionsRoot(root), expected)
    assert.equal(importer.findSessionsRoot(path.join(root, 'Xshell')), expected)
  })

  it('imports sessions, groups, passwords and keys', () => {
    const res = importer.loadXshellSessions({ root })
    assert.equal(res.error, '')
    assert.equal(res.source.type, 'dir')
    assert.equal(res.root, path.join(root, 'Xshell', 'Sessions'))
    assert.equal(res.stats.sessions, 3)
    assert.equal(res.stats.imported, 3)
    assert.equal(res.stats.lockedPassword, 1)
    assert.equal(res.stats.withKey, 1)
    assert.equal(res.keyStats.imported, 1)
    const titles = res.bookmarks.map(b => b.title).sort()
    assert.deepEqual(titles, ['server-a', 'server-b', 'server-c'])
    const lab = res.groups.find(g => g.title === 'lab')
    assert.ok(lab)
    const grouped = res.bookmarks.filter(b => b.xshellGroupId === lab.id)
    assert.deepEqual(grouped.map(b => b.title).sort(), ['server-b', 'server-c'])
    const b = res.bookmarks.find(item => item.title === 'server-b')
    assert.equal(b.host, '10.0.0.2')
    assert.equal(b.encode, 'gbk')
    assert.equal(b.x11, true)
    assert.equal(b.startDirectory, '/opt/app')
    const c = res.bookmarks.find(item => item.title === 'server-c')
    assert.equal(c.authType, 'privateKey')
    assert.match(c.privateKey, /BEGIN OPENSSH PRIVATE KEY/)
    assert.equal(c.xshellUserKey, 'lab-key')
    const a = res.bookmarks.find(item => item.title === 'server-a')
    assert.equal(a.passwordStatus, 'locked')
    assert.equal(a.password, undefined)
  })

  it('imports the same tree from a .xts zip backup', () => {
    const zipPath = path.join(tmpDir(), 'xbackup.xts')
    const files = []
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full, prefix + entry.name + '/')
        } else {
          files.push({ name: prefix + entry.name, data: fs.readFileSync(full) })
        }
      }
    }
    walk(root, '')
    files.push({
      name: 'xts.zcf',
      data: '[SessionInfo]\r\nVersion=6.0\r\nClear=0\r\nMaster=0\r\n'
    })
    const zip = buildZip(files)
    fs.writeFileSync(zipPath, zip)
    assert.equal(zipRead.isZip(zipPath), true)
    const entries = zipRead.listEntries(zip)
    assert.ok(entries.some(e => e.name === 'xts.zcf'))
    const res = importer.loadXshellSessions({ root: zipPath })
    assert.equal(res.error, '')
    assert.equal(res.source.type, 'archive')
    assert.equal(res.stats.imported, 3)
    assert.equal(res.stats.withKey, 1)
    assert.equal(res.meta.masterPassword, false)
    assert.equal(res.meta.archiveVersion, '6.0')
  })

  it('reports a readable error for a missing path', () => {
    const res = importer.loadXshellSessions({
      root: path.join(os.tmpdir(), 'bshell-does-not-exist-xyz')
    })
    assert.equal(res.error, 'path does not exist')
    assert.equal(res.bookmarks.length, 0)
    assert.equal(res.stats.sessions, 0)
  })
})

describe('zip-read: safety', () => {
  it('rejects path traversal when extracting', () => {
    const dir = tmpDir()
    const zip = buildZip([
      { name: '../escape.txt', data: 'x' },
      { name: 'ok.txt', data: 'y' }
    ])
    const entries = zipRead.listEntries(zip)
    const written = zipRead.extractTo(zip, entries, dir)
    assert.equal(written, 1)
    assert.equal(fs.existsSync(path.join(dir, 'ok.txt')), true)
    assert.equal(fs.existsSync(path.join(dir, '..', 'escape.txt')), false)
  })
})
