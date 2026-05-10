import argparse
import importlib.util
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def load_core():
    core_path = Path(__file__).with_name("render-video-series-avi.py")
    spec = importlib.util.spec_from_file_location("video_series_avi_core", core_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {core_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolve_ffmpeg(explicit_path: str | None) -> str:
    if explicit_path:
        candidate = Path(explicit_path)
        if candidate.exists():
            return str(candidate)
        raise FileNotFoundError(f"ffmpeg not found at {candidate}")
    found = shutil.which("ffmpeg")
    if found:
        return found
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        winget_packages = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
        if winget_packages.exists():
            matches = sorted(
                winget_packages.glob("Gyan.FFmpeg*/**/ffmpeg.exe"),
                key=lambda item: item.stat().st_mtime,
                reverse=True,
            )
            if matches:
                return str(matches[0])
    raise FileNotFoundError(
        "ffmpeg is not available. Install it with: winget install --id Gyan.FFmpeg -e"
    )


def resolve_ffprobe(ffmpeg: str) -> str:
    candidate = Path(ffmpeg).with_name("ffprobe.exe")
    if candidate.exists():
        return str(candidate)
    found = shutil.which("ffprobe")
    if found:
        return found
    raise FileNotFoundError("ffprobe is required next to ffmpeg or in PATH")


def get_media_duration(ffprobe: str, path: Path) -> float:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def synthesize_audio(
    scenes: list[tuple[str, str, str]],
    work_dir: Path,
    ffmpeg: str,
    ffprobe: str,
    voice: str,
) -> tuple[Path, list[float]]:
    audio_paths = []
    durations = []
    for index, scene in enumerate(scenes, start=1):
        audio_path = work_dir / f"scene-{index:02d}.mp3"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "edge_tts",
                "--voice",
                voice,
                "--text",
                scene[2],
                "--write-media",
                str(audio_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        audio_paths.append(audio_path)
        durations.append(get_media_duration(ffprobe, audio_path))

    concat_list = work_dir / "audio-list.txt"
    concat_list.write_text(
        "".join(f"file '{path.resolve().as_posix()}'\n" for path in audio_paths),
        encoding="utf-8",
    )
    combined = work_dir / "narration.mp3"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(combined),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return combined, durations


def write_frames(core, episode: dict, kind: str, frames_dir: Path, durations: list[float]) -> int:
    scenes = episode[kind]
    frame_index = 0
    frames_dir.mkdir(parents=True, exist_ok=True)
    for scene_index, scene in enumerate(scenes, start=1):
        image = core.render_frame(episode["title"], scene, kind, scene_index, len(scenes))
        seconds = max(3.0, durations[scene_index - 1])
        for _ in range(math.ceil(seconds * core.FPS)):
            frame_index += 1
            image.save(frames_dir / f"frame-{frame_index:05d}.png", format="PNG")
    return frame_index


def render_episode(core, ffmpeg: str, output_root: Path, episode: dict, kind: str, voice: str) -> Path:
    output = output_root / kind / f"{episode['id']}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    ffprobe = resolve_ffprobe(ffmpeg)
    with tempfile.TemporaryDirectory(prefix=f"{episode['id']}-{kind}-") as temp:
        temp_dir = Path(temp)
        frames_dir = temp_dir / "frames"
        narration, durations = synthesize_audio(
            episode[kind],
            temp_dir,
            ffmpeg,
            ffprobe,
            voice,
        )
        frame_count = write_frames(core, episode, kind, frames_dir, durations)
        if frame_count <= 0:
            raise RuntimeError(f"No frames generated for {episode['id']} {kind}")
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            str(core.FPS),
            "-i",
            str(frames_dir / "frame-%05d.png"),
            "-i",
            str(narration),
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(output),
        ]
        subprocess.run(cmd, check=True)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Render MP4 samples for SPARK_VIEW video series.")
    parser.add_argument("--output-root", default=str(Path(tempfile.gettempdir()) / "spark-view-video-samples-mp4"))
    parser.add_argument("--ffmpeg", default=None, help="Optional ffmpeg.exe path.")
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural", help="Edge TTS voice name.")
    parser.add_argument("--check", action="store_true", help="Only check whether ffmpeg can be resolved.")
    args = parser.parse_args()

    ffmpeg = resolve_ffmpeg(args.ffmpeg)
    if args.check:
        print(ffmpeg)
        return

    core = load_core()
    output_root = Path(args.output_root).resolve()
    outputs = []
    for episode in core.EPISODES:
        outputs.append(render_episode(core, ffmpeg, output_root, episode, "long", args.voice))
        outputs.append(render_episode(core, ffmpeg, output_root, episode, "short", args.voice))
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
