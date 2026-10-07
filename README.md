# Kulay Lab

An interactive web manual on **Digital Color Systems & Quantization** (Option B), by Fernandino Velasquez.

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

## Structure

```
index.html          page markup (semantic sections, inline SVG)
style.css           layout, typography, responsive rules
script.js           color mixer, Web Audio tone, SVG light toggles, posterizer
assets/images/      hero.webp, photo-24bit.png, photo-256.png, photo-8.png
assets/audio/       narration.mp3
tools/              build_assets.py (renders, quantizes, encodes and measures the media)
source/             lossless masters used for the "Original Size" column
```

## Rebuilding the media

```
pip install pillow numpy lameenc
python tools/build_assets.py
```

To use your own photo or voice, replace `source/photo-master.png`, `source/hero-master.png`
or `source/narration.wav` (16-bit PCM) and run the script again. It prints new sizes to
paste into the spec table and saves them in `source/media-sizes.json`.
