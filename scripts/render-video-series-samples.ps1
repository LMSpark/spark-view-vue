param(
  [string]$OutputRoot = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outRoot = if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  Join-Path $repoRoot 'docs/video-series/_rendered'
} else {
  $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputRoot)
}
$workRoot = Join-Path $outRoot '_work'
$longOut = Join-Path $outRoot 'long'
$shortOut = Join-Path $outRoot 'short'

foreach ($dir in @($outRoot, $workRoot, $longOut, $shortOut)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

function ConvertTo-SafeText([string]$text) {
  return $text -replace '[\r\n]+', ' ' -replace '\s+', ' '
}

function New-Narration {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Rate = -1
  )
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
  if ($null -ne $voice) {
    $synth.SelectVoice($voice.VoiceInfo.Name)
  }
  $synth.Rate = $Rate
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($Path)
  $synth.Speak((ConvertTo-SafeText $Text))
  $synth.SetOutputToNull()
  $synth.Dispose()
}

function Get-WavDurationSeconds {
  param([Parameter(Mandatory = $true)][string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $riff = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
  if ($riff -ne 'RIFF') { return 8.0 }
  $byteRate = [BitConverter]::ToInt32($bytes, 28)
  $dataIndex = -1
  for ($i = 12; $i -lt ($bytes.Length - 8); $i++) {
    if ([System.Text.Encoding]::ASCII.GetString($bytes, $i, 4) -eq 'data') {
      $dataIndex = $i
      break
    }
  }
  if ($dataIndex -lt 0 -or $byteRate -le 0) { return 8.0 }
  $dataSize = [BitConverter]::ToInt32($bytes, $dataIndex + 4)
  return [Math]::Max(3.0, [Math]::Round($dataSize / $byteRate, 2))
}

function Add-TextBox {
  param(
    [Parameter(Mandatory = $true)]$Slide,
    [Parameter(Mandatory = $true)][string]$Text,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height,
    [int]$FontSize = 28,
    [bool]$Bold = $false,
    [int]$Color = 0x18202B
  )
  $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
  $shape.TextFrame.TextRange.Text = $Text
  $shape.TextFrame.TextRange.Font.NameFarEast = 'Microsoft YaHei UI'
  $shape.TextFrame.TextRange.Font.Name = 'Microsoft YaHei UI'
  $shape.TextFrame.TextRange.Font.Size = $FontSize
  $shape.TextFrame.TextRange.Font.Bold = if ($Bold) { -1 } else { 0 }
  $shape.TextFrame.TextRange.Font.Color.RGB = $Color
  $shape.TextFrame.WordWrap = -1
  return $shape
}

function Add-SvgOrFallback {
  param(
    [Parameter(Mandatory = $true)]$Slide,
    [Parameter(Mandatory = $true)][string]$AssetPath,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height
  )
  if (Test-Path $AssetPath) {
    try {
      $pic = $Slide.Shapes.AddPicture($AssetPath, 0, -1, $Left, $Top, $Width, $Height)
      return $pic
    } catch {
      $box = $Slide.Shapes.AddShape(1, $Left, $Top, $Width, $Height)
      $box.Fill.ForeColor.RGB = 0xF2F5F8
      $box.Line.ForeColor.RGB = 0xD5DAE3
      Add-TextBox -Slide $Slide -Text (Split-Path -Leaf $AssetPath) -Left ($Left + 20) -Top ($Top + 30) -Width ($Width - 40) -Height 60 -FontSize 18 | Out-Null
      return $box
    }
  }
}

function Add-NarrationToSlide {
  param(
    [Parameter(Mandatory = $true)]$Slide,
    [Parameter(Mandatory = $true)][string]$AudioPath
  )
  $media = $Slide.Shapes.AddMediaObject2($AudioPath, 0, -1, 30, 650, 16, 16)
  $media.AnimationSettings.PlaySettings.PlayOnEntry = -1
  $media.AnimationSettings.PlaySettings.HideWhileNotPlaying = -1
  return $media
}

function New-Scene {
  param(
    [string]$Title,
    [string]$Subtitle,
    [string]$Narration,
    [string]$Visual
  )
  [PSCustomObject]@{
    Title = $Title;
    Subtitle = $Subtitle;
    Narration = $Narration;
    Visual = $Visual;
  }
}

$episodes = @(
  [PSCustomObject]@{
    Id = '00-preface';
    Title = '序篇：为什么 SPARK_VIEW 值得拆成 16 篇';
    Asset = 'screenshot-01-overview.svg';
    LongScenes = @(
      (New-Scene '为什么值得拆成 16 篇' '从页面资产化到生产工具链' '如果一个后台页面只有几个字段和两个按钮，JSON 表单当然够用。但真实企业后台会长出主从表、树数据、权限、版本回滚，以及 AI 修改。这个系列要回答的问题，是怎样把页面从一次性代码交付，变成可持续演进的软件资产。' 'screenshot-01-overview.svg'),
      (New-Scene '一条工程主线' '四文件、Renderer、DataSet、权限、AI、DevSystem' 'SPARK_VIEW 的答案不是某一个组件，而是一组工程边界。页面先拆成四文件资产，再进入稳定运行时；数据状态沉到 DataSet 和 DataView；权限只消费后端快照；AI 通过通用 Runtime 和业务模块行动。' 'screenshot-02-four-files.svg'),
      (New-Scene '读法一：先抓主骨架' '1 / 2 / 7 / 10 / 13 / 14 / 16' '如果你只想快速建立全局感，先看第一、第二、第七、第十、第十三、第十四和第十六集。这条线会把理念、资产、运行时、数据、权限、AI 和工具链串起来。' 'screenshot-07-page-renderer.svg'),
      (New-Scene '读法二：完整跟源码' '从理念走到生产化' '如果你要维护或改造这套系统，就按顺序看完。这个顺序刻意从外到内，再从内到生产化。下一集我们先拆掉一个误会：SPARK_VIEW 不是 JSON 表单生成器。' 'screenshot-16-devsystem.svg')
    );
    ShortScenes = @(
      (New-Scene 'SPARK_VIEW 不是组件介绍' '它是一条工程路线' 'SPARK_VIEW 不是一组低代码组件介绍。它要讲的是页面资产化、运行时解释、数据内核、权限边界、通用受约束 AI 和生产工具链。' 'screenshot-01-overview.svg'),
      (New-Scene '真实后台不会停在表单' '数据、权限、回滚、AI 修改' '真实后台有主从表、树数据、权限、版本回滚，还要让 AI 安全地参与修改。所以问题不是少写 Vue，而是如何管理页面这个长期资产。' 'screenshot-02-four-files.svg'),
      (New-Scene '17 集看完一条闭环' '资产化到 DevSystem' '这 17 集会从四文件协议讲到 DevSystem。完整源码链路看本系列长视频。' 'screenshot-16-devsystem.svg')
    );
  },
  [PSCustomObject]@{
    Id = '01-spark-view-not-json-form-generator';
    Title = '别再叫它 JSON 表单：SPARK_VIEW 的页面资产化野心';
    Asset = 'screenshot-01-overview.svg';
    LongScenes = @(
      (New-Scene '别再叫它 JSON 表单' '简单表单和企业后台不是同一种问题' '很多人第一次看到配置化页面，会本能地把它归类成 JSON 表单。这个判断在简单场景里没问题，但放到企业后台就会失真。后台页面不只是字段布局，它还要处理数据联动、权限快照、树数据、聚合、脚本、预览和长期维护。' 'screenshot-01-overview.svg'),
      (New-Scene '核心判断：页面资产化' '可加载、可编译、可预览、可回滚、可被 AI 修改' 'SPARK_VIEW 真正想做的是页面资产化。页面不再是一份一次性代码，也不是一段孤立 JSON，而是一组可以被加载、编译、预览、测试、回滚和 AI 修改的资产。' 'screenshot-02-four-files.svg'),
      (New-Scene '源码跟读' 'package.json / packages / deep dive' '从 package.json 和 packages README 可以看到，这不是单包组件库，而是应用集成、组件解释、数据内核、配置加载和 AI 能力协作的 monorepo。' 'screenshot-03-monorepo.svg'),
      (New-Scene '本集结论' '不是生成器，是治理系统' '表单生成器解决字段渲染，代码生成器解决初始效率，SPARK_VIEW 解决页面作为资产的长期演进。下一集进入最核心的资产边界：四文件协议。' 'screenshot-01-overview.svg')
    );
    ShortScenes = @(
      (New-Scene '别再叫 JSON 表单' '这个判断太窄了' '如果一个后台页面只有输入框和提交按钮，JSON 表单够用。但一旦有主从表、树数据、权限快照、聚合、预览和回滚，问题就变了。' 'screenshot-01-overview.svg'),
      (New-Scene 'SPARK_VIEW 的答案' '页面资产化' 'SPARK_VIEW 的核心是页面资产化：结构、数据、行为、样式拆成四类资产，再交给稳定运行时解释。' 'screenshot-02-four-files.svg'),
      (New-Scene '最终结论' '可治理，而不是只少写 Vue' '它不是表单生成器，也不是一次性代码生成器。完整源码链路看本集长视频。' 'screenshot-01-overview.svg')
    );
  }
)

function Render-Episode {
  param(
    [Parameter(Mandatory = $true)]$Episode,
    [ValidateSet('long', 'short')][string]$Kind
  )

  $scenes = if ($Kind -eq 'long') { $Episode.LongScenes } else { $Episode.ShortScenes }
  $episodeWork = Join-Path $workRoot "$($Episode.Id)-$Kind"
  New-Item -ItemType Directory -Force -Path $episodeWork | Out-Null

  $ppt = New-Object -ComObject PowerPoint.Application
  $ppt.Visible = -1
  $pres = $ppt.Presentations.Add()
  $pres.PageSetup.SlideWidth = 1280
  $pres.PageSetup.SlideHeight = 720

  $slideIndex = 0
  foreach ($scene in $scenes) {
    $slideIndex += 1
    $slide = $pres.Slides.Add($slideIndex, 12)
    $slide.FollowMasterBackground = 0
    $slide.Background.Fill.ForeColor.RGB = 0xF7F8FA
    $bar = $slide.Shapes.AddShape(1, 0, 0, 1280, 18)
    $bar.Fill.ForeColor.RGB = 0x5E35B1
    $bar.Line.Visible = 0

    Add-TextBox -Slide $slide -Text $Episode.Title -Left 60 -Top 36 -Width 1160 -Height 42 -FontSize 22 -Bold $true -Color 0x5E6673 | Out-Null
    Add-TextBox -Slide $slide -Text $scene.Title -Left 70 -Top 104 -Width 560 -Height 110 -FontSize 38 -Bold $true -Color 0x18202B | Out-Null
    Add-TextBox -Slide $slide -Text $scene.Subtitle -Left 72 -Top 220 -Width 560 -Height 70 -FontSize 24 -Color 0x5E6673 | Out-Null
    Add-TextBox -Slide $slide -Text $scene.Narration -Left 72 -Top 540 -Width 1136 -Height 104 -FontSize 22 -Color 0x18202B | Out-Null

    $assetPath = Join-Path (Join-Path $repoRoot 'docs/blog-series/assets') $scene.Visual
    Add-SvgOrFallback -Slide $slide -AssetPath $assetPath -Left 690 -Top 118 -Width 500 -Height 282 | Out-Null

    $badge = $slide.Shapes.AddShape(1, 72, 430, 340, 54)
    $badge.Fill.ForeColor.RGB = 0xEEF2FF
    $badge.Line.ForeColor.RGB = 0xD5DAE3
    Add-TextBox -Slide $slide -Text ("SPARK_VIEW Video Series / " + $Kind.ToUpper()) -Left 94 -Top 446 -Width 300 -Height 24 -FontSize 16 -Color 0x5E35B1 | Out-Null

    $audioPath = Join-Path $episodeWork ("scene-{0:00}.wav" -f $slideIndex)
    New-Narration -Text $scene.Narration -Path $audioPath
    Add-NarrationToSlide -Slide $slide -AudioPath $audioPath | Out-Null
    $duration = (Get-WavDurationSeconds -Path $audioPath) + 1.0
    $slide.SlideShowTransition.AdvanceOnTime = -1
    $slide.SlideShowTransition.AdvanceTime = $duration
  }

  $pptxPath = Join-Path $episodeWork "$($Episode.Id)-$Kind.pptx"
  $pres.SaveAs($pptxPath)
  $targetDir = if ($Kind -eq 'long') { $longOut } else { $shortOut }
  $videoPath = Join-Path $targetDir "$($Episode.Id).mp4"
  if (Test-Path $videoPath) { Remove-Item -LiteralPath $videoPath -Force }
  $pres.CreateVideo($videoPath, $true, 5, 720, 30, 85)

  $timeout = (Get-Date).AddMinutes(8)
  while ($pres.CreateVideoStatus -eq 1 -and (Get-Date) -lt $timeout) {
    Start-Sleep -Seconds 2
  }
  $status = $pres.CreateVideoStatus
  $pres.Close()
  $ppt.Quit()

  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null

  if (!(Test-Path $videoPath)) {
    throw "PowerPoint export did not create $videoPath. CreateVideoStatus=$status"
  }
  Write-Host "Rendered $videoPath"
}

foreach ($episode in $episodes) {
  Render-Episode -Episode $episode -Kind 'long'
  Render-Episode -Episode $episode -Kind 'short'
}

Write-Host "Rendered sample videos under $outRoot"
