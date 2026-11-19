/**
 * First-run prompt: "your Xshell sessions can move over in one click".
 *
 * Shown on the home screen until the user has either used it or dismissed it,
 * and never again once any imported Xshell session exists. The actual work is
 * done by XshellImportModal: this dialog only explains the feature and forwards
 * a dropped .xts file to it.
 */
import { useEffect, useState } from 'react'
import { Button, Tag } from 'antd'
import {
  FileZipOutlined,
  ImportOutlined,
  WindowsOutlined
} from '@ant-design/icons'
import Modal from '../common/modal'
import XshellImportModal from './index.jsx'
import './quick-import.styl'

const SEEN_KEY = 'bshell.xshellQuickImport.v1'
const DOCS_URL = 'https://gitee.com/Guoqing-Li/b-shell/blob/main/docs/xshell-import.md'

const DICT = {
  title: ['从 Xshell 一键搬家', 'Move your Xshell sessions in one click'],
  lead: [
    'b-shell 支持直接导入 Xshell 的连接配置：会话、分组、密码、私钥，以及 .xts 整包备份。',
    'b-shell imports Xshell connection profiles directly: sessions, folders, passwords, private keys and whole .xts backups.'
  ],
  point1: ['拖入 .xts 备份，或直接选 Xshell 的 Sessions 目录', 'Drop a .xts backup, or point at the Xshell Sessions folder'],
  point2: ['解析后自动写进书签，密码在本机解密', 'Sessions land in your bookmarks right away; passwords are decrypted locally'],
  point3: ['已存在的会话自动跳过，可重复导入', 'Existing sessions are skipped, so you can import again any time'],
  start: ['开始导入', 'Import now'],
  guide: ['查看导出与导入方式', 'See how to export and import'],
  later: ['以后再说', 'Later'],
  drop: ['把 .xts 文件拖到窗口里，松手即导入', 'Drop a .xts file here and it imports right away'],
  dropActive: ['松手，马上解析并写入书签', 'Release to parse it and save the sessions']
}

function txt (key) {
  let lang = 'en_us'
  try {
    const cfg = window.store && window.store.config
    lang = (cfg && cfg.language) || window.initLanguage || 'en_us'
    if (typeof lang !== 'string') {
      lang = 'en_us'
    }
  } catch (e) {
    lang = 'en_us'
  }
  const pair = DICT[key] || DICT.title
  return /^zh/i.test(lang) ? pair[0] : pair[1]
}

const alreadyImported = () => {
  const list = (window.store && window.store.bookmarks) || []
  return list.some(b => String(b.id || '').startsWith('xshell-b-'))
}

export default function XshellQuickImport () {
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [initialFile, setInitialFile] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === '1'
    } catch (e) {
      seen = false
    }
    if (seen || alreadyImported()) {
      return
    }
    setOpen(true)
  }, [])

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch (e) {
      // a read-only localStorage must not keep the dialog alive
    }
    setOpen(false)
    setDragging(false)
  }

  const startImport = (file = '') => {
    dismiss()
    setInitialFile(file)
    setImportOpen(true)
  }

  const onDrop = (evt) => {
    evt.preventDefault()
    evt.stopPropagation()
    setDragging(false)
    const files = evt.dataTransfer && evt.dataTransfer.files
    if (!files || !files.length) {
      return
    }
    const path = window.api && window.api.getPathForFile
      ? window.api.getPathForFile(files[0])
      : ''
    startImport(path || '')
  }

  const onDragOver = (evt) => {
    evt.preventDefault()
    evt.stopPropagation()
    if (!dragging) {
      setDragging(true)
    }
  }

  const footer = (
    <div className='custom-modal-footer-buttons xshell-quick-footer'>
      <Button
        className='custom-modal-cancel-btn'
        onClick={() => window.pre.openExternal(DOCS_URL)}
      >
        {txt('guide')}
      </Button>
      <Button
        type='primary'
        className='custom-modal-ok-btn'
        icon={<ImportOutlined />}
        onClick={() => startImport()}
      >
        {txt('start')}
      </Button>
    </div>
  )

  return (
    <>
      <Modal
        open={open}
        title={txt('title')}
        width={560}
        footer={footer}
        onCancel={dismiss}
        wrapClassName='xshell-quick-modal'
      >
        <div
          className={'xshell-quick' + (dragging ? ' xshell-quick-dragging' : '')}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className='xshell-quick-lead'>
            <WindowsOutlined className='xshell-quick-icon' />
            <span>{txt('lead')}</span>
          </div>
          <div className='xshell-quick-point'>
            <Tag color='cyan'>1</Tag>
            {txt('point1')}
          </div>
          <div className='xshell-quick-point'>
            <Tag color='cyan'>2</Tag>
            {txt('point2')}
          </div>
          <div className='xshell-quick-point'>
            <Tag color='cyan'>3</Tag>
            {txt('point3')}
          </div>
          <div className='xshell-quick-drop'>
            <FileZipOutlined />
            {dragging ? txt('dropActive') : txt('drop')}
          </div>
        </div>
      </Modal>
      <XshellImportModal
        open={importOpen}
        initialFile={initialFile}
        autoImport={!!initialFile}
        onClose={() => setImportOpen(false)}
      />
    </>
  )
}
