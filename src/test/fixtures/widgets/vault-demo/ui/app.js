/* eslint-env browser */
/* global bshell */
(async () => {
  const $ = (id) => document.getElementById(id)
  const status = (text, cls) => {
    const el = $('status')
    el.className = cls || 'meta'
    el.textContent = text
  }

  const config = await bshell.getConfig()
  $('server').value = config.demoServerUrl || ''

  $('pick').addEventListener('click', async () => {
    const files = await bshell.openDialog({
      properties: ['openFile'],
      filters: [{ name: 'Keys', extensions: ['asc', 'gpg', 'key'] }]
    })
    if (files && files[0]) {
      $('key').value = files[0]
      await bshell.updateConfig({ demoKeyPath: files[0] })
    }
  })

  $('connect').addEventListener('click', async () => {
    try {
      const result = await bshell.call('connect', {
        serverUrl: $('server').value.trim(),
        keyPath: $('key').value
      })
      await bshell.updateConfig({ demoServerUrl: $('server').value.trim() })
      status('connected, fingerprint ' + result.fingerprint, 'ok')
      $('login').style.display = 'none'
      $('search').style.display = 'block'
    } catch (err) {
      status(err.message, 'err')
    }
  })

  $('go').addEventListener('click', async () => {
    try {
      const result = await bshell.call('search', $('query').value)
      render(result.matches)
      status(`scanned ${result.scanned}, matched ${result.matches.length}`)
    } catch (err) {
      status(err.message, 'err')
    }
  })

  $('lock').addEventListener('click', async () => {
    await bshell.call('lock')
    $('login').style.display = 'block'
    $('search').style.display = 'none'
    status('locked')
  })

  async function open (entry, type) {
    const secret = await bshell.call('getSecret', entry.id)
    const url = new URL(entry.uri.includes('://') ? entry.uri : `ssh://${entry.uri}`)
    await bshell.openTab({
      type,
      title: entry.name,
      host: url.hostname,
      port: Number(url.port) || 22,
      username: secret.username,
      password: secret.password,
      authType: 'password'
    })
    status(`opened ${type} ${entry.name}`, 'ok')
  }

  function render (matches) {
    const list = $('results')
    list.innerHTML = ''
    matches.forEach(entry => {
      const li = document.createElement('li')
      const info = document.createElement('div')
      info.innerHTML = `<div>${entry.name}</div><div class="meta">${entry.username} · ${entry.uri}</div>`
      const actions = document.createElement('div')
      const link = document.createElement('a')
      link.textContent = 'SSH'
      link.id = 'open-' + entry.id
      link.addEventListener('click', () => open(entry, 'ssh'))
      actions.appendChild(link)
      li.appendChild(info)
      li.appendChild(actions)
      list.appendChild(li)
    })
  }
})()
