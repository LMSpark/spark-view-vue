import argparse
import os
import struct
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1280
HEIGHT = 720
FPS = 4


EPISODES = [
    {
        "id": "00-preface",
        "title": "序篇：为什么 SPARK_VIEW 值得拆成 16 篇",
        "long": [
            ("为什么值得拆成 16 篇", "从页面资产化到生产工具链", "真实后台页面会长出主从表、树数据、权限、版本回滚和 AI 修改。这个系列要回答的，是怎样把页面变成可持续演进的软件资产。"),
            ("一条工程主线", "四文件、Renderer、DataSet、权限、AI、DevSystem", "SPARK_VIEW 的答案不是某个组件，而是一组工程边界：资产、运行时、数据内核、权限边界、AI Runtime 和生产工具链。"),
            ("先抓主骨架", "1 / 2 / 7 / 10 / 13 / 14 / 16", "快速建立全局感，可以先看理念、四文件、运行时、数据模型、权限边界、通用 AI 和 DevSystem。"),
            ("完整跟源码", "从理念走到生产化", "如果要维护或改造这套系统，就按顺序看完。下一集先拆掉一个误会：SPARK_VIEW 不是 JSON 表单生成器。"),
        ],
        "short": [
            ("SPARK_VIEW 不是组件介绍", "它是一条工程路线", "它讲的是页面资产化、运行时解释、数据内核、权限边界、通用受约束 AI 和生产工具链。"),
            ("真实后台不会停在表单", "数据、权限、回滚、AI 修改", "问题不是少写 Vue，而是如何管理页面这个长期资产。"),
            ("17 集看完一条闭环", "资产化到 DevSystem", "从四文件协议讲到 DevSystem，长视频负责展开完整源码链路。"),
        ],
    },
    {
        "id": "01-spark-view-not-json-form-generator",
        "title": "别再叫它 JSON 表单：SPARK_VIEW 的页面资产化野心",
        "long": [
            ("别再叫它 JSON 表单", "简单表单和企业后台不是同一种问题", "后台页面不只是字段布局，还要处理数据联动、权限快照、树数据、聚合、脚本、预览和长期维护。"),
            ("核心判断：页面资产化", "可加载、可编译、可预览、可回滚、可被 AI 修改", "页面不再是一份一次性代码，也不是孤立 JSON，而是一组可治理、可演进的资产。"),
            ("源码跟读", "package.json / packages / deep dive", "从 monorepo 结构可以看到，应用集成、组件解释、数据内核、配置加载和 AI 能力在协作。"),
            ("本集结论", "不是生成器，是治理系统", "表单生成器解决字段渲染，SPARK_VIEW 解决页面作为资产的长期演进。下一集进入四文件协议。"),
        ],
        "short": [
            ("别再叫 JSON 表单", "这个判断太窄了", "一旦出现主从表、树数据、权限快照、聚合、预览和回滚，问题就变了。"),
            ("SPARK_VIEW 的答案", "页面资产化", "结构、数据、行为、样式拆成四类资产，再交给稳定运行时解释。"),
            ("最终结论", "可治理，而不是只少写 Vue", "它不是表单生成器，也不是一次性代码生成器。完整源码链路看长视频。"),
        ],
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


FONT_TITLE = font(42, True)
FONT_SUBTITLE = font(28)
FONT_BODY = font(25)
FONT_SMALL = font(18)
FONT_BADGE = font(20, True)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        test = current + char
        if draw.textbbox((0, 0), test, font=face)[2] <= width:
            current = test
            continue
        if current:
            lines.append(current)
        current = char
    if current:
        lines.append(current)
    return lines


def draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, face: ImageFont.FreeTypeFont, fill: str, width: int, line_gap: int = 10) -> int:
    x, y = xy
    for line in wrap_text(draw, text, face, width):
        draw.text((x, y), line, font=face, fill=fill)
        y += face.size + line_gap
    return y


def render_frame(episode_title: str, scene: tuple[str, str, str], kind: str, index: int, total: int) -> Image.Image:
    title, subtitle, body = scene
    img = Image.new("RGB", (WIDTH, HEIGHT), "#F7F8FA")
    draw = ImageDraw.Draw(img)

    draw.rectangle((0, 0, WIDTH, 18), fill="#5E35B1")
    draw.rectangle((58, 48, WIDTH - 58, HEIGHT - 48), outline="#D7DCE5", width=2)
    draw.text((72, 42), episode_title, font=FONT_SMALL, fill="#5E6673")

    draw.text((72, 116), title, font=FONT_TITLE, fill="#18202B")
    draw_wrapped(draw, (74, 188), subtitle, FONT_SUBTITLE, "#5E6673", 560)
    draw_wrapped(draw, (78, 518), body, FONT_BODY, "#18202B", 1110, 12)

    panel = (700, 126, 1178, 440)
    draw.rounded_rectangle(panel, radius=18, fill="#FFFFFF", outline="#D7DCE5", width=2)
    draw.rectangle((726, 156, 1152, 162), fill="#5E35B1")
    draw.text((730, 186), "SPARK_VIEW", font=FONT_TITLE, fill="#18202B")
    draw.text((732, 244), "Video Series", font=FONT_SUBTITLE, fill="#5E6673")
    draw.text((732, 302), f"{kind.upper()}  {index:02d}/{total:02d}", font=FONT_BADGE, fill="#5E35B1")

    labels = ["页面资产化", "运行时解释", "数据内核", "权限边界", "通用 AI", "DevSystem"]
    for i, label in enumerate(labels):
        x = 730 + (i % 3) * 136
        y = 348 + (i // 3) * 42
        draw.rounded_rectangle((x, y, x + 112, y + 28), radius=8, fill="#EEF2FF")
        draw.text((x + 12, y + 3), label, font=FONT_SMALL, fill="#334155")

    draw.rounded_rectangle((72, 430, 438, 484), radius=12, fill="#EEF2FF", outline="#D7DCE5")
    draw.text((96, 446), "Generated AVI sample / no audio", font=FONT_BADGE, fill="#5E35B1")
    return img


def jpeg_bytes(img: Image.Image) -> bytes:
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=86, optimize=True)
    return buffer.getvalue()


def chunk(name: bytes, data: bytes) -> bytes:
    padding = b"\0" if len(data) % 2 else b""
    return name + struct.pack("<I", len(data)) + data + padding


def list_chunk(name: bytes, data: bytes) -> bytes:
    payload = name + data
    padding = b"\0" if len(payload) % 2 else b""
    return b"LIST" + struct.pack("<I", len(payload)) + payload + padding


def write_mjpeg_avi(path: Path, frames: list[bytes], width: int, height: int, fps: int) -> None:
    total_frames = len(frames)
    max_frame = max(len(frame) for frame in frames)
    avih = struct.pack(
        "<IIIIIIIIII4I",
        int(1_000_000 / fps),
        max_frame * fps,
        0,
        0x10,
        total_frames,
        0,
        1,
        max_frame,
        width,
        height,
        0,
        0,
        0,
        0,
    )
    strh = struct.pack(
        "<4s4sIHHIIIIIIIIhhhh",
        b"vids",
        b"MJPG",
        0,
        0,
        0,
        0,
        1,
        fps,
        0,
        total_frames,
        max_frame,
        0xFFFFFFFF,
        0,
        0,
        0,
        width,
        height,
    )
    strf = struct.pack(
        "<IiiHH4sIiiII",
        40,
        width,
        height,
        1,
        24,
        b"MJPG",
        max_frame,
        0,
        0,
        0,
        0,
    )
    hdrl = list_chunk(
        b"hdrl",
        chunk(b"avih", avih)
        + list_chunk(b"strl", chunk(b"strh", strh) + chunk(b"strf", strf)),
    )

    movi_data = bytearray()
    index_entries = []
    for frame in frames:
        offset = len(movi_data)
        frame_chunk = chunk(b"00dc", frame)
        movi_data.extend(frame_chunk)
        index_entries.append(struct.pack("<4sIII", b"00dc", 0x10, offset + 4, len(frame)))
    movi = list_chunk(b"movi", bytes(movi_data))
    idx1 = chunk(b"idx1", b"".join(index_entries))
    body = hdrl + movi + idx1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body) + 4) + b"AVI " + body)


def render_episode(output_root: Path, episode: dict, kind: str) -> Path:
    scenes = episode[kind]
    seconds_per_scene = 7 if kind == "long" else 5
    frames: list[bytes] = []
    for scene_index, scene in enumerate(scenes, start=1):
        img = render_frame(episode["title"], scene, kind, scene_index, len(scenes))
        frame = jpeg_bytes(img)
        frames.extend([frame] * (seconds_per_scene * FPS))
    output = output_root / kind / f"{episode['id']}.avi"
    write_mjpeg_avi(output, frames, WIDTH, HEIGHT, FPS)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Render playable AVI samples for SPARK_VIEW video series.")
    parser.add_argument("--output-root", default=str(Path(tempfile.gettempdir()) / "spark-view-video-samples-avi"))
    args = parser.parse_args()
    output_root = Path(args.output_root).resolve()
    outputs = []
    for episode in EPISODES:
        outputs.append(render_episode(output_root, episode, "long"))
        outputs.append(render_episode(output_root, episode, "short"))
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
