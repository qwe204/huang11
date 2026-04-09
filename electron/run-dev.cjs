const { spawn } = require('child_process')

function runElectronDev() {
  const electronBinary = require('electron')
  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: 'http://localhost:5173',
  }

  // Some environments set ELECTRON_RUN_AS_NODE globally, which breaks Electron main startup.
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env,
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    console.error('Failed to launch Electron in dev mode:', err)
    process.exit(1)
  })
}

runElectronDev()
