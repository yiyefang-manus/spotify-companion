import subprocess
import os
import shutil
import struct
import zlib

iconset_dir = "icon.iconset"
os.makedirs(iconset_dir, exist_ok=True)


def create_png(width, height, color_rgb, filename):
    """Create a simple solid-color rounded-rect PNG file without PIL."""
    r, g, b = color_rgb

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)
        return struct.pack('>I', len(data)) + chunk + crc

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            cx, cy = width // 2, height // 2
            radius = min(width, height) * 0.38
            corner_r = radius * 0.35
            dx = abs(x - cx)
            dy = abs(y - cy)
            in_shape = False
            if dx <= radius - corner_r and dy <= radius:
                in_shape = True
            elif dx <= radius and dy <= radius - corner_r:
                in_shape = True
            elif (dx - (radius - corner_r))**2 + (dy - (radius - corner_r))**2 <= corner_r**2:
                in_shape = True
            if in_shape:
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([0, 0, 0])

    compressed = zlib.compress(raw_data)
    idat = make_chunk(b'IDAT', compressed)
    iend = make_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(signature + ihdr + idat + iend)


print("Generating base icon (256x256 for speed, will upscale)...")
create_png(256, 256, (29, 185, 84), 'icon_base.png')

# Upscale to 1024 using sips
subprocess.run(['sips', '-z', '1024', '1024', 'icon_base.png', '--out', 'icon_1024.png'],
               capture_output=True)
print("Generated icon_1024.png")

sizes = [16, 32, 64, 128, 256, 512, 1024]
for size in sizes:
    out = f"{iconset_dir}/icon_{size}x{size}.png"
    subprocess.run(['sips', '-z', str(size), str(size), 'icon_1024.png', '--out', out],
                   capture_output=True)
    if size <= 512:
        double = size * 2
        out2x = f"{iconset_dir}/icon_{size}x{size}@2x.png"
        subprocess.run(['sips', '-z', str(double), str(double), 'icon_1024.png', '--out', out2x],
                       capture_output=True)

result = subprocess.run(['iconutil', '-c', 'icns', iconset_dir, '-o', 'icon.icns'],
                       capture_output=True, text=True)
if result.returncode == 0:
    print("OK: Generated icon.icns")
else:
    print(f"WARN: iconutil failed: {result.stderr}")

shutil.rmtree(iconset_dir, ignore_errors=True)
for f in ['icon_1024.png', 'icon_base.png']:
    if os.path.exists(f):
        os.remove(f)
