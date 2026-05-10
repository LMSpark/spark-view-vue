from __future__ import annotations

import argparse
import math
import re
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    import imageio_ffmpeg
except ImportError as exc:
    raise SystemExit("imageio-ffmpeg is required. Run: python -m pip install imageio-ffmpeg") from exc


WIDTH = 1920
HEIGHT = 1080
FPS = 24
TARGET_DURATION = 166.0

DESKTOP_OUTPUT = Path("C:/Users/lgf22/Desktop/SPARK_AppWorks_宣传片输出")
FINAL_NAME = "SPARK AppWorks：AI开发的工业化革命.mp4"
PREMIUM_NAME = "SPARK AppWorks：AI开发的工业化革命_1080p有声精修版.mp4"
WORK_DIR = Path("D:/SPARK_VIEW/outputs/appworks-final-promo")


SCENES = [
    {
        "key": "title",
        "duration": 10.0,
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "AI开发的工业化革命",
        "voice": "这是 SPARK AppWorks，中文名，SPARK 应用工场。它面向企业应用生产，把 AI 开发从一次性生成，带入稳定、可控、可持续的工业化阶段。",
    },
    {
        "key": "pain",
        "duration": 16.0,
        "title": "企业应用，不能再靠重复手工交付",
        "subtitle": "需求碎片化、代码分叉、权限散落，正在拉高长期成本",
        "caption": "从一次性生成，走向持续生产",
        "voice": "今天的企业应用，难点不是写出第一版，而是客户越多、系统越多、差异越多，代码分叉就越多。每一次交付都要重新协调，每一次升级都可能牵动历史包袱，长期维护成本被不断放大。",
    },
    {
        "key": "positioning",
        "duration": 15.0,
        "title": "SPARK AppWorks 是什么",
        "subtitle": "它不是单点工具，而是 SPARK 融合平台上的应用生产系统",
        "caption": "面向企业软件生产的应用工场",
        "voice": "SPARK AppWorks 不是一个孤立的低代码页面，也不是让 AI 无边界散写源码。它是 SPARK 融合平台上的应用生产系统，把需求、资产、运行时和治理能力组织到同一条生产链路里。",
    },
    {
        "key": "solution",
        "duration": 16.0,
        "title": "把应用，放进工场生产",
        "subtitle": "AI 不直接散写源码，而是在受约束的配置空间里生成应用资产",
        "caption": "AI + 配置资产 + 统一运行时",
        "voice": "它的关键，是把 AI 的能力放进受约束的配置空间。页面结构、数据模型、权限策略和业务脚本，不再散落在临时代码里，而是成为可校验、可回滚、可审计的应用资产。",
    },
    {
        "key": "assets",
        "duration": 16.0,
        "title": "四类资产，生产一套企业应用",
        "subtitle": "页面、数据、权限、脚本，组成可复用的应用资产链",
        "caption": "应用不再是一次性代码，而是可沉淀资产",
        "voice": "在应用工场里，一个企业应用被拆解成清晰的资产结构。页面负责交互，数据模型负责业务对象，权限策略负责访问边界，业务脚本负责领域逻辑。资产越标准，生产越稳定。",
    },
    {
        "key": "pipeline",
        "duration": 18.0,
        "title": "一条应用生产闭环",
        "subtitle": "需求、生成、预览、发布、运行、修复，进入同一条链路",
        "caption": "每一步可追踪，每一次调整可复盘",
        "voice": "从业务需求输入，到 AI 生成配置，再到热更新预览、发布运行、日志回传和精准修复，所有步骤都在一条链路中发生。开发者和业务团队看到的不再是黑盒结果，而是可诊断、可治理、可复盘的生产过程。",
    },
    {
        "key": "runtime",
        "duration": 17.0,
        "title": "稳定运行时，统一承载变化",
        "subtitle": "DataSet、DataView、权限快照、多租户多系统，共用同一套底座",
        "caption": "变化收敛在配置层，能力沉淀在平台层",
        "voice": "稳定运行时负责统一解释执行。DataSet、DataView、权限快照、多租户和多系统承载，都沉淀在平台底座中。变化优先进入配置层，能力持续留在平台层。",
    },
    {
        "key": "scenarios",
        "duration": 16.0,
        "title": "从一个工场，交付多类业务系统",
        "subtitle": "应用管理、树形配置、主从联动、权限渲染、数据看板",
        "caption": "同一生产体系，覆盖更多企业场景",
        "voice": "围绕同一套资产和运行时，应用工场可以持续生产不同类型的业务系统。从应用管理、树形配置，到主从联动、权限渲染和数据看板，复用的是同一条生产能力。",
    },
    {
        "key": "value",
        "duration": 14.0,
        "title": "从手工作坊，到应用工场",
        "subtitle": "更快交付，稳定可控，持续复用",
        "caption": "让企业应用系统，真正进入 AI 生产时代",
        "voice": "这带来的价值，不只是更快做出页面，而是让交付效率、运行稳定性、资产复用率和后续治理能力一起提升。企业应用生产，从手工作坊走向应用工场。",
    },
    {
        "key": "ecosystem",
        "duration": 14.0,
        "title": "共建 AI 应用生产新范式",
        "subtitle": "面向客户、伙伴、开发者和行业场景持续开放",
        "caption": "把每一次交付，沉淀为下一次生产能力",
        "voice": "面向客户、伙伴、开发者和行业场景，SPARK AppWorks 可以持续开放共建。每一次真实交付，不只是完成一个项目，更是在沉淀下一次应用生产的能力。",
    },
    {
        "key": "closing",
        "duration": 14.0,
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "企业应用系统，是 AI 配出来的。",
        "voice": "SPARK AppWorks，SPARK 应用工场。让企业应用系统，是 AI 配出来的；让 AI 开发，成为可持续生产的工业化能力。",
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


FONT_LOGO = font(82, True)
FONT_H1 = font(68, True)
FONT_H2 = font(44, True)
FONT_H3 = font(34, True)
FONT_BODY = font(30)
FONT_SMALL = font(24)
FONT_TINY = font(19)

INK = "#073763"
INK_2 = "#0f4c81"
MUTED = "#477095"
BLUE = "#1479ff"
BLUE_2 = "#2ea8ff"
CYAN = "#16c7d4"
AMBER = "#f59e0b"
RED = "#ef4444"
PURPLE = "#7c3aed"
CARD = "#ffffff"
CARD_SOFT = "#f3f9ff"
BORDER = "#b9ddff"
LINE = "#83bef7"


def ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def parse_duration(ffmpeg: str, path: Path) -> float:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path), "-f", "null", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Cannot parse media duration for {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def text_size(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=face)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def center_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: str,
    dy: int = 0,
) -> None:
    x1, y1, x2, y2 = box
    tw, th = text_size(draw, text, face)
    draw.text((x1 + (x2 - x1 - tw) / 2, y1 + (y2 - y1 - th) / 2 + dy), text, font=face, fill=fill)


def draw_background(draw: ImageDraw.ImageDraw, t: float) -> None:
    for y in range(HEIGHT):
        k = y / HEIGHT
        r = round(230 + 14 * k)
        g = round(246 + 6 * k)
        b = round(255 - 3 * k)
        draw.line((0, y, WIDTH, y), fill=(r, g, b))
    offset = int((t * 18) % 160)
    for x in range(-240, WIDTH + 240, 160):
        draw.line((x + offset, HEIGHT, x + 360 + offset, 0), fill=(20, 121, 255, 24), width=1)
    for y in range(150, HEIGHT, 180):
        draw.line((0, y, WIDTH, y), fill=(120, 190, 245, 32), width=1)
    draw.ellipse((-220, -260, 850, 620), fill=(46, 168, 255, 44))
    draw.ellipse((1030, 80, 2140, 850), fill=(22, 199, 212, 38))
    draw.ellipse((620, 680, 1560, 1270), fill=(20, 121, 255, 28))
    for i in range(38):
        x = int((i * 251 + t * (14 + i % 5)) % WIDTH)
        y = int((i * 149 + math.sin(t * 0.7 + i) * 18) % HEIGHT)
        color = (20, 121, 255, 68) if i % 4 else (22, 199, 212, 78)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)


def draw_brand(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((78, 52, 420, 122), radius=24, fill=(255, 255, 255, 220), outline="#b9ddff", width=1)
    draw.rounded_rectangle((98, 66, 140, 108), radius=11, fill=BLUE)
    draw.polygon([(121, 74), (109, 96), (121, 93), (115, 104), (133, 82), (121, 85)], fill="#ffffff")
    draw.text((156, 63), "SPARK AppWorks", font=FONT_SMALL, fill=INK)
    draw.text((156, 96), "SPARK 融合平台 · 应用工场", font=FONT_TINY, fill=MUTED)


def draw_caption(draw: ImageDraw.ImageDraw, text: str) -> None:
    box = (250, 944, WIDTH - 250, 1022)
    draw.rounded_rectangle(box, radius=24, fill=(255, 255, 255, 232), outline=BLUE_2, width=2)
    center_text(draw, box, text, FONT_BODY, INK)


def fade(img: Image.Image, local: float) -> Image.Image:
    alpha = 0.0
    fade_span = 0.045
    max_alpha = 0.62
    if local < fade_span:
        alpha = max_alpha * (1 - local / fade_span)
    elif local > 1 - fade_span:
        alpha = max_alpha * ((local - (1 - fade_span)) / fade_span)
    if alpha <= 0:
        return img
    layer = Image.new("RGBA", img.size, (236, 248, 255, round(alpha * 255)))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str, body: str, accent: str) -> None:
    draw.rounded_rectangle((box[0] + 8, box[1] + 12, box[2] + 8, box[3] + 12), radius=26, fill=(27, 103, 180, 28))
    draw.rounded_rectangle(box, radius=26, fill=CARD, outline=BORDER, width=2)
    draw.rounded_rectangle((box[0] + 30, box[1] + 30, box[0] + 82, box[1] + 82), radius=15, fill=accent)
    draw.text((box[0] + 106, box[1] + 31), title, font=FONT_H3, fill=INK)
    draw.text((box[0] + 106, box[1] + 90), body, font=FONT_SMALL, fill=MUTED)


def scene_title(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    pulse = 1 + math.sin(local * math.pi) * 0.035
    draw.ellipse((500, 145, 1420, 875), fill=(46, 168, 255, 48))
    draw.ellipse((820, 205, 1650, 760), fill=(22, 199, 212, 36))
    center_text(draw, (0, 205, WIDTH, 305), "SPARK AppWorks", FONT_LOGO, INK)
    center_text(draw, (0, 325, WIDTH, 390), "SPARK 应用工场", FONT_H2, BLUE)
    center_text(draw, (0, 430, WIDTH, 500), "AI开发的工业化革命", FONT_H2, CYAN)

    runtime = (730, 575, 1190, 740)
    draw.rounded_rectangle((runtime[0] + 8, runtime[1] + 12, runtime[2] + 8, runtime[3] + 12), radius=34, fill=(20, 121, 255, 32))
    draw.rounded_rectangle(runtime, radius=34, fill=CARD, outline=BLUE, width=3)
    draw.ellipse((790, 598, 1130, 718), outline=CYAN, width=3)
    center_text(draw, (runtime[0], runtime[1] + 25, runtime[2], runtime[1] + 90), "AI Runtime", FONT_H3, INK)
    center_text(draw, (runtime[0], runtime[1] + 92, runtime[2], runtime[1] + 145), "统一解释执行", FONT_SMALL, BLUE)
    for idx, label in enumerate(["可配置", "可治理", "可复用"]):
        x = 640 + idx * 235
        y = 790 + int(math.sin(local * math.pi * 2 + idx) * 5 * pulse)
        draw.rounded_rectangle((x, y, x + 175, y + 48), radius=18, fill=CARD, outline=BORDER, width=1)
        center_text(draw, (x, y, x + 175, y + 48), label, FONT_SMALL, INK_2)


def scene_pain(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    items = [
        ("需求碎片化", "同一类页面反复沟通、反复实现", "#ef4444"),
        ("代码分叉", "客户差异沉进源码，版本越来越重", BLUE),
        ("交付不可控", "问题难定位，修复难复盘，升级难统一", CYAN),
    ]
    for i, (title, body, accent) in enumerate(items):
        x = 190 + i * 530
        y = 470 + int(math.sin(local * 2.4 + i) * 6)
        card(draw, (x, y, x + 430, y + 230), title, body, accent)
        draw.rounded_rectangle((x + 30, y + 160, x + 350, y + 174), radius=7, fill="#d8ebff")
        draw.rounded_rectangle((x + 30, y + 190, x + 250, y + 204), radius=7, fill="#c7e4ff")


def scene_positioning(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)

    layers = [
        ("业务需求", "行业场景、流程规则、交付目标", BLUE),
        ("应用资产", "页面、数据、权限、脚本", CYAN),
        ("稳定运行时", "解释执行、热更新、治理回滚", BLUE_2),
    ]
    base_y = 420
    for i, (title, body, accent) in enumerate(layers):
        x = 260 + i * 500
        y = base_y + int(math.sin(local * math.pi * 2 + i) * 8)
        draw.rounded_rectangle((x + 8, y + 12, x + 398, y + 247), radius=30, fill=(20, 121, 255, 28))
        draw.rounded_rectangle((x, y, x + 390, y + 235), radius=30, fill=CARD, outline=accent, width=3)
        draw.rounded_rectangle((x + 30, y + 32, x + 88, y + 90), radius=16, fill=accent)
        draw.text((x + 112, y + 34), title, font=FONT_H3, fill=INK)
        draw.text((x + 36, y + 116), body, font=FONT_SMALL, fill=MUTED)
        draw.rounded_rectangle((x + 36, y + 168, x + 340, y + 182), radius=7, fill="#d8ebff")
        draw.rounded_rectangle((x + 36, y + 198, x + 270, y + 212), radius=7, fill="#c7e4ff")
        if i < len(layers) - 1:
            draw.line((x + 410, y + 118, x + 480, y + 118), fill=LINE, width=5)
            draw.polygon([(x + 480, y + 118), (x + 460, y + 106), (x + 460, y + 130)], fill=LINE)

    draw.rounded_rectangle((520, 765, 1400, 835), radius=24, fill=CARD, outline=BORDER, width=1)
    center_text(draw, (520, 765, 1400, 835), "把“生成一次”升级为“持续生产、持续治理”", FONT_SMALL, INK_2)


def scene_solution(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    center = (690, 390, 1230, 690)
    draw.rounded_rectangle((center[0] + 10, center[1] + 14, center[2] + 10, center[3] + 14), radius=40, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(center, radius=40, fill=CARD, outline=BLUE, width=3)
    center_text(draw, (center[0], center[1] + 48, center[2], center[1] + 118), "SPARK AppWorks", FONT_H2, INK)
    center_text(draw, (center[0], center[1] + 128, center[2], center[1] + 190), "应用工场", FONT_H3, BLUE)
    center_text(draw, (center[0], center[1] + 205, center[2], center[1] + 265), "把 AI 输出变成标准资产", FONT_SMALL, CYAN)
    for box, label in [
        ((170, 440, 520, 565), "业务需求"),
        ((170, 600, 520, 725), "企业规则"),
        ((1400, 440, 1750, 565), "配置资产"),
        ((1400, 600, 1750, 725), "可运行应用"),
    ]:
        draw.rounded_rectangle(box, radius=24, fill=CARD, outline=BORDER, width=2)
        center_text(draw, box, label, FONT_H3, INK)
    draw.line((520, 502, 690, 505), fill=LINE, width=6)
    draw.line((520, 662, 690, 575), fill=LINE, width=6)
    draw.line((1230, 505, 1400, 502), fill=LINE, width=6)
    draw.line((1230, 575, 1400, 662), fill=LINE, width=6)


def scene_assets(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)

    assets = [
        ("页面结构", "组件树、布局、动作", "rule.json", BLUE),
        ("数据模型", "表结构、关系、聚合", "pagedata.json", BLUE_2),
        ("权限策略", "角色、范围、可见性", "permission", CYAN),
        ("业务脚本", "事件响应、业务分支", "script.js", INK_2),
    ]
    for i, (title, body, tag, accent) in enumerate(assets):
        x = 145 + i * 445
        y = 450 + int(math.sin(local * math.pi * 2 + i) * 7)
        draw.rounded_rectangle((x + 8, y + 12, x + 368, y + 302), radius=28, fill=(20, 121, 255, 26))
        draw.rounded_rectangle((x, y, x + 360, y + 290), radius=28, fill=CARD, outline=BORDER, width=2)
        draw.rounded_rectangle((x + 30, y + 34, x + 185, y + 76), radius=14, fill=accent)
        draw.text((x + 48, y + 39), tag, font=FONT_TINY, fill="#ffffff")
        draw.text((x + 30, y + 126), title, font=FONT_H3, fill=INK)
        draw.text((x + 30, y + 184), body, font=FONT_SMALL, fill=MUTED)
        draw.rounded_rectangle((x + 30, y + 235, x + 315, y + 248), radius=6, fill="#d8ebff")
        if i < len(assets) - 1:
            draw.line((x + 360, y + 160, x + 445, y + 160), fill=LINE, width=5)
    draw.rounded_rectangle((560, 805, 1360, 870), radius=24, fill=CARD, outline=BORDER, width=1)
    center_text(draw, (560, 805, 1360, 870), "应用能力沉淀为标准资产，才具备规模化复用的基础", FONT_SMALL, INK_2)


def scene_pipeline(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    steps = ["需求", "生成", "预览", "发布", "运行", "修复"]
    active = min(len(steps) - 1, int(local * len(steps)))
    y = 565
    for i, label in enumerate(steps):
        x = 210 + i * 290
        if i:
            draw.line((x - 190, y, x - 55, y), fill=LINE, width=5)
        accent = BLUE if i == active else CYAN
        draw.ellipse((x - 56, y - 56, x + 56, y + 56), fill=CARD, outline=accent, width=4)
        center_text(draw, (x - 56, y - 56, x + 56, y + 56), f"{i + 1}", FONT_H3, accent)
        center_text(draw, (x - 90, y + 82, x + 90, y + 132), label, FONT_H3, INK)
    draw.rounded_rectangle((560, 760, 1360, 830), radius=24, fill=CARD, outline=BORDER, width=1)
    center_text(draw, (560, 760, 1360, 830), "生成不是终点，运行反馈会继续驱动修复", FONT_SMALL, INK_2)


def scene_runtime(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    center = (690, 405, 1230, 710)
    modules = [
        ((185, 445, 545, 570), "DataSet", "统一数据模型"),
        ((185, 650, 545, 775), "DataView", "业务视图编排"),
        ((1375, 445, 1735, 570), "权限快照", "权限变化可追踪"),
        ((1375, 650, 1735, 775), "多租户", "多系统统一承载"),
    ]
    for box, _, _ in modules:
        draw.line(((box[0] + box[2]) // 2, (box[1] + box[3]) // 2, (center[0] + center[2]) // 2, (center[1] + center[3]) // 2), fill=LINE, width=4)
    draw.rounded_rectangle((center[0] + 10, center[1] + 14, center[2] + 10, center[3] + 14), radius=44, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(center, radius=44, fill=CARD, outline=BLUE, width=4)
    draw.ellipse((770, 450, 1150, 665), outline=CYAN, width=4)
    center_text(draw, (center[0], center[1] + 60, center[2], center[1] + 128), "SPARK Runtime", FONT_H2, INK)
    center_text(draw, (center[0], center[1] + 142, center[2], center[1] + 200), "统一解释执行", FONT_BODY, BLUE)
    center_text(draw, (center[0], center[1] + 210, center[2], center[1] + 260), "稳定底座", FONT_SMALL, CYAN)
    for box, title, body in modules:
        draw.rounded_rectangle(box, radius=24, fill=CARD, outline=BORDER, width=2)
        center_text(draw, (box[0], box[1] + 20, box[2], box[1] + 70), title, FONT_H3, INK)
        center_text(draw, (box[0], box[1] + 72, box[2], box[1] + 112), body, FONT_SMALL, MUTED)


def scene_value(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    metrics = [
        ("10-30分钟", "页面生产时间", BLUE),
        ("10-15秒", "单次迭代速度", CYAN),
        ("统一复用", "运行时与配置资产", "#ef4444"),
    ]
    for i, (value, label, accent) in enumerate(metrics):
        x = 245 + i * 520
        y = 470
        draw.rounded_rectangle((x + 8, y + 12, x + 398, y + 222), radius=30, fill=(20, 121, 255, 26))
        draw.rounded_rectangle((x, y, x + 390, y + 210), radius=30, fill=CARD, outline=accent, width=3)
        center_text(draw, (x, y + 45, x + 390, y + 120), value, FONT_H2, INK)
        center_text(draw, (x, y + 125, x + 390, y + 175), label, FONT_SMALL, MUTED)
    center_text(draw, (0, 760, WIDTH, 850), "SPARK AppWorks", FONT_LOGO, INK)
    center_text(draw, (0, 852, WIDTH, 910), "企业应用系统，是 AI 配出来的。", FONT_H2, BLUE)


def scene_scenarios(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    cards = [
        ("应用管理", "租户 / 项目 / 应用入口"),
        ("树形配置", "导航树、组织树、分类树"),
        ("主从联动", "DataView 驱动业务视图"),
        ("权限渲染", "改权限，不改页面代码"),
        ("数据看板", "指标聚合与可视化"),
        ("持续治理", "预览、发布、回滚、审计"),
    ]
    for i, (title, body) in enumerate(cards):
        col = i % 3
        row = i // 3
        x = 190 + col * 525
        y = 405 + row * 230 + int(math.sin(local * math.pi * 2 + i) * 6)
        accent = BLUE if i % 2 == 0 else CYAN
        draw.rounded_rectangle((x + 8, y + 12, x + 428, y + 177), radius=26, fill=(20, 121, 255, 24))
        draw.rounded_rectangle((x, y, x + 420, y + 165), radius=26, fill=CARD, outline=BORDER, width=2)
        draw.rounded_rectangle((x + 28, y + 30, x + 80, y + 82), radius=15, fill=accent)
        draw.text((x + 104, y + 29), title, font=FONT_H3, fill=INK)
        draw.text((x + 104, y + 88), body, font=FONT_SMALL, fill=MUTED)
        draw.rounded_rectangle((x + 28, y + 122, x + 355, y + 136), radius=7, fill="#d8ebff")


def scene_ecosystem(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    center = (770, 455, 1150, 690)
    draw.rounded_rectangle((center[0] + 8, center[1] + 12, center[2] + 8, center[3] + 12), radius=38, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(center, radius=38, fill=CARD, outline=BLUE, width=3)
    center_text(draw, (center[0], center[1] + 55, center[2], center[1] + 125), "AppWorks", FONT_H2, INK)
    center_text(draw, (center[0], center[1] + 135, center[2], center[1] + 190), "应用工场生态", FONT_SMALL, BLUE)
    nodes = [
        ("客户场景", 330, 430, BLUE),
        ("实施伙伴", 1310, 430, CYAN),
        ("开发者", 330, 720, BLUE_2),
        ("行业标准", 1310, 720, "#ef4444"),
    ]
    for label, x, y, accent in nodes:
        draw.line((x + 180, y + 55, (center[0] + center[2]) // 2, (center[1] + center[3]) // 2), fill=LINE, width=4)
        draw.rounded_rectangle((x, y, x + 360, y + 110), radius=28, fill=CARD, outline=accent, width=3)
        center_text(draw, (x, y + 10, x + 360, y + 64), label, FONT_H3, INK)
        center_text(draw, (x, y + 62, x + 360, y + 102), "共建 · 复用 · 增长", FONT_TINY, MUTED)


def scene_closing(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    glow = 1 + math.sin(local * math.pi) * 0.08
    draw.ellipse((300, 120, 1620, 1160), fill=(46, 168, 255, 42))
    draw.ellipse((920, 180, 1920, 880), fill=(22, 199, 212, 34))
    center_text(draw, (0, 170, WIDTH, 270), scene["title"], FONT_LOGO, INK)
    center_text(draw, (0, 280, WIDTH, 345), scene["subtitle"], FONT_H2, BLUE)
    runtime = (690, 405, 1230, 630)
    draw.rounded_rectangle((runtime[0] + 10, runtime[1] + 14, runtime[2] + 10, runtime[3] + 14), radius=42, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(runtime, radius=42, fill=CARD, outline=BLUE, width=3)
    draw.ellipse((775, 438, 1145, 592), outline=CYAN, width=4)
    center_text(draw, (runtime[0], runtime[1] + 35, runtime[2], runtime[1] + 105), "AI Runtime", FONT_H2, INK)
    center_text(draw, (runtime[0], runtime[1] + 120, runtime[2], runtime[1] + 185), "统一解释执行", FONT_BODY, BLUE)
    center_text(draw, (0, 700, WIDTH, 790), "企业应用系统，是 AI 配出来的。", FONT_H1, INK)
    for i, text in enumerate(["标准资产", "稳定运行", "持续复用"]):
        w = int(180 * glow)
        x = 600 + i * 270
        draw.rounded_rectangle((x, 835, x + w, 890), radius=20, fill=CARD, outline=BORDER, width=1)
        center_text(draw, (x, 835, x + w, 890), text, FONT_SMALL, INK_2)


RENDERERS = {
    "title": scene_title,
    "pain": scene_pain,
    "positioning": scene_positioning,
    "solution": scene_solution,
    "assets": scene_assets,
    "pipeline": scene_pipeline,
    "runtime": scene_runtime,
    "scenarios": scene_scenarios,
    "value": scene_value,
    "ecosystem": scene_ecosystem,
    "closing": scene_closing,
}


def render_frame(t: float, ranges: list[tuple[float, float, dict[str, str]]]) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), "#eaf7ff")
    draw = ImageDraw.Draw(img, "RGBA")
    draw_background(draw, t)
    start, end, scene = ranges[-1]
    for candidate_start, candidate_end, candidate_scene in ranges:
        if candidate_start <= t < candidate_end:
            start, end, scene = candidate_start, candidate_end, candidate_scene
            break
    local = max(0.0, min(1.0, (t - start) / max(0.001, end - start)))
    RENDERERS[scene["key"]](draw, local, scene)
    draw_caption(draw, scene["caption"])
    return fade(img, local)


def synthesize_narration(ffmpeg: str, voice: str, work_dir: Path) -> Path:
    audio_parts: list[Path] = []
    for index, scene in enumerate(SCENES, start=1):
        audio = work_dir / f"voice-{index:02d}.mp3"
        command = [
            sys.executable,
            "-m",
            "edge_tts",
            "--voice",
            voice,
            "--rate",
            "+0%",
            "--text",
            scene["voice"],
            "--write-media",
            str(audio),
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        except subprocess.CalledProcessError:
            fallback = "zh-CN-XiaoxiaoNeural"
            command[command.index(voice)] = fallback
            subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8", errors="ignore")

        voice_duration = parse_duration(ffmpeg, audio)
        scene_duration = float(scene["duration"])
        scene_audio = work_dir / f"scene-{index:02d}.wav"
        if voice_duration < scene_duration:
            silence = work_dir / f"pad-{index:02d}.wav"
            run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=channel_layout=mono:sample_rate=48000",
                    "-t",
                    f"{scene_duration - voice_duration:.3f}",
                    str(silence),
                ]
            )
            run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(audio),
                    "-i",
                    str(silence),
                    "-filter_complex",
                    "[0:a]aresample=48000,aformat=channel_layouts=mono[a0];[1:a]aresample=48000,aformat=channel_layouts=mono[a1];[a0][a1]concat=n=2:v=0:a=1[a]",
                    "-map",
                    "[a]",
                    str(scene_audio),
                ]
            )
        else:
            run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(audio),
                    "-t",
                    f"{scene_duration:.3f}",
                    "-ac",
                    "1",
                    "-ar",
                    "48000",
                    str(scene_audio),
                ]
            )
        audio_parts.append(scene_audio)
    concat = work_dir / "audio-list.txt"
    concat.write_text("".join(f"file '{path.resolve().as_posix()}'\n" for path in audio_parts), encoding="utf-8")
    narration = work_dir / "narration.wav"
    narration.unlink(missing_ok=True)
    run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat),
            "-ac",
            "1",
            "-ar",
            "48000",
            str(narration),
        ]
    )
    return narration


def write_music(path: Path, duration: float) -> None:
    sample_rate = 48000
    chords = [
        (110.0, 164.81, 220.0),
        (98.0, 146.83, 196.0),
        (130.81, 196.0, 261.63),
        (146.83, 220.0, 293.66),
    ]
    total = int(duration * sample_rate)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for i in range(total):
            t = i / sample_rate
            chord = chords[int(t / 4.0) % len(chords)]
            env = min(1.0, t / 2.5, max(0.0, (duration - t) / 2.5))
            shimmer = 0.5 + 0.5 * math.sin(2 * math.pi * 0.07 * t)
            sample = 0.0
            for freq in chord:
                sample += math.sin(2 * math.pi * freq * t) * 0.14
                sample += math.sin(2 * math.pi * freq * 2 * t) * 0.035
            sample *= env * shimmer * 0.18
            value = int(max(-1.0, min(1.0, sample)) * 32767)
            frames.extend(struct.pack("<h", value))
        wav.writeframes(frames)


def render_video(output: Path, narration: Path, music: Path, ffmpeg: str) -> None:
    ranges = []
    cursor = 0.0
    for scene in SCENES:
        duration = float(scene["duration"])
        ranges.append((cursor, cursor + duration, scene))
        cursor += duration
    total_duration = cursor
    if abs(total_duration - TARGET_DURATION) > 0.01:
        raise RuntimeError(f"Scene durations sum to {total_duration:.3f}, expected {TARGET_DURATION:.3f}")
    total_frames = round(total_duration * FPS)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-i",
        str(narration),
        "-i",
        str(music),
        "-filter_complex",
        "[1:a]volume=1.2[a1];[2:a]volume=0.22,lowpass=f=1600[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=1[a]",
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "16",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_index in range(total_frames):
            frame = render_frame(frame_index / FPS, ranges)
            process.stdin.write(frame.tobytes())
            if frame_index % (FPS * 8) == 0:
                print(f"  frame {frame_index}/{total_frames}", flush=True)
    finally:
        process.stdin.close()
    exit_code = process.wait()
    if exit_code:
        raise SystemExit(exit_code)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the final SPARK AppWorks promo video.")
    parser.add_argument("--output-dir", default=str(DESKTOP_OUTPUT))
    parser.add_argument("--voice", default="zh-CN-YunjianNeural")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    ffmpeg = ffmpeg_path()
    narration = synthesize_narration(ffmpeg, args.voice, WORK_DIR)
    total_duration = TARGET_DURATION
    music = WORK_DIR / "ambient-bed.wav"
    write_music(music, total_duration)

    premium_output = output_dir / PREMIUM_NAME
    final_output = output_dir / FINAL_NAME
    render_video(premium_output, narration, music, ffmpeg)

    if final_output.exists():
        backup = output_dir / "SPARK AppWorks：AI开发的工业化革命_720p无声旧版.mp4"
        if not backup.exists():
            shutil.copy2(final_output, backup)
    shutil.copy2(premium_output, final_output)
    print(premium_output)
    print(final_output)


if __name__ == "__main__":
    main()
