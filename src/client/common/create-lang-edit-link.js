/**
 * create edit language file link
 *
 * Language packs live in the upstream electerm-locales repo, which is still the
 * translation source for b-shell, so edits should be sent there.
 */

export default (lang) => {
  return `https://github.com/electerm/electerm-locales/edit/master/locales/${lang}.js`
}
