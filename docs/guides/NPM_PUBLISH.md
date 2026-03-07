# npm 发布完整指南

> 适用于 `@spark-view/*` 所有子包的发布操作。

---

## 一、Token 配置（首次 / Token 过期时执行）

### 1. Token 类型要求

**必须使用 Granular Access Token**，且满足以下两个条件：

| 条件 | 说明 |
|------|------|
| ✅ **Bypass 2FA 勾选** | 不勾选则发布时需交互输入 OTP，`auth-type=legacy` 模式下会直接失败 |
| ✅ **@spark-view org 写权限** | 缺少此权限报 `E404 Not Found - not have permission` |

> ⚠️ Web 登录（`npm login`）获取的 session token **无** org 写权限，**不可用于发布**！

### 2. 创建 Token 步骤

1. 访问 https://www.npmjs.com/settings/tokens
2. 点击 **Generate New Token** → 选择 **Granular Access Token**
3. 填写：
   - **Name**: `spark_view_MMDD`（日期命名，如 `spark_view_0307`，方便追踪到期时间）
   - **Description**: `CI/CD publish token for @spark-view scoped packages. Bypass 2FA required for automated publishing.`
   - **Expiration**: 默认 90 天（到期前重新生成即可）
4. 权限配置：
   - 勾选 **✅ Bypass two-factor authentication (2FA)**（**这是关键，必须勾选**）
   - Organizations → **spark-view** → 选 **Read and write**
5. 点击 **Generate Token**，复制完整 token 值（页面关闭后不再显示）

### 3. 写入 .npmrc

```powershell
npm config set //registry.npmjs.org/:_authToken <你的token>
npm config set auth-type legacy
```

验证配置（`~/.npmrc` 应包含以下内容）：

```
//registry.npmjs.org/:_authToken=npm_xxxx...
auth-type=legacy
```

> **注意**：`npm whoami --registry https://registry.npmjs.org` 对 Granular Token 会返回 401，这是**正常现象**，不代表 token 无效。用实际发布来验证 token 是否有效。

---

## 二、发布前检查清单

```powershell
# 1. lint 检查
pnpm run lint

# 2. 类型检查
pnpm run typecheck

# 3. 单元测试
pnpm run test

# 4. 确认内部依赖全是 workspace:*（不能有版本号）
Get-ChildItem packages -Directory | ForEach-Object {
  $n=$_.Name; $p=Get-Content "packages\$n\package.json"|ConvertFrom-Json
  $bad = $p.dependencies.PSObject.Properties |
    Where-Object { $_.Name -like '@spark-view/*' -and $_.Value -notmatch '^workspace:' }
  if ($bad) { Write-Host "[WARN] $n 有非 workspace 依赖:"; $bad | ForEach-Object { Write-Host "  $($_.Name)=$($_.Value)" } }
}
```

---

## 三、完整发布流程

```powershell
# ── Step 1: 升版本号（所有 5 个包统一升 patch） ──
Get-ChildItem packages -Directory | ForEach-Object {
  $f = "packages\$($_.Name)\package.json"
  $j = Get-Content $f -Raw | ConvertFrom-Json
  $v = [version]$j.version
  $j.version = "$($v.Major).$($v.Minor).$($v.Build + 1)"
  $j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
  Write-Host "$($j.name) -> $($j.version)"
}

# ── Step 2: 确认 token 已配置（见第一章） ──
# 无需 npm whoami（Granular token 会返回 401，属正常）

# ── Step 3: 发布（自动构建 + 跳过已发版的包） ──
node scripts/publish-packages.mjs

# ── Step 4: 验证发布结果 ──
@('spark-utils','spark-data','spark-page-config','spark-component','spark-app') |
  ForEach-Object {
    $v = npm view "@spark-view/$_" version --registry https://registry.npmjs.org 2>$null
    Write-Host "$_ = $v"
  }

# ── Step 5: 提交 + 推送 ──
# 先把版本号查出来，写进 commit message（替换 X.Y.Z）
$ver = (Get-Content "packages\spark-utils\package.json" | ConvertFrom-Json).version
git add -A
git commit -m "chore: bump all packages to v$ver"
git push
```

> **Husky 废弃警告**：commit 时会看到 `husky - DEPRECATED` 提示，属正常现象，不影响提交。
> pre-commit hook 会自动执行 `lint + typecheck`，通过后才会提交成功。

---

## 四、常见问题速查

| 症状 | 原因 | 解决方案 |
|------|------|---------|
| `E401 Unauthorized` | Token 被吊销或过期 | 重新生成 Granular Token（见第一章），**不要用 `npm login`** |
| `E404 Not Found - not have permission` | Token 没有 `@spark-view` org 写权限，或用了 web-login token | 重新生成 Granular Token，确认勾选 org Read and Write |
| `EOTP` / 需要 OTP | Token 未勾选 Bypass 2FA | 重新生成 Granular Token，**必须勾选 Bypass 2FA** |
| `npm whoami` 返回 401 | Granular token 不支持 whoami | **正常现象**，忽略，直接执行发布 |
| `You cannot publish over previously published versions` | 版本号已存在 | 脚本自动跳过该包，不影响其他包继续发布 |
| 发布成功但 `npm view` 查不到新版 | 镜像同步延迟 | 脚本显式查 `registry.npmjs.org`，延迟约 1-2 分钟 |
| `pnpm-lock.yaml` 出现双重版本 | 某包用了版本号而非 `workspace:*` | 改为 `workspace:*`，重新 `pnpm install` |
| commit 被 pre-commit hook 阻断 | lint 或 typecheck 有错误 | 修复错误后重新 commit，**不要用 `--no-verify` 绕过** |

---

## 五、Token 安全注意事项

- ⚠️ **永远不要把 token 提交到 git**：GitHub secret scanning 会自动检测并吊销泄露的 npm token
- 如果 token 被意外提交，立即到 npmjs.com 删除该 token，再重新生成
- Token 命名带日期（如 `spark_view_0307`）方便追踪到期时间
- Token 到期前 ~1 周重新生成，避免发布时措手不及

---

## 六、本项目 .npmrc 说明

`C:\Users\<用户名>\.npmrc`（用户级配置）：

```ini
registry=https://registry.npmmirror.com   # 日常 install 走镜像（快）
//registry.npmjs.org/:_authToken=npm_xxx  # 发布走官方 registry（必须）
auth-type=legacy                           # 禁用 web 认证弹窗
```

> `registry` 镜像只影响 `npm install`，发布脚本已显式指定 `--registry https://registry.npmjs.org`，两者互不干扰。
