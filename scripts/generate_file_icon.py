"""
Generate md-file icons (PNG/ICO/ICNS) from source image xxx.png.
"""
from PIL import Image
import os
import io
import struct

SCRIPT_DIR = os.path.dirname(__file__)
ICONS_DIR = os.path.join(SCRIPT_DIR, "..", "src-tauri", "icons")
SRC = os.path.join(ICONS_DIR, "xxx.png")


def save_ico(img, path):
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    png_data_list = []
    for s in sizes:
        frame = img.resize(s, Image.LANCZOS).convert("RGBA")
        buf = io.BytesIO()
        frame.save(buf, format="PNG")
        png_data_list.append(buf.getvalue())

    header = struct.pack("<HHH", 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    entries = b""
    for i, (w, h) in enumerate(sizes):
        data = png_data_list[i]
        entry_w = w if w < 256 else 0
        entry_h = h if h < 256 else 0
        entries += struct.pack("<BBBBHHII", entry_w, entry_h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    with open(path, "wb") as f:
        f.write(header + entries)
        for data in png_data_list:
            f.write(data)

    print(f"  ICO: {path}")


def save_icns(img, path):
    img.save(path, format="ICNS")
    print(f"  ICNS: {path}")


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC} ({src.size})")

    # md-file.png — keep source aspect ratio, scale to 512px height
    print("Generating md-file.png (512px)...")
    ratio = 512 / src.height
    new_w = round(src.width * ratio)
    png = src.resize((new_w, 512), Image.LANCZOS)
    png_path = os.path.join(ICONS_DIR, "md-file.png")
    png.save(png_path, "PNG")
    print(f"  PNG: {png_path}")

    # md-file.ico — multi-size from source
    print("Generating md-file.ico...")
    ico_path = os.path.join(ICONS_DIR, "md-file.ico")
    save_ico(src.resize((256, 256), Image.LANCZOS), ico_path)

    # md-file.icns — 1024px
    print("Generating md-file.icns (1024px)...")
    ratio = 1024 / src.height
    new_w = round(src.width * ratio)
    icns = src.resize((new_w, 1024), Image.LANCZOS)
    icns_path = os.path.join(ICONS_DIR, "md-file.icns")
    save_icns(icns, icns_path)

    print("\nDone!")
    for p in [png_path, ico_path, icns_path]:
        print(f"  {p} ({os.path.getsize(p):,} bytes)")


if __name__ == "__main__":
    main()
