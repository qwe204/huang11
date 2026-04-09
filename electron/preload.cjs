const { contextBridge } = require('electron')

function getLaunchArgument(prefix) {
  const matched = process.argv.find((item) => item.startsWith(prefix))
  if (!matched) {
    return ''
  }
  return decodeURIComponent(matched.slice(prefix.length))
}

contextBridge.exposeInMainWorld('__DOC_PREVIEW_DESKTOP__', {
  apiBaseUrl: getLaunchArgument('--api-base-url='),
})
