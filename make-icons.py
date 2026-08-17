#!/usr/bin/env python3
"""Draw the Cadence home-screen icons — the ◎ mark, white on accent blue.

Run by hand when the mark or the colour changes:  python3 make-icons.py
Nothing in the app needs this; the app is still just index.html and three files.
Written with the standard library only, so there is nothing to install.
"""

import struct
import zlib

ACCENT = (0x4F, 0x7C, 0xFF)
WHITE = (0xFF, 0xFF, 0xFF)
SS = 4                      # supersample factor, for smooth edges without a graphics lib


def draw(size):
    n = size * SS
    corner = n * 0.22       # rounded square, close to the iOS mask
    cx = cy = (n - 1) / 2
    ring_r = n * 0.30       # centre of the ring's stroke
    ring_w = n * 0.075
    dot_r = n * 0.105

    rows = []
    for y in range(n):
        row = []
        for x in range(n):
            # rounded-rect mask: outside the corner radius, the pixel is transparent
            dx = max(corner - x, 0, x - (n - 1 - corner))
            dy = max(corner - y, 0, y - (n - 1 - corner))
            if dx * dx + dy * dy > corner * corner:
                row.append((0, 0, 0, 0))
                continue
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            on_ring = abs(d - ring_r) <= ring_w / 2
            in_dot = d <= dot_r
            row.append(WHITE + (255,) if (on_ring or in_dot) else ACCENT + (255,))
        rows.append(row)

    # average each SS x SS block back down to one pixel
    out = bytearray()
    for y in range(size):
        out.append(0)                                   # PNG filter: none
        for x in range(size):
            r = g = b = a = 0
            for j in range(SS):
                for i in range(SS):
                    pr, pg, pb, pa = rows[y * SS + j][x * SS + i]
                    r += pr * pa; g += pg * pa; b += pb * pa; a += pa
            if a:
                out += bytes((r // a, g // a, b // a, a // (SS * SS)))
            else:
                out += b"\0\0\0\0"
    return bytes(out)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size):
    raw = draw(size)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png):,} bytes")


for s in (180, 192, 512):
    write_png(f"icon-{s}.png", s)
