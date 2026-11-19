/**
 * db loader
 * Provides electron-related environment to nedb/sqlite modules
 */

const { app } = require('electron')
const { appPath, defaultUserName } = require('../common/app-props')
const { safeEncrypt, safeDecrypt } = require('./safe-storage')

const encOpts = { enc: safeEncrypt, dec: safeDecrypt }

/**
 * Where the database lives.
 *
 * Normal installs keep `%APPDATA%\b-shell` (the userData profile) as the data
 * root, so the database and the encryption key material Electron keeps inside
 * that same profile always travel together. Portable builds keep everything
 * next to the exe, and DATA_PATH still wins for the tests.
 *
 * This used to be `appData` while the key lived in `userData`; the two drifted
 * apart as soon as the app was started with a different `--user-data-dir`
 * (smoke tests, portable-ish setups), which silently turned every bookmark
 * into an unreadable stub.
 */
function getDataPath () {
  if (process.env.DATA_PATH) {
    return process.env.DATA_PATH
  }
  try {
    // portable build: appPath points at the exe folder, not at appData
    if (appPath !== app.getPath('appData')) {
      return appPath
    }
    return app.getPath('userData')
  } catch (_) {
    return appPath
  }
}

const dataPath = getDataPath()

if (process.versions.node < '22.0.0') {
  const { createDb } = require('./nedb')
  module.exports = createDb(appPath, defaultUserName, encOpts, dataPath)
} else {
  const { createDb } = require('./sqlite')
  module.exports = createDb(appPath, defaultUserName, encOpts, dataPath)
}
