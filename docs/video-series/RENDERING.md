# 视频样片渲染说明

当前仓库提供一个本地 PowerPoint + Windows 中文 TTS 的样片渲染脚本：

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/render-video-series-samples.ps1
```

默认输出：

```text
docs/video-series/_rendered/
  _work/
    00-preface-long/
    00-preface-short/
    01-spark-view-not-json-form-generator-long/
    01-spark-view-not-json-form-generator-short/
  long/
    00-preface.mp4
    01-spark-view-not-json-form-generator.mp4
  short/
    00-preface.mp4
    01-spark-view-not-json-form-generator.mp4
```

也可以指定输出目录，适合仓库目录无写权限时使用：

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/render-video-series-samples.ps1 -OutputRoot "$env:TEMP\spark-view-video-samples"
```

## 当前渲染范围

- 第 00 集序篇：长视频样片 + 短视频样片。
- 第 01 集页面资产化：长视频样片 + 短视频样片。

脚本会同时生成：

- `.pptx` 分镜工程文件。
- 每个镜头的 `.wav` 中文旁白。
- PowerPoint 导出的 `.mp4` 视频。

## 本机依赖

- PowerPoint COM，可通过 `New-Object -ComObject PowerPoint.Application` 调用。
- Windows TTS，当前检测到 `Microsoft Huihui Desktop | zh-CN`。
- PowerShell 7+，用于稳定解析 UTF-8 中文脚本。
- 不依赖 `ffmpeg`。

## 已知限制

- 当前样片是技术草稿片，不是精剪成片。
- 画面优先使用 SVG 技术配图、标题卡、说明卡和字幕。
- 真实运行时截图、真人配音、动效包装和精剪节奏需要后续制作增强。
- 如果脚本无法创建输出目录或启动 PowerPoint，通常是执行环境权限未放行。
