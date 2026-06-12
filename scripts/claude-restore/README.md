# Claude Code 百炼配置恢复包

用途：恢复本次 Claude Code 百炼 Token Plan 配置，以及这次调整过的项目指令/脚本文件。

## 直接运行

双击：

```bat
restore-claude-bailian.bat
```

或在 `D:\SPARK_VIEW` 里执行：

```powershell
.\scripts\claude-restore\restore-claude-bailian.bat
```

## 恢复内容

- 恢复 `CLAUDE.md`
- 恢复 `scripts\claude-model.ps1`
- 恢复 `scripts\setup-claude-deepseek.ps1`
- 清理 `ANTHROPIC_API_KEY`
- 重新设置百炼 Token Plan 地址和 `qwen3.6-plus` 模型
- 更新 `%USERPROFILE%\.claude\settings.json`
- 更新 `%USERPROFILE%\.claude.json` 的 onboarding 状态

## 密钥说明

恢复包不保存真实 key。脚本会读取 Windows 用户环境变量里的 `ANTHROPIC_AUTH_TOKEN`。

如果你在百炼后台轮换了新 key，先设置用户环境变量：

```powershell
setx ANTHROPIC_AUTH_TOKEN "你的新百炼TokenPlanKey"
```

然后重新打开终端，再运行恢复脚本。

## 可选参数

只恢复项目文件：

```powershell
.\scripts\claude-restore\restore-claude-bailian.bat -FilesOnly
```

只恢复环境变量和 Claude Code 设置：

```powershell
.\scripts\claude-restore\restore-claude-bailian.bat -EnvOnly
```
