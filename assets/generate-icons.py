#!/usr/bin/env python3
"""
Generate PWA icons from logo.svg.
Run: python3 generate-icons.py
Requires: cairosvg or Pillow
"""
import os

# Icon sizes required for PWA
SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

# SVG content for icon (standalone, no external refs)
SVG = '''<svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#0d0d13"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%25" stop-color="#8b5cf6"/>
      <stop offset="100%25" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <path d="M140 360 L140 160 L196 160 L256 280 L316 160 L372 160 L372 360 L328 360 L328 232 L268 360 L244 360 L184 232 L184 360 Z" fill="url(%23g)"/>
  <circle cx="140" cy="160" r="16" fill="url(%23g)" opacity="0.8"/>
  <circle cx="372" cy="160" r="16" fill="url(%23g)" opacity="0.8"/>
</svg>'''

icons_dir = os.path.join(os.path.dirname(__file__), 'assets', 'icons')
os.makedirs(icons_dir, exist_ok=True)

try:
    import cairosvg
    svg_bytes = SVG.encode('utf-8')
    for size in SIZES:
        out = os.path.join(icons_dir, f'icon-{size}.png')
        cairosvg.svg2png(bytestring=svg_bytes, write_to=out, output_width=size, output_height=size)
        print(f'Generated {out}')
    print('Done!')
except ImportError:
    print('cairosvg not found. Install with: pip install cairosvg')
    print('Or use an online SVG-to-PNG converter for each size.')
    print('Sizes needed:', SIZES)
    print('Save icons to: assets/icons/icon-{size}.png')
    # Create placeholder text files as a reminder
    for size in SIZES:
        path = os.path.join(icons_dir, f'icon-{size}.png.placeholder')
        with open(path, 'w') as f:
            f.write(f'Replace this with a {size}x{size} PNG icon\n')
