/**
 * check latest release for update warn
 */

import fetch from './fetch-from-server'
import {
  baseUpdateCheckUrls, packInfo
} from './constants'
import dayjs from 'dayjs'

async function fetchData (url, options) {
  const data = {
    action: 'fetch',
    options: {
      ...options,
      url,
      timeout: 15000
    },
    proxy: window.store.getProxySetting()
  }
  return fetch(data)
}

function getInfo (url) {
  const n = Date.now()
  const tail = url.includes('?') ? '&_=' + n : '?_=' + n
  return fetchData(url + tail, {
    action: 'get-update-info',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36'
    },
    timeout: 1000 * 60 * 5
  })
    .catch(() => {
      return null
    })
}

/**
 * Try every configured release feed base url until one answers.
 * `suffix` must start with '/'.
 */
async function getInfoFromSources (suffix) {
  for (const base of baseUpdateCheckUrls) {
    const res = await getInfo(`${base}${suffix}`)
    if (res) {
      return res
    }
  }
}

export async function getLatestReleaseVersion (n) {
  let q = ''
  if (n) {
    const { store } = window
    const info = {
      load_time: store.loadTime,
      bookmark_count: store.bookmarks.length,
      lang: store.config.language,
      sync_with_github: !!store.config.syncSetting?.githubGistId,
      sync_with_gitee: !!store.config.syncSetting?.giteeGistId,
      version: packInfo.version,
      installSrc: store.installSrc,
      n: Date.now()
    }
    q = Object.keys(info).reduce((p, k, i) => {
      const pre = i ? '&' : '?'
      return p + pre + k + '=' + encodeURIComponent(info[k])
    }, '')
  }
  const versionFile = window.et.versionFile || 'version.html'
  const tagName = await getInfoFromSources(`/${versionFile}${q}`)
  if (tagName) {
    return {
      tag_name: tagName
    }
  }
}

/**
 * b-shell ships releases on Gitee only, without third-party mirrors, so the
 * download always points at the asset url that the release feed reports.
 * `mirror` is kept in the signature for callers that still pass it.
 */
export function getDownloadUrl (browserDownloadUrl, mirror) {
  return browserDownloadUrl || ''
}

export async function getLatestReleaseInfo () {
  const { installSrc } = window.store
  const src = installSrc ? '?src=' + encodeURIComponent(installSrc) : ''
  const res = await getInfoFromSources(`/data/bshell-github-release.json${src}`)
  if (!res?.release) {
    return undefined
  }
  const asset = (res.release.assets || []).find(r => r.name.includes(installSrc))
  return {
    body: res.release.body,
    date: dayjs(res.release.published_at).format('YYYY-MM-DD'),
    browserDownloadUrl: asset ? asset.browser_download_url : ''
  }
}
