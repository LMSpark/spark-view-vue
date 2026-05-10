from __future__ import annotations

import math
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    import imageio_ffmpeg
except ImportError as exc:  # pragma: no cover - operator-facing script
    raise SystemExit("imageio-ffmpeg is required. Run: python -m pip install --user imageio-ffmpeg") from exc


WIDTH = 1920
HEIGHT = 1080
FPS = 24

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs" / "video-series" / "_rendered" / "appworks-promo"
OUTPUT_PATH = OUTPUT_DIR / "spark-appworks-promo.mp4"
NARRATION_PATH = OUTPUT_DIR / "narration.mp3"


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
FONT_H1 = font(66, True)
FONT_H2 = font(44, True)
FONT_H3 = font(32, True)
FONT_BODY = font(30)
FONT_SMALL = font(24)
FONT_TINY = font(19)
FONT_MONO = font(25)


SCENES = [
    {
        "key": "title",
        "duration": 5.2,
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "SPARK 融合平台的企业应用生产系统",
    },
    {
        "key": "pain",
        "duration": 9.2,
        "title": "企业应用，不该一页一页重复开发",
        "subtitle": "客户越多，系统越多，分叉越多，维护越重",
        "caption": "需求碎片化、代码分叉、权限散落，正在推高长期成本。",
    },
    {
        "key": "promise",
        "duration": 10.1,
        "title": "企业应用系统，是 AI 配出来的",
        "subtitle": "不是让 AI 无边界写代码，而是进入受约束配置空间",
        "caption": "让 AI 输出可校验、可回滚、可治理的应用资产。",
    },
    {
        "key": "assets",
        "duration": 10.5,
        "title": "四类资产，生产一套企业应用",
        "subtitle": "页面结构、数据模型、权限策略、业务脚本",
        "caption": "应用不再散落在临时代码里，而是进入标准化资产链路。",
    },
    {
        "key": "runtime",
        "duration": 10.9,
        "title": "稳定运行时，统一承载",
        "subtitle": "DataSet / DataView / 权限快照 / 多租户多系统",
        "caption": "变化优先收敛到配置层，平台能力持续复用。",
    },
    {
        "key": "loop",
        "duration": 10.6,
        "title": "AI 闭环进入生产链路",
        "subtitle": "生成、预览、日志回传、精准修复",
        "caption": "从需求到运行，再到修复，走在同一条闭环里。",
    },
    {
        "key": "scenarios",
        "duration": 9.8,
        "title": "从一个工场，交付多类业务系统",
        "subtitle": "应用管理、树形配置、主从联动、权限渲染、数据看板",
        "caption": "生产、交付、运行和治理，形成完整应用生命周期。",
    },
    {
        "key": "closing",
        "duration": 5.6,
        "title": "SPARK AppWorks",
        "subtitle": "SPARK 应用工场",
        "caption": "企业应用系统，是 AI 配出来的。",
    },
]


def parse_duration(ffmpeg: str, media: Path) -> float:
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(media), "-f", "null", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    if not match:
        return sum(scene["duration"] for scene in SCENES)
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def cumulative_scene_ranges(total_duration: float) -> list[tuple[float, float, dict[str, str | float]]]:
    base_total = sum(float(scene["duration"]) for scene in SCENES)
    scale = total_duration / base_total
    ranges = []
    cursor = 0.0
    for scene in SCENES:
        duration = float(scene["duration"]) * scale
        ranges.append((cursor, cursor + duration, scene))
        cursor += duration
    return ranges


def mix(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def ease_out(t: float) -> float:
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * t)


def draw_gradient(draw: ImageDraw.ImageDraw, top: str, bottom: str) -> None:
    c1 = rgb(top)
    c2 = rgb(bottom)
    for y in range(HEIGHT):
        k = y / (HEIGHT - 1)
        draw.line(
            (0, y, WIDTH, y),
            fill=(mix(c1[0], c2[0], k), mix(c1[1], c2[1], k), mix(c1[2], c2[2], k)),
        )


def alpha_layer(img: Image.Image) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer)


def compose(img: Image.Image, layer: Image.Image) -> Image.Image:
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def text_size(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=face)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        test = current + char
        if text_size(draw, test, face)[0] <= width:
            current = test
        else:
            if current:
                lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def draw_center(draw: ImageDraw.ImageDraw, y: int, text: str, face: ImageFont.FreeTypeFont, fill: str) -> None:
    w, _ = text_size(draw, text, face)
    draw.text(((WIDTH - w) // 2, y), text, font=face, fill=fill)


def draw_center_in_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: str,
    offset_y: int = 0,
) -> None:
    x1, y1, x2, y2 = box
    tw, th = text_size(draw, text, face)
    draw.text((x1 + (x2 - x1 - tw) // 2, y1 + (y2 - y1 - th) // 2 + offset_y), text, font=face, fill=fill)


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    fill: str = "#2b5268",
    width: int = 4,
) -> None:
    x1, y1 = start
    x2, y2 = end
    draw.line((x1, y1, x2, y2), fill=fill, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 18
    left = (x2 - math.cos(angle - 0.55) * size, y2 - math.sin(angle - 0.55) * size)
    right = (x2 - math.cos(angle + 0.55) * size, y2 - math.sin(angle + 0.55) * size)
    draw.polygon([(x2, y2), left, right], fill=fill)


def rounded_label(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: str,
    outline: str,
    text_fill: str,
    pad_x: int = 20,
    pad_y: int = 10,
) -> tuple[int, int, int, int]:
    x, y = xy
    tw, th = text_size(draw, text, face)
    box = (x, y, x + tw + pad_x * 2, y + th + pad_y * 2)
    draw.rounded_rectangle(box, radius=18, fill=fill, outline=outline, width=1)
    draw.text((x + pad_x, y + pad_y - 2), text, font=face, fill=text_fill)
    return box


def draw_background(img: Image.Image, t: float) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_gradient(draw, "#07111f", "#101827")

    layer, d = alpha_layer(img)
    for x in range(-120, WIDTH + 180, 180):
        x2 = x + int((t * 10) % 180)
        d.line((x2, 0, x2 - 360, HEIGHT), fill=(70, 166, 197, 18), width=1)
    for y in range(140, HEIGHT, 160):
        d.line((0, y + int(math.sin(t + y) * 2), WIDTH, y), fill=(255, 255, 255, 10), width=1)

    for i in range(22):
        px = int((i * 263 + t * (18 + i % 7)) % WIDTH)
        py = int((i * 149 + math.sin(t * 0.7 + i) * 42 + 120) % HEIGHT)
        r = 2 + (i % 2)
        color = (32, 211, 194, 48) if i % 3 else (247, 183, 51, 42)
        d.ellipse((px - r, py - r, px + r, py + r), fill=color)

    return compose(img, layer)


def draw_brand_mark(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0) -> None:
    size = int(72 * scale)
    draw.rounded_rectangle((x, y, x + size, y + size), radius=int(18 * scale), fill="#20d3c2")
    draw.polygon(
        [
            (x + int(37 * scale), y + int(10 * scale)),
            (x + int(18 * scale), y + int(43 * scale)),
            (x + int(36 * scale), y + int(43 * scale)),
            (x + int(28 * scale), y + int(62 * scale)),
            (x + int(55 * scale), y + int(30 * scale)),
            (x + int(38 * scale), y + int(30 * scale)),
        ],
        fill="#07111f",
    )


def draw_caption(img: Image.Image, text: str) -> Image.Image:
    layer, draw = alpha_layer(img)
    box = (240, 910, 1680, 1004)
    draw.rounded_rectangle(box, radius=28, fill=(4, 11, 22, 196), outline=(32, 211, 194, 80), width=1)
    lines = wrap_text(draw, text, FONT_BODY, 1280)
    y = 935 if len(lines) == 1 else 922
    for line in lines[:2]:
        w, _ = text_size(draw, line, FONT_BODY)
        draw.text(((WIDTH - w) // 2, y), line, font=FONT_BODY, fill="#eefcff")
        y += 42
    return compose(img, layer)


def draw_top_brand(draw: ImageDraw.ImageDraw) -> None:
    draw_brand_mark(draw, 82, 58, 0.56)
    draw.text((132, 63), "SPARK AppWorks", font=FONT_SMALL, fill="#dffdf8")
    draw.text((132, 96), "SPARK 融合平台 · 应用工场", font=FONT_TINY, fill="#8fb4c2")


def scene_title(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    pulse = 0.5 + 0.5 * math.sin(local * math.pi * 4)

    layer, d = alpha_layer(img)
    d.ellipse((245, 210, 1675, 1240), fill=(32, 211, 194, 16 + int(18 * pulse)))
    d.ellipse((1110, 40, 2010, 780), fill=(247, 183, 51, 22))
    img = compose(img, layer)
    draw = ImageDraw.Draw(img)

    draw_brand_mark(draw, 470, 350, 1.15)
    draw.text((585, 348), str(scene["title"]), font=FONT_LOGO, fill="#f8fafc")
    draw.text((590, 450), str(scene["subtitle"]), font=FONT_H2, fill="#20d3c2")
    draw_center(draw, 560, "企业应用系统，是 AI 配出来的", FONT_H2, "#f7b733")

    progress = ease_out(min(1, local * 1.4))
    x = 470
    y = 690
    for label in ["受约束 AI", "稳定运行时", "多租户治理", "低维护成本"]:
        rounded_label(draw, (x, y), label, FONT_SMALL, "#102033", "#24455b", "#dffdf8")
        x += int(235 * progress)
    return img


def scene_pain(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 170), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 255), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    x0 = 135
    for i, (title, lines, color) in enumerate(
        [
            ("客户 A 系统", ["UserPage.vue", "OrderForm.vue", "权限 if/switch"], "#ef4444"),
            ("客户 B 系统", ["UserPage-copy.vue", "OrderForm-v2.vue", "按钮权限散落"], "#f59e0b"),
            ("项目 C 后台", ["Dashboard-new.vue", "TreePatch.vue", "逐页回归"], "#8b5cf6"),
        ]
    ):
        x = x0 + i * 560
        drift = int(math.sin(local * 2 + i) * 14)
        draw.rounded_rectangle((x, 390 + drift, x + 445, 720 + drift), radius=24, fill="#111827", outline="#334155", width=2)
        draw.text((x + 34, 425 + drift), title, font=FONT_H3, fill="#f8fafc")
        for j, line in enumerate(lines):
            y = 500 + j * 58 + drift
            draw.rounded_rectangle((x + 34, y, x + 380, y + 36), radius=10, fill="#1f2937")
            draw.text((x + 52, y + 2), line, font=FONT_TINY, fill="#cbd5e1")
        draw.line((x + 54, 675 + drift, x + 380, 675 + drift), fill=color, width=4)

    for i in range(2):
        y = 545 + i * 56
        draw.line((585, y, 680, y + 38), fill="#475569", width=3)
        draw.line((1145, y + 28, 1240, y - 10), fill="#475569", width=3)
    return img


def scene_promise(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 170), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 255), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    layer, d = alpha_layer(img)
    cx, cy = 960, 575
    for i in range(4):
        radius = 120 + i * 72 + int(math.sin(local * 3 + i) * 8)
        d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(32, 211, 194, 85 - i * 14), width=3)
    img = compose(img, layer)
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle((680, 430, 1240, 725), radius=34, fill="#0f1d31", outline="#20d3c2", width=2)
    draw_center(draw, 475, "受约束配置空间", FONT_H2, "#f8fafc")
    draw_center(draw, 555, "AI 生成的是可治理资产", FONT_H3, "#20d3c2")
    draw_center(draw, 620, "不是散落源码", FONT_BODY, "#f7b733")

    for i, label in enumerate(["需求", "组件目录", "数据规范", "权限策略"]):
        angle = local * 0.35 + i * math.pi / 2
        x = int(cx + math.cos(angle) * 420) - 70
        y = int(cy + math.sin(angle) * 255) - 24
        rounded_label(draw, (x, y), label, FONT_SMALL, "#102033", "#24455b", "#dffdf8", 18, 8)
    return img


def scene_assets(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 145), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 230), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    cards = [
        ("rule.json", "页面结构", "#20d3c2", "组件树、布局、动作"),
        ("pagedata.json", "数据模型", "#f7b733", "表结构、关系、聚合"),
        ("script.js", "业务脚本", "#8b5cf6", "事件响应、业务分支"),
        ("style.css", "页面样式", "#38bdf8", "作用域样式、视觉表达"),
    ]
    for i, (name, role, color, desc) in enumerate(cards):
        x = 150 + i * 445
        y = 430 + int(math.sin(local * 2 + i) * 8)
        draw.rounded_rectangle((x, y, x + 360, y + 310), radius=28, fill="#0f1d31", outline="#243b53", width=2)
        draw.rounded_rectangle((x + 30, y + 34, x + 180, y + 72), radius=12, fill=color)
        draw.text((x + 46, y + 38), name, font=FONT_TINY, fill="#07111f")
        draw.text((x + 30, y + 115), role, font=FONT_H3, fill="#f8fafc")
        for j in range(4):
            yy = y + 180 + j * 28
            draw.rounded_rectangle((x + 30, yy, x + 330 - j * 34, yy + 10), radius=5, fill="#29435c")
        draw.text((x + 30, y + 255), desc, font=FONT_SMALL, fill="#94a3b8")

    draw.line((510, 585, 595, 585), fill="#20d3c2", width=4)
    draw.line((955, 585, 1040, 585), fill="#20d3c2", width=4)
    draw.line((1400, 585, 1485, 585), fill="#20d3c2", width=4)
    return img


def scene_runtime(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 145), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 230), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    y = 465
    panel_h = 270
    left = (150, y, 565, y + panel_h)
    center = (705, y - 18, 1215, y + panel_h + 18)
    right = (1355, y, 1770, y + panel_h)

    # Draw arrows behind panels, outside the text-heavy center.
    draw_arrow(draw, (left[2] + 28, y + panel_h // 2), (center[0] - 34, y + panel_h // 2), fill="#315d75", width=5)
    draw_arrow(draw, (center[2] + 34, y + panel_h // 2), (right[0] - 28, y + panel_h // 2), fill="#315d75", width=5)

    for box, title, items, accent in [
        (left, "配置资产", ["页面结构", "数据模型", "权限策略"], "#20d3c2"),
        (right, "运行结果", ["多租户", "多系统", "应用交付"], "#f7b733"),
    ]:
        draw.rounded_rectangle(box, radius=28, fill="#0f1d31", outline="#243b53", width=2)
        draw.rounded_rectangle((box[0] + 30, box[1] + 30, box[0] + 78, box[1] + 78), radius=14, fill=accent)
        draw.text((box[0] + 100, box[1] + 30), title, font=FONT_H3, fill="#f8fafc")
        for i, item in enumerate(items):
            item_y = box[1] + 112 + i * 48
            draw.rounded_rectangle((box[0] + 32, item_y, box[2] - 32, item_y + 30), radius=10, fill="#17263a")
            draw.text((box[0] + 54, item_y - 1), item, font=FONT_TINY, fill="#cbd5e1")

    layer, d = alpha_layer(img)
    d.rounded_rectangle(center, radius=36, fill=(15, 29, 49, 242), outline=(32, 211, 194, 230), width=3)
    d.ellipse((center[0] + 55, center[1] + 28, center[2] - 55, center[3] - 28), outline=(247, 183, 51, 120), width=4)
    img = compose(img, layer)
    draw = ImageDraw.Draw(img)
    draw_center_in_box(draw, (center[0], center[1] + 42, center[2], center[1] + 128), "SPARK Runtime", FONT_H2, "#f8fafc")
    draw_center_in_box(draw, (center[0], center[1] + 126, center[2], center[1] + 196), "统一解释执行", FONT_BODY, "#20d3c2")
    draw_center_in_box(draw, (center[0], center[1] + 194, center[2], center[1] + 260), "把变化收敛在配置层", FONT_SMALL, "#f7b733")

    draw.rounded_rectangle((575, 792, 1345, 852), radius=22, fill="#07111f", outline="#24455b", width=1)
    draw_center_in_box(draw, (575, 792, 1345, 852), "固定运行时承接应用变化，平台能力持续复用", FONT_SMALL, "#cbd5e1")
    return img


def scene_loop(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 145), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 230), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    steps = [
        ("需求输入", "业务目标", 220),
        ("AI 生成配置", "四类资产", 545),
        ("热更新预览", "即时看见", 870),
        ("日志回传", "结构化错误", 1195),
        ("精准修复", "闭环迭代", 1520),
    ]
    active = int((local * len(steps) * 1.35)) % len(steps)

    headline = (510, 365, 1410, 455)
    draw.rounded_rectangle(headline, radius=28, fill="#102033", outline="#20d3c2", width=2)
    draw_center_in_box(draw, headline, "AI 与运行时形成一条生产闭环", FONT_H3, "#dffdf8")

    center_y = 625
    card_w = 245
    card_h = 145

    for i in range(len(steps) - 1):
        _, _, x = steps[i]
        _, _, next_x = steps[i + 1]
        draw_arrow(
            draw,
            (x + card_w + 20, center_y),
            (next_x - 22, center_y),
            fill="#315d75" if i < active else "#24455b",
            width=4,
        )

    for i, (label, sub, x) in enumerate(steps):
        color = "#f7b733" if i == active else "#20d3c2"
        box = (x, center_y - card_h // 2, x + card_w, center_y + card_h // 2)
        draw.rounded_rectangle(box, radius=24, fill="#0f1d31", outline=color, width=3)
        draw.rounded_rectangle((x + 24, center_y - 48, x + 58, center_y - 14), radius=10, fill=color)
        draw.text((x + 75, center_y - 54), label, font=FONT_SMALL, fill="#f8fafc")
        draw.text((x + 75, center_y - 12), sub, font=FONT_TINY, fill="#94a3b8")
        draw.rounded_rectangle((x + 24, center_y + 36, x + card_w - 24, center_y + 48), radius=6, fill="#29435c")

    draw.rounded_rectangle((590, 790, 1330, 850), radius=22, fill="#07111f", outline="#24455b", width=1)
    draw_center_in_box(draw, (590, 790, 1330, 850), "生成、预览、诊断、修复，全部在同一条链路内完成", FONT_SMALL, "#cbd5e1")
    return img


def scene_scenarios(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    draw_top_brand(draw)
    draw.text((120, 145), str(scene["title"]), font=FONT_H1, fill="#f8fafc")
    draw.text((122, 230), str(scene["subtitle"]), font=FONT_BODY, fill="#94a3b8")

    cards = [
        ("应用管理", "租户 / 项目 / 应用入口"),
        ("树形配置", "导航树、组织树、分类树"),
        ("主从联动", "DataView 驱动业务视图"),
        ("权限渲染", "改权限，不改页面代码"),
        ("数据看板", "聚合、指标、可视化"),
        ("持续治理", "预览、诊断、发布、回滚"),
    ]
    for i, (title, desc) in enumerate(cards):
        col = i % 3
        row = i // 3
        x = 180 + col * 540
        y = 405 + row * 220 + int(math.sin(local * 2.2 + i) * 6)
        draw.rounded_rectangle((x, y, x + 430, y + 158), radius=26, fill="#0f1d31", outline="#243b53", width=2)
        draw.rounded_rectangle((x + 28, y + 30, x + 78, y + 80), radius=14, fill="#20d3c2")
        draw.text((x + 104, y + 28), title, font=FONT_H3, fill="#f8fafc")
        draw.text((x + 104, y + 84), desc, font=FONT_SMALL, fill="#94a3b8")
        draw.rounded_rectangle((x + 28, y + 110, x + 355, y + 122), radius=6, fill="#29435c")
    return img


def scene_closing(img: Image.Image, local: float, scene: dict[str, str | float]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    layer, d = alpha_layer(img)
    d.ellipse((270, 100, 1650, 1180), fill=(32, 211, 194, 28))
    d.ellipse((1040, 130, 1990, 900), fill=(247, 183, 51, 26))
    img = compose(img, layer)
    draw = ImageDraw.Draw(img)

    draw_brand_mark(draw, 515, 300, 1.25)
    draw.text((650, 292), str(scene["title"]), font=FONT_LOGO, fill="#f8fafc")
    draw.text((655, 398), str(scene["subtitle"]), font=FONT_H2, fill="#20d3c2")
    draw_center(draw, 540, "SPARK 融合平台的应用工场", FONT_H2, "#f7b733")
    draw_center(draw, 650, "企业应用系统，是 AI 配出来的。", FONT_H1, "#f8fafc")
    return img


SCENE_RENDERERS = {
    "title": scene_title,
    "pain": scene_pain,
    "promise": scene_promise,
    "assets": scene_assets,
    "runtime": scene_runtime,
    "loop": scene_loop,
    "scenarios": scene_scenarios,
    "closing": scene_closing,
}


def render_frame(t: float, ranges: list[tuple[float, float, dict[str, str | float]]]) -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), "#07111f")
    img = draw_background(img, t)

    scene = ranges[-1][2]
    start = ranges[-1][0]
    end = ranges[-1][1]
    for range_start, range_end, candidate in ranges:
        if range_start <= t < range_end:
            scene = candidate
            start = range_start
            end = range_end
            break

    local = (t - start) / max(0.001, end - start)
    renderer = SCENE_RENDERERS[str(scene["key"])]
    img = renderer(img, ease_in_out(max(0.0, min(1.0, local))), scene)
    img = draw_caption(img, str(scene["caption"]))
    return img


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not NARRATION_PATH.exists():
        raise SystemExit(f"Missing narration audio: {NARRATION_PATH}")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    narration_duration = parse_duration(ffmpeg, NARRATION_PATH)
    total_duration = narration_duration + 1.4
    total_frames = math.ceil(total_duration * FPS)
    ranges = cumulative_scene_ranges(total_duration)

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
        str(NARRATION_PATH),
        "-f",
        "lavfi",
        "-t",
        f"{total_duration:.3f}",
        "-i",
        "sine=frequency=146:sample_rate=48000",
        "-filter_complex",
        "[1:a]volume=1.18,apad=pad_dur=1.4[a1];[2:a]volume=0.018[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=1[a]",
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-shortest",
        str(OUTPUT_PATH),
    ]

    print(f"Rendering {OUTPUT_PATH}")
    print(f"Duration: {total_duration:.2f}s, frames: {total_frames}, ffmpeg: {ffmpeg}")
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_index in range(total_frames):
            t = frame_index / FPS
            frame = render_frame(t, ranges)
            process.stdin.write(frame.tobytes())
            if frame_index % (FPS * 5) == 0:
                print(f"  {frame_index}/{total_frames} frames", flush=True)
    finally:
        process.stdin.close()
    exit_code = process.wait()
    if exit_code != 0:
        raise SystemExit(exit_code)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
