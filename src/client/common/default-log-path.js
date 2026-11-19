import { osResolve } from './resolve'

export default function () {
  return window.et.sessionLogPath || osResolve(window.store.appPath, 'b-shell', 'session_logs')
}
