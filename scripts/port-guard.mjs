#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function parseListeningPidsFromNetstat(output, port) {
  const target = `:${port}`
  const pids = new Set()

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed === '' || !trimmed.includes('LISTENING')) continue

    const parts = trimmed.split(/\s+/u)
    if (parts.length < 5) continue

    const localAddress = parts[1]
    const state = parts[3]
    const pidText = parts[4]

    if (state !== 'LISTENING') continue
    if (!localAddress.endsWith(target)) continue

    const pid = Number(pidText)
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid)
    }
  }

  return Array.from(pids)
}

function listListeningPidsWindows(port) {
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], {
    shell: true,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const errText = (result.stderr ?? '').trim()
    throw new Error(`读取端口占用失败(netstat): ${errText}`)
  }

  return parseListeningPidsFromNetstat(result.stdout ?? '', port)
}

function killPidWindows(pid) {
  const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    shell: true,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const errText = (result.stderr ?? '').trim()
    throw new Error(`结束进程失败(PID=${pid}): ${errText}`)
  }
}

export function ensurePortFree(port, serviceName) {
  if (process.platform !== 'win32') {
    return
  }

  const autoFree = process.env['DEV_AUTO_FREE_PORTS'] !== '0'
  const pids = listListeningPidsWindows(port)
  if (pids.length === 0) return

  console.warn(`⚠️ 端口 ${port} (${serviceName}) 已被占用，PID: ${pids.join(', ')}`)
  if (!autoFree) {
    throw new Error(`端口 ${port} 被占用。可设置 DEV_AUTO_FREE_PORTS=1 启用自动释放。`)
  }

  console.log(`🧹 正在自动释放端口 ${port} (${serviceName})...`)
  for (const pid of pids) {
    killPidWindows(pid)
  }

  const remaining = listListeningPidsWindows(port)
  if (remaining.length > 0) {
    throw new Error(`端口 ${port} 仍被占用，剩余 PID: ${remaining.join(', ')}`)
  }

  console.log(`✅ 端口 ${port} 已释放`)
}
