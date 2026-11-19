import os
import struct
import zlib
import math

def create_png(width, height, draw_func, filename):
    # RGBA raw rows with filter byte 0
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0: None
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    # PNG signature
    png = bytearray(b'\x89PNG\r\n\x1a\n')

    def make_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        chunk += struct.pack('>I', crc)
        return chunk

    # IHDR chunk
    # width (4), height (4), bit depth (1), color type (1=6 RGBA), compression (1=0), filter (1=0), interlace (1=0)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += make_chunk(b'IHDR', ihdr_data)

    # IDAT chunk
    compressed = zlib.compress(bytes(raw_data), level=9)
    png += make_chunk(b'IDAT', compressed)

    # IEND chunk
    png += make_chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Generated {filename} ({width}x{height})")

def icon_pixel(x, y, w, h):
    # Normalized coords [0, 1]
    nx = x / (w - 1) if w > 1 else 0.5
    ny = y / (h - 1) if h > 1 else 0.5

    # Center circle radius
    cx, cy = 0.5, 0.5
    dist = math.sqrt((nx - cx)**2 + (ny - cy)**2)
    radius = 0.44

    # Background: Indigo #6366f1 (99, 102, 241)
    if dist > radius:
        # Anti-aliasing edge
        edge = dist - radius
        if edge < 0.05:
            alpha = int((1.0 - edge / 0.05) * 255)
            return (99, 102, 241, max(0, min(255, alpha)))
        return (0, 0, 0, 0)

    # Checkmark line segments:
    # Seg 1: (0.28, 0.52) -> (0.44, 0.68)
    # Seg 2: (0.44, 0.68) -> (0.72, 0.34)
    def dist_to_segment(px, py, x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        length_sq = dx*dx + dy*dy
        if length_sq == 0:
            return math.hypot(px - x1, py - y1)
        t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / length_sq))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy
        return math.hypot(px - proj_x, py - proj_y)

    d1 = dist_to_segment(nx, ny, 0.28, 0.52, 0.44, 0.68)
    d2 = dist_to_segment(nx, ny, 0.44, 0.68, 0.72, 0.34)
    min_dist = min(d1, d2)

    stroke = 0.07
    if min_dist < stroke:
        return (255, 255, 255, 255)
    elif min_dist < stroke + 0.03:
        t = (min_dist - stroke) / 0.03
        r = int(255 * (1 - t) + 99 * t)
        g = int(255 * (1 - t) + 102 * t)
        b = int(255 * (1 - t) + 241 * t)
        return (r, g, b, 255)

    return (99, 102, 241, 255)

if __name__ == '__main__':
    create_png(16, 16, icon_pixel, 'icons/icon-16.png')
    create_png(48, 48, icon_pixel, 'icons/icon-48.png')
    create_png(128, 128, icon_pixel, 'icons/icon-128.png')
