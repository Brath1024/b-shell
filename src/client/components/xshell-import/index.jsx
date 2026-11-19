/**
 * One-click import of existing Xshell sessions.
 *
 * The Xshell session files live in
 *   %USERPROFILE%\Documents\NetSarang Computer\<version>\Xshell\Sessions
 * and the main process (`src/app/lib/xshell-import.js`) already turns them into
 * bookmark payloads and bookmark groups. This dialog only shows what was found,
 * lets the user point at another folder and decides whether decrypted passwords
 * should be written into b-shell.
 */
import { useState, useEffect } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Space,
  Spin,
  Tag
} from 'antd'
import {
  FileZipOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  WindowsOutlined
} from '@ant-design/icons'
import Modal from '../common/modal'
import { notification } from '../common/notification'
import './xshell-import.styl'

const DICT = {
  title: ['从 Xshell 导入', 'Import from Xshell'],
  intro: [
    '读取 Xshell 的会话文件(.xsh)，或直接读取 Xshell 备份文件(.xts)，把主机、端口、用户名、密码、私钥和目录结构一次性导入 b-shell。已存在的会话会自动跳过，可以重复导入。',
    'Reads Xshell session files (.xsh) or a full Xshell backup (.xts) and imports hosts, ports, user names, passwords, private keys and the folder tree at once. Existing sessions are skipped, so the import can be re-run safely.'
  ],
  rootPlaceholder: [
    'Xshell 会话目录或备份文件(.xts)，例如 C:\\Users\\you\\Documents\\NetSarang Computer\\8\\Xshell\\Sessions',
    'Xshell sessions folder or backup file (.xts), e.g. C:\\Users\\you\\Documents\\NetSarang Computer\\8\\Xshell\\Sessions'
  ],
  pickArchive: ['选择备份文件', 'Pick backup'],
  archiveTitle: ['选择 Xshell 备份文件', 'Choose an Xshell backup file'],
  rescan: ['重新扫描', 'Rescan'],
  scanning: ['正在扫描 Xshell 会话...', 'Scanning Xshell sessions...'],
  found: ['发现 {n} 个会话', '{n} sessions found'],
  sshCount: ['SSH {n}', 'SSH {n}'],
  passwordOk: ['密码已解密 {n}', 'Passwords decrypted {n}'],
  passwordLocked: ['需重新输入密码 {n}', 'Passwords to re-enter {n}'],
  passwordOkShort: ['密码已解密', 'password saved'],
  passwordLockedShort: ['需重录密码', 'password needed'],
  keyImported: ['密钥已导入 {n}', 'Keys imported {n}'],
  keyEncrypted: ['密钥已加密 {n}', 'Encrypted keys {n}'],
  keyTag: ['私钥', 'private key'],
  keyMissing: ['缺私钥', 'key missing'],
  keyMissingWarn: [
    '有 {n} 个会话使用 Xshell 私钥，但私钥文件不在备份里(或已被口令加密)，导入后需要手动补充私钥。',
    '{n} sessions use an Xshell private key that is missing from the backup (or encrypted with a passphrase). Add the key manually after import.'
  ],
  archiveLabel: ['备份文件: ', 'Backup: '],
  scanFailed: ['读取失败: ', 'Cannot read: '],
  unsupported: ['暂不支持 {n}', 'Unsupported {n}'],
  lockedWarn: [
    '有 {n} 个会话的密码被 Xshell 主密码保护，b-shell 无法解密，导入后首次连接时需要重新输入密码。',
    '{n} sessions are protected by an Xshell master password and cannot be decrypted. Type their passwords once on the first connection.'
  ],
  unsupportedList: ['暂不支持导入的会话: ', 'Not imported: '],
  noSession: [
    '没有找到 Xshell 会话文件',
    'No Xshell session file found'
  ],
  guide1: [
    '请在 Xshell 中确认会话已保存，或在上面的输入框填入会话目录/备份文件后重新扫描。',
    'Save some sessions in Xshell, or fill in the sessions folder / backup file above and rescan.'
  ],
  guide2: [
    '默认扫描位置: 文档\\NetSarang Computer\\<版本>\\Xshell\\Sessions',
    'Default locations: Documents\\NetSarang Computer\\<version>\\Xshell\\Sessions'
  ],
  guide3: [
    '也可以用环境变量 XSHELL_SESSION_PATH 指定目录(多个目录用分号分隔)。',
    'You can also set the XSHELL_SESSION_PATH environment variable (several folders separated by semicolons).'
  ],
  guide4: [
    '换电脑时点「选择备份文件」导入 Xshell 备份(.xts)即可，密码和私钥会一起迁移。',
    'Moving to another machine? Use "Pick backup" and import the Xshell .xts backup with passwords and keys included.'
  ],
  includePassword: ['导入密码(本地解密)', 'Import passwords (decrypted locally)'],
  includePasswordHint: [
    '密码只写入本机 b-shell 数据目录，不会上传。',
    'Passwords are stored in the local b-shell data folder only.'
  ],
  importBtn: ['一键导入', 'Import'],
  importing: ['导入中...', 'Importing...'],
  cancel: ['取消', 'Cancel'],
  doneTitle: ['Xshell 导入完成', 'Xshell import finished'],
  doneDesc: [
    '新增 {added} 个会话，跳过 {skipped} 个已存在的会话。',
    'Added {added} sessions, skipped {skipped} existing sessions.'
  ]
}

function txt (key) {
  let lang = 'en_us'
  try {
    lang = (window.getLang && window.getLang()) ||
      (window.store && window.store.config && window.store.config.language) ||
      'en_us'
  } catch (e) {
    lang = 'en_us'
  }
  const pair = DICT[key] || DICT.title
  return /^zh/i.test(lang) ? pair[0] : pair[1]
}

function fill (key, values) {
  let text = txt(key)
  Object.keys(values).forEach(name => {
    text = text.split('{' + name + '}').join(String(values[name]))
  })
  return text
}

export default function XshellImportModal (props) {
  const { open, onClose } = props
  const { store } = window
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [root, setRoot] = useState('')
  const [includePassword, setIncludePassword] = useState(true)

  const scan = async (target = '') => {
    setLoading(true)
    const res = await store.loadXshellSessions(
      target && target.trim() ? { root: target.trim() } : {}
    )
    setLoading(false)
    if (!res) {
      return
    }
    setData(res)
    if (!target && res.root) {
      setRoot(res.root)
    }
  }

  const pickArchive = async () => {
    try {
      const files = await window.api.openDialog({
        title: txt('archiveTitle'),
        properties: [
          'openFile',
          'showHiddenFiles',
          'dontAddToRecent'
        ],
        filters: [{
          name: 'Xshell backup',
          extensions: ['xts', 'zip']
        }]
      })
      const file = Array.isArray(files) && files.length ? files[0] : ''
      if (!file) {
        return
      }
      setRoot(file)
      await scan(file)
    } catch (e) {
      window.store.onError(e)
    }
  }

  useEffect(() => {
    if (open) {
      scan(root)
    }
  }, [open])

  const handleImport = () => {
    if (!data || !data.bookmarks.length) {
      return
    }
    const res = store.importXshellSessions(data, { includePassword })
    notification.success({
      message: txt('doneTitle'),
      description: fill('doneDesc', {
        added: res.added,
        skipped: res.skipped
      })
    })
    onClose()
  }

  if (!open) {
    return null
  }

  const stats = (data && data.stats) || {}
  const bookmarks = (data && data.bookmarks) || []
  const missingKeys = bookmarks.filter(
    item => item.xshellUserKey && !item.privateKey
  ).length
  const groups = {}
  if (data && Array.isArray(data.groups)) {
    data.groups.forEach(g => {
      groups[g.id] = g
    })
  }
  const groupPath = (bookmark) => {
    const names = []
    let group = groups[bookmark.xshellGroupId]
    let guard = 0
    while (group && guard < 20) {
      if (group.path) {
        names.unshift(group.title)
      }
      group = groups[group.parentId]
      guard++
    }
    return names.join(' / ')
  }
  const renderStatus = (bookmark) => {
    if (bookmark.privateKey) {
      return <Tag color='geekblue'>{txt('keyTag')}</Tag>
    }
    if (bookmark.xshellUserKey) {
      return <Tag color='red'>{txt('keyMissing')}</Tag>
    }
    if (bookmark.passwordStatus === 'ok') {
      return <Tag color='green'>{txt('passwordOkShort')}</Tag>
    }
    if (bookmark.passwordStatus === 'locked') {
      return <Tag color='orange'>{txt('passwordLockedShort')}</Tag>
    }
    return null
  }
  const renderList = () => {
    if (!bookmarks.length) {
      return (
        <Empty
          description={
            <div className='xshell-empty'>
              <div>{txt('noSession')}</div>
              <div>{txt('guide1')}</div>
              <div>{txt('guide2')}</div>
              <div>{txt('guide3')}</div>
              <div>{txt('guide4')}</div>
            </div>
          }
        />
      )
    }
    return (
      <div className='xshell-session-list'>
        {
          bookmarks.map(item => {
            const path = groupPath(item)
            return (
              <div className='xshell-session-row' key={item.id}>
                <div className='xshell-session-main'>
                  <span className='xshell-session-title'>{item.title}</span>
                  <span className='xshell-session-host'>
                    {(item.username ? item.username + '@' : '') + item.host + ':' + item.port}
                  </span>
                  {
                    path
                      ? <Tag className='xshell-session-group'>{path}</Tag>
                      : null
                  }
                  {renderStatus(item)}
                </div>
              </div>
            )
          })
        }
      </div>
    )
  }

  const modProps = {
    title: txt('title'),
    footer: null,
    open: true,
    onCancel: onClose,
    width: '70%'
  }

  return (
    <Modal {...modProps}>
      <Spin spinning={loading} tip={txt('scanning')}>
        <div className='xshell-import'>
          <div className='xshell-import-intro'>{txt('intro')}</div>
          <Space.Compact className='xshell-import-path'>
            <Input
              value={root}
              onChange={e => setRoot(e.target.value)}
              placeholder={txt('rootPlaceholder')}
              prefix={<FolderOpenOutlined />}
              allowClear
            />
            <Button
              icon={<FileZipOutlined />}
              onClick={pickArchive}
              disabled={loading}
              title={txt('pickArchive')}
            >
              {txt('pickArchive')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => scan(root)}
              disabled={loading}
            >
              {txt('rescan')}
            </Button>
          </Space.Compact>
          {
            data && data.error
              ? (
                <Alert
                  type='error'
                  showIcon
                  className='mg1b'
                  message={txt('scanFailed') + data.error}
                />
                )
              : null
          }
          {
            data && data.source && data.source.type === 'archive'
              ? (
                <div className='xshell-import-source'>
                  {txt('archiveLabel') + data.source.path}
                </div>
                )
              : null
          }
          {
            data && stats.sessions > 0
              ? (
                <div className='xshell-import-stats'>
                  <Tag color='blue'>
                    {fill('found', { n: stats.sessions })}
                  </Tag>
                  <Tag>{fill('sshCount', { n: stats.ssh })}</Tag>
                  {
                    stats.withPassword
                      ? <Tag color='green'>{fill('passwordOk', { n: stats.withPassword })}</Tag>
                      : null
                  }
                  {
                    stats.lockedPassword
                      ? <Tag color='orange'>{fill('passwordLocked', { n: stats.lockedPassword })}</Tag>
                      : null
                  }
                  {
                    stats.withKey
                      ? <Tag color='geekblue'>{fill('keyImported', { n: stats.withKey })}</Tag>
                      : null
                  }
                  {
                    data.keyStats && data.keyStats.encrypted
                      ? <Tag color='orange'>{fill('keyEncrypted', { n: data.keyStats.encrypted })}</Tag>
                      : null
                  }
                  {
                    stats.unsupported
                      ? <Tag>{fill('unsupported', { n: stats.unsupported })}</Tag>
                      : null
                  }
                </div>
                )
              : null
          }
          {
            stats.lockedPassword > 0
              ? (
                <Alert
                  type='warning'
                  showIcon
                  className='mg1b'
                  message={fill('lockedWarn', { n: stats.lockedPassword })}
                />
                )
              : null
          }
          {
            missingKeys > 0
              ? (
                <Alert
                  type='warning'
                  showIcon
                  className='mg1b'
                  message={fill('keyMissingWarn', { n: missingKeys })}
                />
                )
              : null
          }
          {
            data && data.unsupported && data.unsupported.length
              ? (
                <div className='xshell-import-unsupported'>
                  {txt('unsupportedList')}
                  {data.unsupported.map(item => item.title + '(' + item.protocol + ')').join(', ')}
                </div>
                )
              : null
          }
          {renderList()}
          <div className='xshell-import-footer'>
            <div className='xshell-import-password'>
              <Checkbox
                checked={includePassword}
                onChange={e => setIncludePassword(e.target.checked)}
              >
                <WindowsOutlined className='mg1r' />
                {txt('includePassword')}
              </Checkbox>
              <span className='xshell-import-hint'>{txt('includePasswordHint')}</span>
            </div>
            <Space>
              <Button
                type='primary'
                onClick={handleImport}
                disabled={loading || !bookmarks.length}
              >
                {txt('importBtn')}
              </Button>
              <Button onClick={onClose} disabled={loading}>
                {txt('cancel')}
              </Button>
            </Space>
          </div>
        </div>
      </Spin>
    </Modal>
  )
}
