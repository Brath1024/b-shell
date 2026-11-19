/**
 * bookmark
 */

import uid from '../common/uid'

// metadata produced by the Xshell importer that is not part of a bookmark
const XSHELL_META_FIELDS = [
  'passwordStatus',
  'xshellPath',
  'xshellUserKey',
  'folderPath',
  'xshellGroupId',
  'xshellColorScheme',
  'xshellFont'
]

export default Store => {
  Store.prototype.handleGetSerials = async function () {
    const { store } = window
    store.loaddingSerials = true
    const res = await window.pre.runGlobalAsync('listSerialPorts')
      .catch(store.onError)
    if (res) {
      store.serials = res
    }
    store.loaddingSerials = false
  }
  Store.prototype.setBookmarks = function (items) {
    return window.store.setItems('bookmarks', items)
  }

  Store.prototype.openBookmarks = function (ids) {
    const { store } = window
    ids.forEach(id => {
      store.onSelectBookmark(id)
    })
  }

  Store.prototype.addSshConfigs = function (items) {
    const { store } = window

    const bookmarksToAdd = items.map(t => {
      return {
        term: 'xterm-256color',
        id: uid(),
        type: 'ssh',
        color: '#0088cc',
        ...t
      }
    })
    const ids = bookmarksToAdd.map(d => d.id)
    let sshConfigGroup = store.bookmarkGroups.find(d => d.id === 'sshConfig')
    if (!sshConfigGroup) {
      sshConfigGroup = {
        id: 'sshConfig',
        title: 'ssh configs',
        bookmarkIds: ids
      }
      store.addBookmarkGroup(sshConfigGroup)
    } else {
      store.editItem('sshConfig', {
        bookmarkIds: [
          ...ids,
          ...(sshConfigGroup.bookmarkIds || [])
        ]
      }, 'bookmarkGroups')
    }
    return store.addItems(bookmarksToAdd, 'bookmarks')
  }

  // read Xshell sessions from disk in the main process
  Store.prototype.loadXshellSessions = async function (opts = {}) {
    const { store } = window
    store.loadingXshellSessions = true
    try {
      return await window.pre.runGlobalAsync('loadXshellSessions', opts)
    } catch (err) {
      store.onError(err)
      return null
    } finally {
      store.loadingXshellSessions = false
    }
  }

  // write a loadXshellSessions() result into bookmarks + bookmark groups.
  // Bookmark and group ids are stable per session path, so importing twice
  // only adds what is new instead of creating duplicates.
  Store.prototype.importXshellSessions = function (data, opts = {}) {
    const { store } = window
    const empty = { added: 0, skipped: 0, groupsAdded: 0 }
    if (!data || !Array.isArray(data.bookmarks) || !Array.isArray(data.groups)) {
      return empty
    }
    const includePassword = opts.includePassword !== false
    const existingBookmarks = store.bookmarks || []
    const existingBookmarkIds = new Set(existingBookmarks.map(b => b.id))
    const existingGroupMap = new Map(
      (store.bookmarkGroups || []).map(g => [g.id, g])
    )
    const groupMap = new Map()
    const newGroups = []
    for (const group of data.groups) {
      if (existingGroupMap.has(group.id)) {
        const copy = { ...existingGroupMap.get(group.id) }
        copy.bookmarkIds = [...(copy.bookmarkIds || [])]
        copy.bookmarkGroupIds = [...(copy.bookmarkGroupIds || [])]
        groupMap.set(group.id, copy)
        continue
      }
      const created = {
        id: group.id,
        title: group.title,
        level: group.parentId ? 2 : 1,
        bookmarkIds: [],
        bookmarkGroupIds: []
      }
      groupMap.set(group.id, created)
      newGroups.push(created)
    }
    // rebuild the folder tree: a child is referenced by its parent group
    for (const group of data.groups) {
      if (!group.parentId) {
        continue
      }
      const child = groupMap.get(group.id)
      const parent = groupMap.get(group.parentId)
      if (!child || !parent) {
        continue
      }
      if (parent.bookmarkGroupIds.indexOf(group.id) === -1) {
        parent.bookmarkGroupIds.push(group.id)
      }
    }
    const bookmarksToAdd = []
    let skipped = 0
    for (const bookmark of data.bookmarks) {
      if (existingBookmarkIds.has(bookmark.id)) {
        skipped++
        continue
      }
      const item = {}
      for (const key of Object.keys(bookmark)) {
        if (XSHELL_META_FIELDS.indexOf(key) === -1) {
          item[key] = bookmark[key]
        }
      }
      if (bookmark.passwordStatus === 'locked' || !includePassword) {
        delete item.password
      }
      if (item.authType === 'privateKey' &&
        !item.privateKey &&
        !item.privateKeyPath) {
        // the Xshell key was not copied over, fall back to asking for a password
        item.authType = 'password'
      }
      if (!item.color) {
        item.color = '#0088cc'
      }
      if (!item.term) {
        item.term = 'xterm-256color'
      }
      const group = groupMap.get(bookmark.xshellGroupId)
      if (group) {
        group.bookmarkIds.push(item.id)
      }
      bookmarksToAdd.push(item)
    }
    if (newGroups.length) {
      store.addItems(newGroups, 'bookmarkGroups')
    }
    for (const [id, group] of groupMap) {
      const existing = existingGroupMap.get(id)
      if (!existing) {
        continue
      }
      const prevBookmarkIds = existing.bookmarkIds || []
      const prevGroupIds = existing.bookmarkGroupIds || []
      const changed = group.bookmarkIds.length !== prevBookmarkIds.length ||
        group.bookmarkGroupIds.length !== prevGroupIds.length ||
        group.bookmarkIds.some((bid, i) => bid !== prevBookmarkIds[i]) ||
        group.bookmarkGroupIds.some((gid, i) => gid !== prevGroupIds[i])
      if (changed) {
        store.editItem(id, {
          bookmarkIds: group.bookmarkIds,
          bookmarkGroupIds: group.bookmarkGroupIds
        }, 'bookmarkGroups')
      }
    }
    if (bookmarksToAdd.length) {
      store.addItems(bookmarksToAdd, 'bookmarks')
    }
    store.fixBookmarkGroups()
    return {
      added: bookmarksToAdd.length,
      skipped,
      groupsAdded: newGroups.length
    }
  }
}
