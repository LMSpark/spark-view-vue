$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assetDir = Join-Path $root 'docs/blog-series/assets'

$items = @(
  @{ File = 'screenshot-01-overview.png'; Title = 'SPARK_VIEW 不是 JSON 表单生成器'; Subtitle = '页面资产化 / 四文件协议 / 可治理运行时'; Accent = '#2F6BFF' },
  @{ File = 'screenshot-02-four-files.png'; Title = '四文件协议'; Subtitle = 'rule.json / pagedata.json / script.js / style.css'; Accent = '#1A8C72' },
  @{ File = 'screenshot-03-monorepo.png'; Title = 'Monorepo 分层设计'; Subtitle = 'runtime / data / config / ai / devsystem'; Accent = '#7A4DFF' },
  @{ File = 'screenshot-04-startup.png'; Title = '应用启动链路'; Subtitle = '入口装配 / 路由 / 组件注册 / 运行时服务'; Accent = '#C75000' },
  @{ File = 'screenshot-05-navigation.png'; Title = '导航树即路由源'; Subtitle = '菜单配置统一系统页、配置页、外链和跨项目引用'; Accent = '#246B8F' },
  @{ File = 'screenshot-06-loader-compiler.png'; Title = '配置加载与编译边界'; Subtitle = 'Loader 负责来源，Compiler 负责解释'; Accent = '#5F6B1D' },
  @{ File = 'screenshot-07-page-renderer.png'; Title = 'SparkPageRenderer'; Subtitle = '四文件资产进入页面运行时的总装配器'; Accent = '#0A7E8C' },
  @{ File = 'screenshot-08-component-renderer.png'; Title = 'SparkComponentRenderer'; Subtitle = 'SparkNode 递归解释为 Vue 组件'; Accent = '#8A3FFC' },
  @{ File = 'screenshot-09-capability.png'; Title = '组件注册与能力系统'; Subtitle = 'Registry 解析 type，Capability 串联跨组件协作'; Accent = '#B83280' },
  @{ File = 'screenshot-10-data-model.png'; Title = 'DataSet / DataTable / DataView'; Subtitle = '页面数据空间、表事实、交互视图'; Accent = '#0072CE' },
  @{ File = 'screenshot-11-datakey.png'; Title = 'DataKey 与级联加载'; Subtitle = '组件访问数据空间的声明式语言'; Accent = '#417505' },
  @{ File = 'screenshot-12-crud-aggregate.png'; Title = 'CRUD、聚合、计算列与树数据'; Subtitle = '企业后台高频数据能力沉到数据层'; Accent = '#A15C00' },
  @{ File = 'screenshot-13-permission.png'; Title = '权限系统真实边界'; Subtitle = '前端只是装饰层，后端鉴权才是安全边界'; Accent = '#B00020' },
  @{ File = 'screenshot-14-ai-runtime.png'; Title = '受约束 AI 架构'; Subtitle = 'core 管协议，PageDesign 管页面设计语义'; Accent = '#5E35B1' },
  @{ File = 'screenshot-15-page-design-ai.png'; Title = 'Page Design AI'; Subtitle = '组件参数荷载指南属于 PageDesign knowledge 模块'; Accent = '#00695C' },
  @{ File = 'screenshot-16-devsystem.png'; Title = 'DevSystem 生产工具链'; Subtitle = '编辑、预览、数据设计、AI 会话与四文件资产闭环'; Accent = '#455A64' }
)

function New-SolidBrush([string]$hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Draw-Text([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [System.Drawing.Brush]$brush, [float]$x, [float]$y, [float]$w, [float]$h) {
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Near
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $g.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $w, $h), $format)
  $format.Dispose()
}

New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

foreach ($item in $items) {
  $bitmap = [System.Drawing.Bitmap]::new(1200, 675)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bg = New-SolidBrush '#F7F8FA'
  $ink = New-SolidBrush '#18202B'
  $muted = New-SolidBrush '#5E6673'
  $white = New-SolidBrush '#FFFFFF'
  $accent = New-SolidBrush $item.Accent
  $soft = New-SolidBrush '#E9EDF3'

  $graphics.FillRectangle($bg, 0, 0, 1200, 675)
  $graphics.FillRectangle($accent, 0, 0, 1200, 18)
  $graphics.FillRectangle($white, 72, 72, 1056, 531)
  $graphics.DrawRectangle([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#D5DAE3'), 2), 72, 72, 1056, 531)

  $graphics.FillRectangle($soft, 104, 112, 992, 62)
  for ($i = 0; $i -lt 3; $i++) {
    $graphics.FillEllipse($accent, 126 + ($i * 28), 132, 14, 14)
  }

  $titleFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 42, [System.Drawing.FontStyle]::Bold)
  $subtitleFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 22, [System.Drawing.FontStyle]::Regular)
  $labelFont = [System.Drawing.Font]::new('Microsoft YaHei UI', 16, [System.Drawing.FontStyle]::Regular)
  $smallFont = [System.Drawing.Font]::new('Consolas', 14, [System.Drawing.FontStyle]::Regular)

  Draw-Text $graphics $item.Title $titleFont $ink 126 216 880 72
  Draw-Text $graphics $item.Subtitle $subtitleFont $muted 128 302 900 74

  $blockY = 426
  $labels = @('Source', 'Protocol', 'Runtime')
  $values = @('SPARK_VIEW', 'Four Files', 'Renderer + AI')
  for ($i = 0; $i -lt 3; $i++) {
    $x = 128 + ($i * 320)
    $graphics.FillRectangle((New-SolidBrush '#F2F5F8'), $x, $blockY, 266, 78)
    $graphics.DrawRectangle([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#DCE2EA'), 1), $x, $blockY, 266, 78)
    Draw-Text $graphics $labels[$i] $labelFont $muted ($x + 18) ($blockY + 12) 220 24
    Draw-Text $graphics $values[$i] $smallFont $ink ($x + 18) ($blockY + 42) 220 24
  }

  Draw-Text $graphics 'docs/blog-series' $smallFont $muted 128 552 360 26

  $path = Join-Path $assetDir $item.File
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $titleFont.Dispose()
  $subtitleFont.Dispose()
  $labelFont.Dispose()
  $smallFont.Dispose()
  $bg.Dispose()
  $ink.Dispose()
  $muted.Dispose()
  $white.Dispose()
  $accent.Dispose()
  $soft.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Generated $($items.Count) PNG assets in $assetDir"
