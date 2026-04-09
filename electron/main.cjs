const path = require('path')
const fs = require('fs')
const net = require('net')
const http = require('http')
const os = require('os')
const { fork, spawnSync } = require('child_process')
const electronModule = require('electron')

if ((typeof electronModule === 'string' || !electronModule?.app)) {
  const shouldRelaunch =
    !!process.env.ELECTRON_RUN_AS_NODE && !process.env.DOC_PREVIEW_ELECTRON_RELAUNCHED

  if (shouldRelaunch) {
    const env = {
      ...process.env,
      DOC_PREVIEW_ELECTRON_RELAUNCHED: '1',
    }
    delete env.ELECTRON_RUN_AS_NODE

    const relaunch = spawnSync(process.execPath, process.argv.slice(1), {
      stdio: 'inherit',
      env,
    })

    process.exit(relaunch.status ?? 1)
  }

  console.error(
    'Electron main process failed to initialize. Please unset ELECTRON_RUN_AS_NODE and relaunch.'
  )
  process.exit(1)
}

const { app, BrowserWindow, dialog, shell } = electronModule

let mainWindow = null
let backendProcess = null
let isQuitting = false
let runtimeApiBaseUrl = ''

const LOCAL_API_HOST = '127.0.0.1'
const PORT_CANDIDATES = [3000, 3001, 3002, 3003, 3004, 3005]

function stripTrailingSlash(input) {
  return String(input || '').replace(/\/+$/, '')
}

function parseBooleanValue(input, defaultValue = true) {
  if (input === undefined || input === null || input === '') {
    return defaultValue
  }

  const normalized = String(input).trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function parsePortValue(input) {
  const parsed = Number(input)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null
  }
  return parsed
}

function isLoopbackHost(hostname = '') {
  return /^(localhost|127(?:\.\d{1,3}){3}|::1)$/i.test(hostname)
}

function detectLanIpv4() {
  const interfaces = os.networkInterfaces()

  for (const values of Object.values(interfaces)) {
    for (const item of values || []) {
      if (!item || item.family !== 'IPv4' || item.internal) {
        continue
      }
      if (item.address.startsWith('169.254.')) {
        continue
      }
      return item.address
    }
  }

  return ''
}

function rewriteLoopbackUrl(input, replacementHost) {
  if (!input || !replacementHost) {
    return stripTrailingSlash(input)
  }

  try {
    const url = new URL(input)
    if (isLoopbackHost(url.hostname)) {
      url.hostname = replacementHost
    }
    return stripTrailingSlash(url.toString())
  } catch {
    return stripTrailingSlash(input)
  }
}

function parseDotEnv(content) {
  const result = {}
  const lines = content.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function loadProjectDotEnv() {
  const userDataEnv = app.getPath('userData')
  const candidates = [
    path.join(userDataEnv, 'desktop.env'),
    path.join(userDataEnv, '.env'),
    path.join(process.resourcesPath, 'server', 'runtime.env'),
    path.join(process.resourcesPath, 'server', '.env'),
    path.join(process.resourcesPath, 'app', 'server', 'runtime.env'),
    path.join(process.resourcesPath, 'app', 'server', '.env'),
    path.join(app.getAppPath(), 'server', 'runtime.env'),
    path.join(app.getAppPath(), 'server', '.env'),
    path.join(process.cwd(), 'server', 'runtime.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(process.cwd(), 'server', '.env'),
    path.join(process.cwd(), '.env'),
  ]

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue
      }
      const content = fs.readFileSync(candidate, 'utf8')
      return parseDotEnv(content)
    } catch {
      // Ignore invalid .env file and continue to next candidate.
    }
  }

  return {}
}

function ensureUserDesktopEnv() {
  const userDataPath = app.getPath('userData')
  const userEnvPath = path.join(userDataPath, 'desktop.env')

  if (fs.existsSync(userEnvPath)) {
    return userEnvPath
  }

  const templatePath = getFirstExistingPath([
    path.join(process.resourcesPath, 'server', 'runtime.env'),
    path.join(process.resourcesPath, 'server', '.env'),
    path.join(process.resourcesPath, 'app', 'server', 'runtime.env'),
    path.join(process.resourcesPath, 'app', 'server', '.env'),
    path.join(app.getAppPath(), 'server', 'runtime.env'),
    path.join(app.getAppPath(), 'server', '.env'),
  ])

  try {
    ensureDirectory(userDataPath)
    if (templatePath) {
      fs.copyFileSync(templatePath, userEnvPath)
    } else {
      const defaults = [
        'DESKTOP_SHARE_ENABLED=true',
        'DESKTOP_PORT=3000',
        'DESKTOP_BIND_HOST=0.0.0.0',
        'DESKTOP_PUBLIC_HOST=auto',
        'DESKTOP_PUBLIC_URL=',
        'ONLYOFFICE_URL=http://localhost',
        'ONLYOFFICE_PUBLIC_URL=http://localhost',
        'LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1',
        'LM_STUDIO_MODEL=',
        '',
      ].join('\n')
      fs.writeFileSync(userEnvPath, defaults, 'utf8')
    }
  } catch {
    // Ignore desktop env initialization failure.
  }

  return userEnvPath
}

function resolveBackendExecPath() {
  if (process.env.DOC_PREVIEW_BACKEND_NODE) {
    return process.env.DOC_PREVIEW_BACKEND_NODE
  }

  // In desktop dev, prefer system Node to avoid native module ABI mismatch with Electron's Node.
  if (!app.isPackaged) {
    return process.platform === 'win32' ? 'node.exe' : 'node'
  }

  // In packaged Linux builds, prefer bundled Node runtime so native modules
  // (e.g. better-sqlite3) can target Node ABI instead of Electron ABI.
  if (process.platform === 'linux') {
    const bundledNode = getFirstExistingPath([
      path.join(app.getAppPath(), 'electron', 'runtime', 'linux-x64', 'node'),
      path.join(process.resourcesPath, 'app', 'electron', 'runtime', 'linux-x64', 'node'),
      path.join(process.resourcesPath, 'electron', 'runtime', 'linux-x64', 'node'),
    ])
    if (bundledNode) {
      return bundledNode
    }
  }

  return process.execPath
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function getFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function resolveServerEntry() {
  return getFirstExistingPath([
    path.join(process.resourcesPath, 'server', 'src', 'app.js'),
    path.join(app.getAppPath(), 'server', 'src', 'app.js'),
    path.join(process.resourcesPath, 'app', 'server', 'src', 'app.js'),
    path.join(process.cwd(), 'server', 'src', 'app.js'),
  ])
}

function resolveRendererEntry() {
  return getFirstExistingPath([
    path.join(app.getAppPath(), 'web-component', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app', 'web-component', 'dist', 'index.html'),
    path.join(process.cwd(), 'web-component', 'dist', 'index.html'),
  ])
}

function resolveRendererRoot() {
  const rendererEntry = resolveRendererEntry()
  if (!rendererEntry) {
    return ''
  }
  return path.dirname(rendererEntry)
}

function resolvePreloadEntry() {
  return getFirstExistingPath([
    path.join(app.getAppPath(), 'electron', 'preload.cjs'),
    path.join(process.resourcesPath, 'app', 'electron', 'preload.cjs'),
    path.join(process.cwd(), 'electron', 'preload.cjs'),
  ])
}

function resolveDesktopRuntimeOptions(port, projectDotEnv) {
  const shareEnabled = parseBooleanValue(
    projectDotEnv.DESKTOP_SHARE_ENABLED ?? process.env.DESKTOP_SHARE_ENABLED,
    true
  )
  const bindHost = shareEnabled
    ? (projectDotEnv.DESKTOP_BIND_HOST || process.env.DESKTOP_BIND_HOST || '0.0.0.0')
    : LOCAL_API_HOST

  const configuredPublicUrl =
    projectDotEnv.DESKTOP_PUBLIC_URL || process.env.DESKTOP_PUBLIC_URL || ''
  const configuredPublicHost =
    projectDotEnv.DESKTOP_PUBLIC_HOST || process.env.DESKTOP_PUBLIC_HOST || ''
  const autoPublicHost =
    configuredPublicHost && configuredPublicHost !== 'auto'
      ? configuredPublicHost
      : detectLanIpv4()
  const fallbackPublicHost = shareEnabled ? (autoPublicHost || LOCAL_API_HOST) : LOCAL_API_HOST
  const publicOrigin = stripTrailingSlash(
    configuredPublicUrl || `http://${fallbackPublicHost}:${port}`
  )
  const localApiBaseUrl = `http://${LOCAL_API_HOST}:${port}/api`
  const webRoot = resolveRendererRoot()

  let publicHostForRewrite = ''
  try {
    publicHostForRewrite = new URL(publicOrigin).hostname
  } catch {
    publicHostForRewrite = fallbackPublicHost
  }

  const configuredOnlyofficePublicUrl =
    projectDotEnv.ONLYOFFICE_PUBLIC_URL ||
    process.env.ONLYOFFICE_PUBLIC_URL ||
    projectDotEnv.ONLYOFFICE_URL ||
    process.env.ONLYOFFICE_URL ||
    ''
  const onlyofficePublicUrl = shareEnabled
    ? rewriteLoopbackUrl(configuredOnlyofficePublicUrl, publicHostForRewrite)
    : stripTrailingSlash(configuredOnlyofficePublicUrl)

  return {
    shareEnabled,
    bindHost,
    publicOrigin,
    localApiBaseUrl,
    webRoot,
    onlyofficePublicUrl,
  }
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function pickBackendPort(host) {
  for (const port of PORT_CANDIDATES) {
    if (await isPortAvailable(port, host)) {
      return port
    }
  }
  throw new Error(`No available backend port found in ${PORT_CANDIDATES.join(', ')}`)
}

function checkHealth(healthUrl) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: 1500 }, (res) => {
      const ok = res.statusCode === 200
      res.resume()
      resolve(ok)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForBackend(healthUrl, timeoutMs = 45000) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    if (await checkHealth(healthUrl)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`Backend health check timeout: ${healthUrl}`)
}

function startBackend(port, projectDotEnv, runtimeOptions) {
  const serverEntry = resolveServerEntry()
  if (!serverEntry) {
    throw new Error('Cannot find backend entry: server/src/app.js')
  }

  const userDataPath = app.getPath('userData')
  const storagePath = path.join(userDataPath, 'data', 'documents')
  const dbPath = path.join(userDataPath, 'data', 'db', 'docpreview.db')
  ensureDirectory(storagePath)
  ensureDirectory(path.dirname(dbPath))

  backendProcess = fork(serverEntry, [], {
    cwd: path.dirname(serverEntry),
    execPath: resolveBackendExecPath(),
    env: {
      ...process.env,
      ...projectDotEnv,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      HOST: runtimeOptions.bindHost,
      PORT: String(port),
      PUBLIC_URL: runtimeOptions.publicOrigin,
      CALLBACK_HOST: runtimeOptions.publicOrigin,
      SERVE_WEB: runtimeOptions.webRoot ? 'true' : 'false',
      WEB_ROOT: runtimeOptions.webRoot,
      ONLYOFFICE_PUBLIC_URL:
        runtimeOptions.onlyofficePublicUrl || process.env.ONLYOFFICE_PUBLIC_URL || '',
      STORAGE_PATH: storagePath,
      DB_PATH: dbPath,
    },
    stdio: 'pipe',
  })

  backendProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk}`)
  })

  backendProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[backend] ${chunk}`)
  })

  backendProcess.on('exit', (code, signal) => {
    const exitMessage = `Backend exited (code=${code}, signal=${signal || 'none'})`
    if (!isQuitting) {
      dialog.showErrorBox('Desktop backend stopped', exitMessage)
      app.quit()
    }
  })
}

function stopBackend() {
  if (!backendProcess) {
    return
  }

  const processToStop = backendProcess
  backendProcess = null

  if (processToStop.killed || processToStop.exitCode !== null) {
    return
  }

  try {
    processToStop.kill('SIGTERM')
  } catch {
    processToStop.kill()
  }

  const forceKillTimer = setTimeout(() => {
    try {
      processToStop.kill('SIGKILL')
    } catch {
      // Ignore force-kill failure.
    }
  }, 3000)

  processToStop.once('exit', () => clearTimeout(forceKillTimer))
}

async function createWindow(apiBaseUrl) {
  const preload = resolvePreloadEntry()
  if (!preload) {
    throw new Error('Cannot find preload entry: electron/preload.cjs')
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--api-base-url=${encodeURIComponent(apiBaseUrl)}`],
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  const rendererEntry = resolveRendererEntry()
  if (!rendererEntry) {
    throw new Error('Cannot find renderer entry: web-component/dist/index.html')
  }
  await mainWindow.loadFile(rendererEntry)
}

async function bootstrapDesktopApp() {
  ensureUserDesktopEnv()
  const projectDotEnv = loadProjectDotEnv()
  const previewOptions = resolveDesktopRuntimeOptions(PORT_CANDIDATES[0], projectDotEnv)
  const preferredPort = parsePortValue(projectDotEnv.DESKTOP_PORT || process.env.DESKTOP_PORT)
  let backendPort = null

  if (preferredPort && (await isPortAvailable(preferredPort, previewOptions.bindHost))) {
    backendPort = preferredPort
  } else {
    if (preferredPort) {
      console.warn(`[desktop] Preferred DESKTOP_PORT ${preferredPort} unavailable, fallback to auto`)
    }
    backendPort = await pickBackendPort(previewOptions.bindHost)
  }

  const runtimeOptions = resolveDesktopRuntimeOptions(backendPort, projectDotEnv)
  const apiBaseUrl = runtimeOptions.localApiBaseUrl
  const healthUrl = `${apiBaseUrl}/health`

  runtimeApiBaseUrl = apiBaseUrl
  startBackend(backendPort, projectDotEnv, runtimeOptions)
  await waitForBackend(healthUrl)
  if (runtimeOptions.shareEnabled) {
    console.log(`[desktop] Shared web URL: ${runtimeOptions.publicOrigin}`)
  }
  await createWindow(apiBaseUrl)
}

app.whenReady().then(async () => {
  try {
    await bootstrapDesktopApp()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Desktop startup failed', message)
    app.quit()
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createWindow(runtimeApiBaseUrl)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        dialog.showErrorBox('Window create failed', message)
      }
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
