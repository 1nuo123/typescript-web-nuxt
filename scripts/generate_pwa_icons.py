"""生成 Codex Remote 的确定性 PWA 安装图标。

该脚本只依赖 Python 标准库，避免构建机必须安装图像处理运行时。
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


ICON_SIZES = (192, 512)
BACKGROUND = (15, 118, 110, 255)
PANEL = (13, 82, 80, 255)
FOREGROUND = (255, 255, 255, 255)


def _chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def _write_png(path: Path, size: int, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    rows = b"".join(b"\x00" + b"".join(bytes(pixel) for pixel in row) for row in pixels)
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    content = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header)
    content += _chunk(b"IDAT", zlib.compress(rows, level=9))
    content += _chunk(b"IEND", b"")
    path.write_bytes(content)


def _rounded_rectangle(
    pixels: list[list[tuple[int, int, int, int]]],
    left: int,
    top: int,
    right: int,
    bottom: int,
    radius: int,
    color: tuple[int, int, int, int],
) -> None:
    for y in range(top, bottom):
        for x in range(left, right):
            dx = max(left + radius - x, 0, x - (right - radius - 1))
            dy = max(top + radius - y, 0, y - (bottom - radius - 1))
            if dx * dx + dy * dy <= radius * radius:
                pixels[y][x] = color


def _draw_icon(size: int) -> list[list[tuple[int, int, int, int]]]:
    pixels = [[BACKGROUND for _ in range(size)] for _ in range(size)]
    margin = size // 8
    _rounded_rectangle(pixels, margin, margin, size - margin, size - margin, size // 7, PANEL)

    stroke = max(size // 16, 4)
    start_x = size * 31 // 100
    center_y = size // 2
    chevron_width = size * 18 // 100
    chevron_height = size * 15 // 100
    half_height = max(chevron_height // 2, 1)
    for offset in range(-stroke // 2, stroke // 2 + 1):
        for step in range(chevron_height):
            if step <= half_height:
                x = start_x + step * chevron_width // half_height
            else:
                x = start_x + (chevron_height - step) * chevron_width // half_height
            y = center_y - chevron_height // 2 + step
            if 0 <= y < size and 0 <= x + offset < size:
                pixels[y][x + offset] = FOREGROUND

    underscore_left = size * 52 // 100
    underscore_right = size * 72 // 100
    underscore_y = center_y + size * 9 // 100
    for y in range(underscore_y, min(size, underscore_y + stroke)):
        for x in range(underscore_left, underscore_right):
            pixels[y][x] = FOREGROUND
    return pixels


def generate_icons(output_directory: Path) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    for size in ICON_SIZES:
        _write_png(output_directory / f"icon-{size}.png", size, _draw_icon(size))


if __name__ == "__main__":
    generate_icons(Path(__file__).resolve().parents[1] / "public")
