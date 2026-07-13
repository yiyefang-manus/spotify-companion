#!/bin/bash
# Generate a simple app icon using macOS sips
# This creates a basic green circle icon for the app

ICONSET_DIR="icon.iconset"
mkdir -p "$ICONSET_DIR"

# Create a simple 1024x1024 PNG using Python
python3 -c "
from PIL import Image, ImageDraw, ImageFont
import os

size = 1024
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw rounded rectangle background
margin = 80
draw.rounded_rectangle(
    [margin, margin, size - margin, size - margin],
    radius=180,
    fill=(29, 185, 84, 240)  # Spotify green with slight transparency
)

# Draw music note symbol
note_size = 400
cx, cy = size // 2, size // 2
# Simple note shape
draw.ellipse([cx - 100, cy + 50, cx + 50, cy + 180], fill=(255, 255, 255, 230))
draw.rectangle([cx + 30, cy - 200, cx + 50, cy + 120], fill=(255, 255, 255, 230))
draw.ellipse([cx + 30, cy - 220, cx + 150, cy - 140], fill=(255, 255, 255, 230))

img.save('icon_1024.png')
print('Generated icon_1024.png')
" 2>/dev/null

if [ -f "icon_1024.png" ]; then
  # Generate all required sizes
  for size in 16 32 64 128 256 512 1024; do
    sips -z $size $size icon_1024.png --out "$ICONSET_DIR/icon_${size}x${size}.png" 2>/dev/null
    if [ $size -le 512 ]; then
      double=$((size * 2))
      sips -z $double $double icon_1024.png --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" 2>/dev/null
    fi
  done

  # Convert iconset to icns
  iconutil -c icns "$ICONSET_DIR" -o icon.icns 2>/dev/null
  
  if [ -f "icon.icns" ]; then
    echo "✓ Generated icon.icns"
  else
    echo "⚠ iconutil failed, icon.icns not created (app will use default icon)"
  fi
  
  rm -rf "$ICONSET_DIR" icon_1024.png
else
  echo "⚠ Python PIL not available, skipping icon generation (app will use default icon)"
fi
