import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function openSmokeLaunchUrl(url, options = {}) {
  if (process.env.SPARK_SMOKE_BROWSER === 'none') {
    return { opened: false, command: 'none' }
  }
  if (process.platform === 'win32') {
    const isolated = process.env.SPARK_SMOKE_BROWSER_ISOLATED !== '0'
    const headless = process.env.SPARK_SMOKE_BROWSER_HEADLESS !== '0'
    const debuggable = headless || process.env.SPARK_SMOKE_BROWSER_DEBUG === '1'
    const browser = findWindowsBrowser({ preferHeadless: false })
    if (browser !== undefined && isolated) {
      const profileDir = options.profileDir ?? join(tmpdir(), 'spark-ai-host-run-smoke-browser', sanitizeProfileName(options.profileName ?? 'default'))
      await mkdir(profileDir, { recursive: true })
      const fixedDevToolsPort = debuggable && !headless
        ? allocateDevToolsPort(options.profileName ?? 'default')
        : undefined
      const args = [
        '--new-window',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        ...(debuggable ? [`--remote-debugging-port=${fixedDevToolsPort ?? 0}`] : []),
        ...(headless
          ? [
              '--headless=new',
              '--disable-gpu',
            ]
          : []),
        url,
      ]
      const child = spawn(browser, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()
      const devToolsPort = headless
        ? await waitForDevToolsPort(profileDir)
        : fixedDevToolsPort
      if (debuggable && devToolsPort !== undefined && !headless) await waitForDevToolsEndpoint(devToolsPort)
      return { opened: true, command: browser, isolated: true, headless, profileDir, devToolsPort }
    }
  }

  const command = process.platform === 'win32'
    ? { file: 'cmd', args: ['/c', 'start', '', url] }
    : process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : { file: 'xdg-open', args: [url] }
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return { opened: true, command: command.file, isolated: false }
}

function findWindowsBrowser(options = {}) {
  const configured = process.env.SPARK_SMOKE_BROWSER_PATH
  if (configured !== undefined && configured.trim().length > 0 && existsSync(configured)) {
    return configured
  }
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const programFiles = process.env['ProgramFiles']
  const localAppData = process.env['LOCALAPPDATA']
  const edgeCandidates = [
    programFilesX86 === undefined ? undefined : join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFiles === undefined ? undefined : join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    localAppData === undefined ? undefined : join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  const chromeCandidates = [
    programFiles === undefined ? undefined : join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 === undefined ? undefined : join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData === undefined ? undefined : join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  const candidates = options.preferHeadless
    ? [...chromeCandidates, ...edgeCandidates]
    : [...edgeCandidates, ...chromeCandidates]
  return candidates.find(candidate => candidate !== undefined && existsSync(candidate))
}

function sanitizeProfileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'default'
}

async function waitForDevToolsPort(profileDir) {
  const file = join(profileDir, 'DevToolsActivePort')
  const started = Date.now()
  let lastError
  while (Date.now() - started < 10_000) {
    try {
      const content = await readFile(file, 'utf8')
      const [port] = content.trim().split(/\r?\n/u)
      if (/^\d+$/u.test(port ?? '')) return port
    } catch (error) {
      lastError = error
    }
    await sleep(100)
  }
  const message = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`headless browser did not expose DevToolsActivePort${message}`)
}

async function waitForDevToolsEndpoint(port) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await sleep(100)
  }
  const message = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`browser did not expose DevTools endpoint on ${port}${message}`)
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function allocateDevToolsPort(profileName) {
  let hash = 0
  for (const char of String(profileName)) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  }
  return 49_000 + (hash % 10_000)
}
