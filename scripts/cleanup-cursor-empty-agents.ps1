# 清理 Cursor 堆积的空 "New Agent" 会话（须先完全退出 Cursor）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/cleanup-cursor-empty-agents.ps1

$ErrorActionPreference = 'Stop'
$workspaceId = '875597063a2205af12a51e0829676f4f'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $env:APPDATA "Cursor\User\_backup-agent-cleanup-$stamp"

function Backup-File([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $rel = $Path.Replace("$env:APPDATA\Cursor\User\", '')
  $dest = Join-Path $backupRoot $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item $Path $dest -Force
  Write-Host "backup: $rel"
}

$globalDb = Join-Path $env:APPDATA 'Cursor\User\globalStorage\state.vscdb'
$workspaceDb = Join-Path $env:APPDATA "Cursor\User\workspaceStorage\$workspaceId\state.vscdb"

if (Get-Process Cursor -ErrorAction SilentlyContinue) {
  Write-Error '请先完全退出 Cursor（任务管理器确认无 Cursor 进程），再运行此脚本。'
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Backup-File $globalDb
Backup-File "$globalDb.backup"
Backup-File $workspaceDb
Backup-File "$workspaceDb.backup"

$py = @'
import json, shutil, sqlite3
from pathlib import Path
import os

workspace_id = os.environ.get('CURSOR_WS_ID', '875597063a2205af12a51e0829676f4f')
global_db = Path(os.environ['APPDATA']) / 'Cursor/User/globalStorage/state.vscdb'
workspace_db = Path(os.environ['APPDATA']) / f'Cursor/User/workspaceStorage/{workspace_id}/state.vscdb'

def load(conn, key):
    row = conn.execute('SELECT value FROM ItemTable WHERE key = ?', (key,)).fetchone()
    return json.loads(row[0]) if row else None

def save(conn, key, value):
    conn.execute(
        'INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)',
        (key, json.dumps(value, ensure_ascii=False)),
    )

# --- global: archive active unnamed composers ---
g = sqlite3.connect(global_db)
headers = load(g, 'composer.composerHeaders') or {}
composers = headers.get('allComposers', [])
archived = 0
for c in composers:
    if c.get('isArchived'):
        continue
    if c.get('name'):
        continue
    c['isArchived'] = True
    archived += 1
if archived:
    save(g, 'composer.composerHeaders', headers)
    g.commit()
print(f'global: archived {archived} unnamed active composers')

# --- workspace: trim open tabs + orphan pane state ---
w = sqlite3.connect(workspace_db)
data = load(w, 'composer.composerData') or {}
selected = data.get('selectedComposerIds') or []
focused = data.get('lastFocusedComposerIds') or []

# keep at most one tab if everything was unnamed shells
keep = selected[-1:] if selected else []
data['selectedComposerIds'] = keep
data['lastFocusedComposerIds'] = focused[-1:] if focused else []
save(w, 'composer.composerData', data)

pane_deleted = 0
for (key,) in w.execute(
    "SELECT key FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%'"
).fetchall():
    w.execute('DELETE FROM ItemTable WHERE key = ?', (key,))
    pane_deleted += 1
w.commit()
print(f'workspace: selected tabs {len(selected)} -> {len(keep)}')
print(f'workspace: deleted {pane_deleted} composerChatViewPane state rows')

g.close()
w.close()
'@

$env:CURSOR_WS_ID = $workspaceId
python -c $py
Write-Host ""
Write-Host "完成。备份在: $backupRoot"
Write-Host "请重新打开 Cursor。"
