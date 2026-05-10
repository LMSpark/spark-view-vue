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

DESKTOP_OUTPUT = Path("C:/Users/lgf22/Desktop/SPARK_AppWorks_宣传片输出")
FINAL_NAME = "SPARK AppWorks：AI开发的工业化革命.mp4"
ALT_NAME = "SPARK AppWorks：AI开发的工业化革命_差异与工业革命版.mp4"
WORK_DIR = Path("D:/SPARK_VIEW/outputs/appworks-coherent-promo")

INK = "#073763"
INK_2 = "#0f4c81"
MUTED = "#4b7194"
BLUE = "#1479ff"
BLUE_2 = "#2ea8ff"
CYAN = "#16c7d4"
RED = "#ef4444"
CARD = "#ffffff"
BORDER = "#acd7ff"
LINE = "#7fc0ff"


SCENES = [
    {
        "key": "opening",
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "面向企业应用生产的 AI 工业化能力",
        "voice": "SPARK AppWorks，中文名 SPARK 应用工场。它是领码科技 SPARK 融合平台面向企业应用生产的核心能力。我们要讲的，不是又一个 AI 写代码工具，而是一次企业应用生产方式的变化。",
    },
    {
        "key": "problem",
        "title": "企业应用的难点，不在第一版",
        "subtitle": "真正消耗成本的是持续交付、持续变更、持续维护",
        "caption": "需求越多，系统越多，分叉和维护压力越大",
        "voice": "在很多企业里，第一版系统并不难做。真正困难的是后面。客户差异越来越多，权限规则越来越细，业务流程不断变化，代码分支也越来越重。普通 AI 工具可以提高写代码的速度，但它没有改变代码分叉、交付割裂和长期维护这件事。",
    },
    {
        "key": "difference",
        "title": "和普通 AI 开发工具的区别",
        "subtitle": "普通 AI 工具加速写代码，AppWorks 改变应用生产线",
        "caption": "从“生成代码”升级为“生产可运行、可治理的应用”",
        "voice": "区别在这里。普通 AI 开发工具的核心，是围绕开发者和源码工程，帮助补全代码、生成片段、解释问题。它提升的是个人编程效率。SPARK AppWorks 的核心，是围绕企业应用生产，把业务意图转成配置资产，再由统一运行时承载。它提升的是交付体系的效率、稳定性和复用能力。",
    },
    {
        "key": "position",
        "title": "应用工场：把 AI 放进生产体系",
        "subtitle": "让 AI 在受约束的配置空间里工作",
        "caption": "不是无边界生成代码，而是生成可治理的应用资产",
        "voice": "SPARK AppWorks 的思路，是把 AI 放进一个受约束、可治理的生产体系。AI 不再无边界地散写源码，而是在平台定义的规则、资产和运行时之内，生成可以校验、可以回滚、可以复用的应用配置。",
    },
    {
        "key": "assets",
        "title": "四类资产，组成一套企业应用",
        "subtitle": "页面结构、数据模型、权限策略、业务脚本",
        "caption": "应用不再是临时代码，而是标准化资产",
        "voice": "一套企业应用，可以被拆成四类核心资产。页面结构描述交互和组件，数据模型承载业务对象，权限策略控制访问边界，业务脚本表达领域逻辑。资产越标准，应用生产就越稳定。",
    },
    {
        "key": "revolution",
        "title": "为什么说这是工业化革命",
        "subtitle": "因为变化的不只是工具，而是软件生产方式",
        "caption": "标准件、流水线、质量体系、规模复用",
        "voice": "所以，工业化革命不是一句口号。过去的软件交付更像手工作坊，依赖具体工程师和具体项目经验。AppWorks 做的是工业化：把应用拆成标准件，把交付过程变成流水线，把质量控制放进运行时和治理链路，把一次交付沉淀为下一次复用的生产能力。",
    },
    {
        "key": "runtime",
        "title": "统一运行时，承载持续变化",
        "subtitle": "DataSet、DataView、权限快照、多租户多系统",
        "caption": "变化留在配置层，能力沉淀在平台层",
        "voice": "这些配置资产并不是孤立存在的。它们由统一运行时解释执行。DataSet 处理数据模型，DataView 组织业务视图，权限快照记录访问变化，多租户和多系统共享同一套底座。变化留在配置层，能力沉淀在平台层。",
    },
    {
        "key": "loop",
        "title": "从需求到运行，形成生产闭环",
        "subtitle": "需求、生成、预览、发布、运行、修复",
        "caption": "每一步可追踪，每一次调整可复盘",
        "voice": "于是，应用生产形成一条闭环。业务需求进入平台，AI 生成配置，团队即时预览，确认后发布运行。运行中的日志和反馈，再回到修复环节。这样，生成不是终点，运行反馈会继续驱动应用变得更稳定。",
    },
    {
        "key": "scenes",
        "title": "一个工场，交付多类业务系统",
        "subtitle": "应用管理、树形配置、主从联动、权限渲染、数据看板",
        "caption": "同一套生产体系，覆盖更多企业场景",
        "voice": "在这个基础上，AppWorks 可以持续交付不同类型的业务系统。应用管理、树形配置、主从联动、权限渲染、数据看板，都可以复用同一套资产和运行能力。每交付一次，就沉淀一次下一次可复用的生产能力。",
    },
    {
        "key": "value",
        "title": "从手工作坊，到应用工场",
        "subtitle": "更快交付，稳定可控，持续复用",
        "caption": "把软件生产方式，从项目制推进到平台化",
        "voice": "这就是 SPARK AppWorks 的价值。它带来的不是单点提速，而是交付效率、运行稳定性、资产复用率和治理能力的整体提升。企业应用生产，从手工作坊走向应用工场。",
    },
    {
        "key": "closing",
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "企业应用系统，是 AI 配出来的。",
        "voice": "SPARK AppWorks。让企业应用系统，是 AI 配出来的。让 AI 开发，成为可持续生产的工业化能力。",
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


FONT_LOGO = font(86, True)
FONT_H1 = font(62, True)
FONT_H2 = font(40, True)
FONT_H3 = font(32, True)
FONT_BODY = font(28)
FONT_SMALL = font(23)
FONT_TINY = font(18)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def ffmpeg_path() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


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
        raise RuntimeError(f"Cannot parse duration for {path}")
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def text_size(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=face)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def center_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, face: ImageFont.FreeTypeFont, fill: str) -> None:
    x1, y1, x2, y2 = box
    tw, th = text_size(draw, text, face)
    draw.text((x1 + (x2 - x1 - tw) / 2, y1 + (y2 - y1 - th) / 2), text, font=face, fill=fill)


def draw_background(draw: ImageDraw.ImageDraw, t: float) -> None:
    for y in range(HEIGHT):
        k = y / HEIGHT
        draw.line((0, y, WIDTH, y), fill=(round(230 + 14 * k), round(246 + 6 * k), 255))
    draw.ellipse((-280, -240, 860, 590), fill=(46, 168, 255, 44))
    draw.ellipse((1020, 90, 2140, 830), fill=(22, 199, 212, 34))
    draw.ellipse((620, 705, 1580, 1280), fill=(20, 121, 255, 26))
    offset = int((t * 16) % 160)
    for x in range(-280, WIDTH + 300, 160):
        draw.line((x + offset, HEIGHT, x + 350 + offset, 0), fill=(20, 121, 255, 22), width=1)
    for y in range(150, HEIGHT, 180):
        draw.line((0, y, WIDTH, y), fill=(120, 190, 245, 28), width=1)
    for i in range(34):
        x = int((i * 257 + t * (11 + i % 4)) % WIDTH)
        y = int((i * 151 + math.sin(t * 0.8 + i) * 16) % HEIGHT)
        color = (20, 121, 255, 62) if i % 3 else (22, 199, 212, 70)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)


def draw_brand(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((78, 52, 420, 122), radius=24, fill=(255, 255, 255, 230), outline=BORDER, width=1)
    draw.rounded_rectangle((98, 66, 140, 108), radius=11, fill=BLUE)
    draw.polygon([(121, 74), (109, 96), (121, 93), (115, 104), (133, 82), (121, 85)], fill="#ffffff")
    draw.text((156, 63), "SPARK AppWorks", font=FONT_SMALL, fill=INK)
    draw.text((156, 96), "SPARK 融合平台 · 应用工场", font=FONT_TINY, fill=MUTED)


def draw_caption(draw: ImageDraw.ImageDraw, text: str) -> None:
    box = (250, 944, WIDTH - 250, 1022)
    draw.rounded_rectangle(box, radius=24, fill=(255, 255, 255, 236), outline=BLUE_2, width=2)
    center_text(draw, box, text, FONT_BODY, INK)


def card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str, body: str, accent: str) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1 + 8, y1 + 12, x2 + 8, y2 + 12), radius=28, fill=(20, 121, 255, 24))
    draw.rounded_rectangle(box, radius=28, fill=CARD, outline=BORDER, width=2)
    draw.rounded_rectangle((x1 + 28, y1 + 28, x1 + 82, y1 + 82), radius=16, fill=accent)
    draw.text((x1 + 106, y1 + 28), title, font=FONT_H3, fill=INK)
    draw.text((x1 + 106, y1 + 88), body, font=FONT_SMALL, fill=MUTED)
    draw.rounded_rectangle((x1 + 32, y2 - 54, x2 - 34, y2 - 41), radius=6, fill="#d7ecff")


def scene_opening(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw.ellipse((470, 130, 1450, 870), fill=(20, 121, 255, 38))
    draw.ellipse((850, 200, 1700, 780), fill=(22, 199, 212, 34))
    center_text(draw, (0, 205, WIDTH, 305), scene["title"], FONT_LOGO, INK)
    center_text(draw, (0, 326, WIDTH, 390), scene["subtitle"], FONT_H2, BLUE)
    center_text(draw, (0, 430, WIDTH, 500), "AI开发的工业化革命", FONT_H2, CYAN)
    box = (725, 585, 1195, 752)
    draw.rounded_rectangle((box[0] + 8, box[1] + 12, box[2] + 8, box[3] + 12), radius=36, fill=(20, 121, 255, 28))
    draw.rounded_rectangle(box, radius=36, fill=CARD, outline=BLUE, width=3)
    draw.ellipse((785, 612, 1135, 728), outline=CYAN, width=3)
    center_text(draw, (box[0], box[1] + 35, box[2], box[1] + 92), "AI Runtime", FONT_H3, INK)
    center_text(draw, (box[0], box[1] + 96, box[2], box[1] + 145), "统一解释执行", FONT_SMALL, BLUE)
    for i, label in enumerate(["稳定", "可控", "可持续"]):
        x = 650 + i * 235
        y = 800 + int(math.sin(local * math.pi * 2 + i) * 5)
        draw.rounded_rectangle((x, y, x + 175, y + 48), radius=18, fill=CARD, outline=BORDER, width=1)
        center_text(draw, (x, y, x + 175, y + 48), label, FONT_SMALL, INK_2)


def scene_problem(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    items = [
        ("客户差异", "规则不断变化"),
        ("权限细分", "边界越来越复杂"),
        ("代码分叉", "升级越来越困难"),
    ]
    for i, (title, body) in enumerate(items):
        card(draw, (205 + i * 510, 470, 605 + i * 510, 700), title, body, [RED, BLUE, CYAN][i])


def scene_difference(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)

    left = (155, 385, 880, 805)
    right = (1040, 385, 1765, 805)
    for box, title, accent in [
        (left, "普通 AI 开发工具", RED),
        (right, "SPARK AppWorks", BLUE),
    ]:
        x1, y1, x2, y2 = box
        draw.rounded_rectangle((x1 + 10, y1 + 14, x2 + 10, y2 + 14), radius=32, fill=(20, 121, 255, 24))
        draw.rounded_rectangle(box, radius=32, fill=CARD, outline=accent, width=3)
        draw.rounded_rectangle((x1 + 36, y1 + 36, x1 + 96, y1 + 96), radius=18, fill=accent)
        draw.text((x1 + 122, y1 + 42), title, font=FONT_H2, fill=INK)

    left_steps = ["提示词", "代码片段", "源码工程"]
    right_steps = ["业务意图", "配置资产", "统一运行时"]
    for i, label in enumerate(left_steps):
        x = 235 + i * 195
        draw.rounded_rectangle((x, 530, x + 150, 580), radius=18, fill="#fff4f4", outline="#fecaca", width=1)
        center_text(draw, (x, 530, x + 150, 580), label, FONT_SMALL, INK_2)
        if i < 2:
            draw.line((x + 155, 555, x + 188, 555), fill="#fecaca", width=4)
    for i, label in enumerate(right_steps):
        x = 1120 + i * 195
        draw.rounded_rectangle((x, 530, x + 150, 580), radius=18, fill="#eef7ff", outline=BORDER, width=1)
        center_text(draw, (x, 530, x + 150, 580), label, FONT_SMALL, INK_2)
        if i < 2:
            draw.line((x + 155, 555, x + 188, 555), fill=LINE, width=4)

    bullets = [
        (left[0] + 58, left[1] + 235, ["提升个人编码速度", "交付仍靠项目团队", "分叉仍留在源码里"], RED),
        (right[0] + 58, right[1] + 235, ["提升应用生产体系", "资产可校验可回滚", "运行与治理形成闭环"], BLUE),
    ]
    for x, y, lines, accent in bullets:
        for i, line in enumerate(lines):
            yy = y + i * 48
            draw.ellipse((x, yy + 9, x + 14, yy + 23), fill=accent)
            draw.text((x + 28, yy), line, font=FONT_SMALL, fill=MUTED)


def scene_position(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    left = (170, 460, 520, 585)
    mid = (690, 405, 1230, 700)
    right = (1400, 460, 1750, 585)
    bottom = (1400, 645, 1750, 770)
    for box, label in [(left, "业务需求"), (right, "配置资产"), (bottom, "可运行应用")]:
        draw.rounded_rectangle(box, radius=24, fill=CARD, outline=BORDER, width=2)
        center_text(draw, box, label, FONT_H3, INK)
    draw.rounded_rectangle((mid[0] + 10, mid[1] + 14, mid[2] + 10, mid[3] + 14), radius=40, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(mid, radius=40, fill=CARD, outline=BLUE, width=3)
    center_text(draw, (mid[0], mid[1] + 55, mid[2], mid[1] + 125), "SPARK AppWorks", FONT_H2, INK)
    center_text(draw, (mid[0], mid[1] + 138, mid[2], mid[1] + 190), "受约束配置空间", FONT_H3, BLUE)
    center_text(draw, (mid[0], mid[1] + 215, mid[2], mid[1] + 265), "可校验 · 可回滚 · 可复用", FONT_SMALL, CYAN)
    draw.line((520, 522, 690, 528), fill=LINE, width=6)
    draw.line((1230, 528, 1400, 522), fill=LINE, width=6)
    draw.line((1230, 580, 1400, 708), fill=LINE, width=6)


def scene_assets(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    items = [
        ("页面结构", "组件树、布局、动作", BLUE),
        ("数据模型", "业务对象、关系、聚合", BLUE_2),
        ("权限策略", "角色、范围、可见性", CYAN),
        ("业务脚本", "事件响应、业务分支", INK_2),
    ]
    for i, (title, body, accent) in enumerate(items):
        x = 165 + i * 430
        y = 455 + int(math.sin(local * math.pi * 2 + i) * 6)
        card(draw, (x, y, x + 350, y + 250), title, body, accent)
        if i < 3:
            draw.line((x + 350, y + 125, x + 430, y + 125), fill=LINE, width=5)


def scene_revolution(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    items = [
        ("标准件", "页面、数据、权限、脚本资产化", BLUE),
        ("流水线", "生成到修复闭环", CYAN),
        ("机器底座", "统一运行时解释执行", BLUE_2),
        ("质量体系", "校验、回滚、审计、复盘", INK_2),
    ]
    for i, (title, body, accent) in enumerate(items):
        x = 145 + i * 445
        y = 455 + int(math.sin(local * math.pi * 2 + i) * 5)
        card(draw, (x, y, x + 360, y + 250), title, body, accent)
        if i < 3:
            draw.line((x + 360, y + 125, x + 445, y + 125), fill=LINE, width=5)
    draw.rounded_rectangle((480, 780, 1440, 850), radius=24, fill=CARD, outline=BORDER, width=2)
    center_text(draw, (480, 780, 1440, 850), "不是把某一步做快，而是把软件生产从项目经验变成平台能力", FONT_SMALL, INK_2)


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
        draw.line(((box[0] + box[2]) // 2, (box[1] + box[3]) // 2, 960, 557), fill=LINE, width=4)
    draw.rounded_rectangle((center[0] + 10, center[1] + 14, center[2] + 10, center[3] + 14), radius=44, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(center, radius=44, fill=CARD, outline=BLUE, width=4)
    draw.ellipse((770, 450, 1150, 665), outline=CYAN, width=4)
    center_text(draw, (center[0], center[1] + 62, center[2], center[1] + 130), "SPARK Runtime", FONT_H2, INK)
    center_text(draw, (center[0], center[1] + 145, center[2], center[1] + 200), "统一解释执行", FONT_BODY, BLUE)
    center_text(draw, (center[0], center[1] + 210, center[2], center[1] + 260), "稳定底座", FONT_SMALL, CYAN)
    for box, title, body in modules:
        draw.rounded_rectangle(box, radius=24, fill=CARD, outline=BORDER, width=2)
        center_text(draw, (box[0], box[1] + 18, box[2], box[1] + 70), title, FONT_H3, INK)
        center_text(draw, (box[0], box[1] + 74, box[2], box[1] + 112), body, FONT_SMALL, MUTED)


def scene_loop(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
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


def scene_scenes(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
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
        y = 405 + row * 230 + int(math.sin(local * math.pi * 2 + i) * 5)
        card(draw, (x, y, x + 420, y + 165), title, body, BLUE if i % 2 == 0 else CYAN)


def scene_value(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw_brand(draw)
    draw.text((120, 155), scene["title"], font=FONT_H1, fill=INK)
    draw.text((122, 244), scene["subtitle"], font=FONT_BODY, fill=MUTED)
    items = [
        ("更快交付", "需求到可运行应用"),
        ("稳定可控", "结构校验、日志回传、版本回滚"),
        ("持续复用", "资产沉淀，能力复利"),
    ]
    for i, (title, body) in enumerate(items):
        card(draw, (235 + i * 520, 460, 625 + i * 520, 690), title, body, [BLUE, CYAN, BLUE_2][i])
    center_text(draw, (0, 770, WIDTH, 850), "企业应用生产，从项目制走向平台化", FONT_H2, INK)


def scene_closing(draw: ImageDraw.ImageDraw, local: float, scene: dict[str, str]) -> None:
    draw.ellipse((300, 120, 1620, 1160), fill=(46, 168, 255, 42))
    draw.ellipse((920, 180, 1920, 880), fill=(22, 199, 212, 34))
    center_text(draw, (0, 190, WIDTH, 290), scene["title"], FONT_LOGO, INK)
    center_text(draw, (0, 310, WIDTH, 375), scene["subtitle"], FONT_H2, BLUE)
    box = (690, 455, 1230, 650)
    draw.rounded_rectangle((box[0] + 10, box[1] + 14, box[2] + 10, box[3] + 14), radius=42, fill=(20, 121, 255, 30))
    draw.rounded_rectangle(box, radius=42, fill=CARD, outline=BLUE, width=3)
    center_text(draw, (box[0], box[1] + 35, box[2], box[1] + 105), "AI Runtime", FONT_H2, INK)
    center_text(draw, (box[0], box[1] + 112, box[2], box[1] + 170), "统一解释执行", FONT_BODY, BLUE)
    center_text(draw, (0, 730, WIDTH, 810), "企业应用系统，是 AI 配出来的。", FONT_H1, INK)


RENDERERS = {
    "opening": scene_opening,
    "problem": scene_problem,
    "difference": scene_difference,
    "position": scene_position,
    "assets": scene_assets,
    "revolution": scene_revolution,
    "runtime": scene_runtime,
    "loop": scene_loop,
    "scenes": scene_scenes,
    "value": scene_value,
    "closing": scene_closing,
}


def scene_weights() -> list[float]:
    return [max(18, len(scene["voice"])) for scene in SCENES]


def scene_ranges(total_duration: float) -> list[tuple[float, float, dict[str, str]]]:
    weights = scene_weights()
    total_weight = sum(weights)
    cursor = 0.0
    ranges = []
    for scene, weight in zip(SCENES, weights):
        duration = total_duration * weight / total_weight
        ranges.append((cursor, cursor + duration, scene))
        cursor += duration
    ranges[-1] = (ranges[-1][0], total_duration, ranges[-1][2])
    return ranges


def fade(img: Image.Image, local: float) -> Image.Image:
    span = 0.035
    alpha = 0
    if local < span:
        alpha = round(130 * (1 - local / span))
    elif local > 1 - span:
        alpha = round(130 * ((local - (1 - span)) / span))
    if alpha <= 0:
        return img
    return Image.alpha_composite(img.convert("RGBA"), Image.new("RGBA", img.size, (236, 248, 255, alpha))).convert("RGB")


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


def synthesize_voice(ffmpeg: str, voice: str, work_dir: Path) -> Path:
    script = "\n\n".join(scene["voice"] for scene in SCENES)
    script_path = work_dir / "narration-script.txt"
    script_path.write_text(script, encoding="utf-8")
    voice_path = work_dir / "continuous-narration.mp3"
    voice_path.unlink(missing_ok=True)
    run(
        [
            sys.executable,
            "-m",
            "edge_tts",
            "--voice",
            voice,
            "--rate=-5%",
            "--file",
            str(script_path),
            "--write-media",
            str(voice_path),
        ]
    )
    return voice_path


def write_music(path: Path, duration: float) -> None:
    sample_rate = 48000
    chords = [(130.81, 196.0, 261.63), (146.83, 220.0, 293.66), (110.0, 164.81, 220.0), (164.81, 246.94, 329.63)]
    total = int(duration * sample_rate)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for i in range(total):
            t = i / sample_rate
            chord = chords[int(t / 5.0) % len(chords)]
            env = min(1.0, t / 3.0, max(0.0, (duration - t) / 3.0))
            sample = sum(math.sin(2 * math.pi * f * t) * 0.12 for f in chord)
            sample += math.sin(2 * math.pi * 523.25 * t) * 0.015 * (0.5 + 0.5 * math.sin(t * 0.5))
            value = int(max(-1.0, min(1.0, sample * env * 0.18)) * 32767)
            frames.extend(struct.pack("<h", value))
        wav.writeframes(frames)


def render_video(output: Path, narration: Path, music: Path, duration: float, ffmpeg: str) -> None:
    ranges = scene_ranges(duration)
    frames = math.ceil(duration * FPS)
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
        "[1:a]volume=1.24[a1];[2:a]volume=0.16,lowpass=f=1600[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=1[a]",
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
        "-shortest",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for index in range(frames):
            process.stdin.write(render_frame(index / FPS, ranges).tobytes())
            if index % (FPS * 8) == 0:
                print(f"  frame {index}/{frames}", flush=True)
    finally:
        process.stdin.close()
    exit_code = process.wait()
    if exit_code:
        raise SystemExit(exit_code)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render SPARK AppWorks coherent promo.")
    parser.add_argument("--output-dir", default=str(DESKTOP_OUTPUT))
    parser.add_argument("--voice", default="zh-CN-YunjianNeural")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    ffmpeg = ffmpeg_path()
    narration = synthesize_voice(ffmpeg, args.voice, WORK_DIR)
    duration = parse_duration(ffmpeg, narration) + 2.0
    music = WORK_DIR / "music-bed.wav"
    write_music(music, duration)

    alt = output_dir / ALT_NAME
    final = output_dir / FINAL_NAME
    render_video(alt, narration, music, duration, ffmpeg)
    shutil.copy2(alt, final)
    print(alt)
    print(final)


if __name__ == "__main__":
    main()
