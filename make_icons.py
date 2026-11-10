#!/usr/bin/env python3
"""Génère les icônes PNG de MIZANE sans dépendances externes (optionnel : python3 make_icons.py).
L'application utilise icons/icon.svg ; ce script produit des PNG si vous préférez."""
import struct, zlib, math

def png(width, height, pixel_fn):
    rows = b""
    for y in range(height):
        rows += b"\x00"
        for x in range(width):
            rows += bytes(pixel_fn(x, y))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")

def make(size):
    s = size
    r = s * 0.1875  # rayon des coins arrondis
    def px(x, y):
        # fond dégradé teal avec coins arrondis
        cx, cy = x / s, y / s
        t = (cx + cy) / 2
        base = (int(0x11 + (0x0f - 0x11) * t), int(0x5e + (0x76 - 0x5e) * t), int(0x59 + (0x6e - 0x59) * t))
        # coins arrondis
        for qx, qy in [(0, 0), (1, 0), (0, 1), (1, 1)]:
            dx = x - (r if qx == 0 else s - r)
            dy = y - (r if qy == 0 else s - r)
            if (qx == 0 and x < r or qx == 1 and x >= s - r) and (qy == 0 and y < r or qy == 1 and y >= s - r):
                if dx * dx + dy * dy > r * r:
                    return (0, 0, 0, 0) if False else (base)  # RGB sans alpha : garder fond
        # dessin balance : mât, fléau, plateaux, base
        lw = max(2, s // 24)
        light = (0xcc, 0xfb, 0xf1)
        def near_line(x0, y0, x1, y1, w):
            # distance point-segment
            ax, ay = x0 * s, y0 * s; bx, by = x1 * s, y1 * s
            px_, py_ = x, y
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy
            t = 0 if L2 == 0 else max(0, min(1, ((px_ - ax) * vx + (py_ - ay) * vy) / L2))
            ddx, ddy = px_ - (ax + t * vx), py_ - (ay + t * vy)
            return ddx * ddx + ddy * ddy <= w * w
        def in_circle(cx0, cy0, rad):
            return (x - cx0 * s) ** 2 + (y - cy0 * s) ** 2 <= rad * rad
        if near_line(0.5, 0.19, 0.5, 0.70, lw) or near_line(0.27, 0.30, 0.73, 0.30, lw):
            return light
        if near_line(0.36, 0.74, 0.64, 0.74, lw) or near_line(0.31, 0.83, 0.69, 0.83, lw):
            return light
        if in_circle(0.5, 0.19, lw * 1.4):
            return light
        for cx0 in (0.27, 0.73):
            if in_circle(cx0, 0.30, lw * 1.2):
                return light
            # plateaux (demi-disques)
            if (x - cx0 * s) ** 2 + (y - 0.47 * s) ** 2 <= (0.115 * s) ** 2 and y > 0.47 * s:
                return light
            if near_line(cx0, 0.30, cx0 - 0.115 if cx0 < 0.5 else cx0 + 0.115, 0.47, lw // 2):
                return light
        return base
    return png(s, s, px)

for size, name in [(192, "icons/icon-192.png"), (512, "icons/icon-512.png")]:
    with open(name, "wb") as f:
        f.write(make(size))
    print(name, "écrit")
