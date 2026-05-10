# 视频样片渲染说明

当前仓库提供三条样片渲染链路。

## 稳定 AVI 样片

推荐先使用纯 Python + Pillow 的 AVI 渲染脚本，它不依赖 PowerPoint、不依赖 `ffmpeg`，用于快速产出可播放的视频草稿：

```powershell
python scripts/render-video-series-avi.py
```

默认输出：

```text
%TEMP%/spark-view-video-samples-avi/
  long/
    00-preface.avi
    01-spark-view-not-json-form-generator.avi
  short/
    00-preface.avi
    01-spark-view-not-json-form-generator.avi
```

也可以指定输出目录：

```powershell
python scripts/render-video-series-avi.py --output-root "$env:TEMP\spark-view-video-samples-avi"
```

当前 AVI 样片是无配音技术草稿，适合验证镜头、字幕密度、标题节奏和基础画面可读性。

## PowerPoint MP4 样片

仓库也保留一个本地 PowerPoint + Windows 中文 TTS 的样片渲染脚本：

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

AVI 路线：

- Python 3。
- Pillow。

PowerPoint MP4 路线：

- PowerPoint COM，可通过 `New-Object -ComObject PowerPoint.Application` 调用。
- Windows TTS，当前检测到 `Microsoft Huihui Desktop | zh-CN`。
- PowerShell 7+，用于稳定解析 UTF-8 中文脚本。
- 不依赖 `ffmpeg`。

## FFmpeg MP4 有声样片

更推荐的 MP4 路线是 Python 生成画面帧，Edge TTS 生成中文旁白，`ffmpeg` 负责合成有声 MP4：

```powershell
python scripts/render-video-series-mp4.py --output-root docs/video-series/_rendered
```

默认输出：

```text
docs/video-series/_rendered/
  long/
    00-preface.mp4
    01-spark-view-not-json-form-generator.mp4
  short/
    00-preface.mp4
    01-spark-view-not-json-form-generator.mp4
```

安装或检测 `ffmpeg`：

```powershell
winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
python scripts/render-video-series-mp4.py --check
```

安装 Edge TTS 依赖：

```powershell
python -m pip install edge-tts
```

脚本会自动扫描 `PATH` 和 WinGet 的 `Gyan.FFmpeg` 安装目录。如果仍然找不到，可以显式传入路径：

```powershell
python scripts/render-video-series-mp4.py --ffmpeg "D:\tools\ffmpeg\bin\ffmpeg.exe"
```

默认中文旁白声音为 `zh-CN-XiaoxiaoNeural`，可以切换：

```powershell
python scripts/render-video-series-mp4.py --voice zh-CN-YunjianNeural --output-root docs/video-series/_rendered
```

## 已知限制

- 当前样片是技术草稿片，不是精剪成片。
- AVI 路线无配音，优先保证“能稳定生成可播放视频文件”。
- PowerPoint MP4 路线可能受 Office COM 导出状态影响，如果导出长时间不返回，应停止该进程并改用 AVI 路线。
- FFmpeg MP4 路线已经接入 Edge TTS 中文旁白；后续可替换为真人配音 WAV 或更完整的字幕包装。
- 画面优先使用 SVG 技术配图、标题卡、说明卡和字幕。
- 真实运行时截图、真人配音、动效包装和精剪节奏需要后续制作增强。
- 如果脚本无法创建输出目录或启动 PowerPoint，通常是执行环境权限未放行。
