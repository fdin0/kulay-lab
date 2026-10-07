"""Build every media asset for Kulay Lab and measure it for the spec table.

Masters (lossless originals) live in source/. Web-ready files go to assets/.
Run from the project root:   python tools/build_assets.py

To use your own photo or voice instead of the generated ones, drop
source/photo-master.png, source/hero-master.png or source/narration.wav
in place and run the script again. Existing masters are never overwritten.
"""

import json
import struct
import subprocess
import wave
from pathlib import Path

import lameenc
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
IMG = ROOT / "assets" / "images"
AUD = ROOT / "assets" / "audio"
for d in (SRC, IMG, AUD):
    d.mkdir(parents=True, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def ramp(stops, t):
    """Piecewise-linear color ramp. stops = [(pos, (r, g, b)), ...]."""
    out = np.zeros(t.shape + (3,))
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=float)
    for c in range(3):
        out[..., c] = np.interp(t, pos, cols[:, c])
    return out


def ridge(x, seed, octaves=6):
    """1-D fractal noise from summed sines, used for mountain outlines."""
    rng = np.random.default_rng(seed)
    y = np.zeros_like(x)
    amp, freq = 1.0, 1.5
    for _ in range(octaves):
        y += amp * np.sin(x * freq * np.pi * 2 + rng.uniform(0, 6.28))
        amp *= 0.5
        freq *= 2.1
    return y


# ---------------------------------------------------------------- photo master
def render_sunset(w=1600, h=1000):
    """Sunset over mountains and water: long smooth gradients show banding."""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    u, v = xx / w, yy / h
    horizon = 0.62

    sky = ramp(
        [(0.00, (28, 22, 74)), (0.22, (74, 38, 120)), (0.42, (196, 70, 112)),
         (0.54, (246, 128, 76)), (0.62, (255, 196, 112))],
        v,
    )
    sx, sy = 0.64, 0.415
    d = np.sqrt(((u - sx) * w / h) ** 2 + (v - sy) ** 2)
    glow = np.exp(-(d / 0.16) ** 2)[..., None]
    sky = lerp(sky, np.array([255, 226, 160.0]), glow * 0.75)
    disk = np.clip((0.05 - d) / 0.004, 0, 1)[..., None]
    sky = lerp(sky, np.array([255, 246, 214.0]), disk)
    img = sky.copy()

    x = np.linspace(0, 1, w)
    layers = [  # (base height, roughness, seed, color, haze)
        (0.47, 0.050, 3, (120, 60, 120), 0.55),
        (0.53, 0.045, 7, (78, 38, 92), 0.35),
        (0.585, 0.035, 11, (38, 22, 54), 0.10),
    ]
    for base, rough, seed, col, haze in layers:
        top = base + rough * ridge(x, seed) / 1.9
        mask = (v >= top[None, :]) & (v < horizon)
        depth = np.clip((v - top[None, :]) / 0.15, 0, 1)[..., None]
        shade = lerp(np.array(col, float), np.array(col, float) * 0.6, depth)
        shade = lerp(shade, sky, haze)
        img = np.where(mask[..., None], shade, img)

    # Water: mirrored sky, darker, with a broken sun streak.
    wv = np.clip(v - horizon, 0, None)
    mirror = np.clip(horizon - wv * 1.6, 0, 1)
    refl = ramp(
        [(0.00, (28, 22, 74)), (0.22, (74, 38, 120)), (0.42, (196, 70, 112)),
         (0.54, (246, 128, 76)), (0.62, (255, 196, 112))],
        mirror,
    ) * 0.72
    rng = np.random.default_rng(42)
    ripples = np.sin(yy * 0.9 + np.sin(xx * 0.015) * 3) * 0.5 + 0.5
    streak = np.exp(-((u - sx) * w / h / (0.03 + wv * 0.5)) ** 2)
    streak *= (ripples > 0.55) * np.exp(-wv / 0.3)
    refl = lerp(refl, np.array([255, 214, 150.0]), streak[..., None] * 0.85)
    img = np.where((v >= horizon)[..., None], refl, img)

    img += rng.normal(0, 0.6, img.shape)  # faint sensor noise
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


# ----------------------------------------------------------------- hero master
def render_subpixels(w=1600, h=1000, cell=46):
    """Macro view of a screen: every pixel is three R, G, B stripes."""
    cols, rows = w // cell + 1, h // cell + 1
    gy, gx = np.mgrid[0:rows, 0:cols].astype(float)
    gu, gv = gx / cols, gy / rows
    hue = (gu * 0.9 + gv * 0.35 + 0.55 * np.exp(-((gu - 0.62) ** 2 + (gv - 0.45) ** 2) / 0.05)) % 1.0
    # HSV -> RGB for the underlying low-resolution image
    i = np.floor(hue * 6).astype(int) % 6
    f = hue * 6 - np.floor(hue * 6)
    s, val = 0.85, 1.0
    p, q, t = val * (1 - s), val * (1 - f * s), val * (1 - (1 - f) * s)
    lut = [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)]
    base = np.zeros((rows, cols, 3))
    for k, (r, g, b) in enumerate(lut):
        m = i == k
        base[m, 0] = np.broadcast_to(r, i.shape)[m]
        base[m, 1] = np.broadcast_to(g, i.shape)[m]
        base[m, 2] = np.broadcast_to(b, i.shape)[m]
    base *= (0.8 + 0.2 * np.cos((gu - 0.6) * 3)[..., None])

    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = xx // cell, yy // cell
    lx, ly = (xx % cell) / cell, (yy % cell) / cell
    stripe = np.minimum((lx * 3).astype(int), 2)
    sx = (lx * 3) % 1.0
    shape = (np.clip(1 - np.abs(sx - 0.5) / 0.42, 0, 1) ** 0.35) * (np.clip(1 - np.abs(ly - 0.5) / 0.46, 0, 1) ** 0.25)
    level = base[cy, cx, stripe] * shape
    tint = np.array([[255, 40, 50], [40, 255, 90], [60, 90, 255]], float)
    img = tint[stripe] * level[..., None]

    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    bloom = np.asarray(im.filter(ImageFilter.GaussianBlur(cell * 0.35)), float)
    img = np.clip(img * 1.15 + bloom * 1.1, 0, 255)

    # Shallow depth of field: sharp across the middle, soft at the edges.
    sharp = Image.fromarray(img.astype(np.uint8), "RGB")
    soft = np.asarray(sharp.filter(ImageFilter.GaussianBlur(9)), float)
    v = yy / h
    focus = np.clip(np.abs(v - 0.5) / 0.4, 0, 1)[..., None] ** 1.5
    img = lerp(img, soft, focus)
    vignette = 1 - 0.35 * (((xx / w - 0.5) ** 2 + (yy / h - 0.5) ** 2) / 0.5)
    img *= vignette[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


# ------------------------------------------------------------------- narration
NARRATION = (
    "Welcome to Kulay Lab. Kulay is the Filipino word for color. "
    "Every image on your screen is made of pixels, and every pixel is stored as numbers. "
    "Each pixel mixes three lights: red, green and blue. "
    "Each channel is a number from zero to two hundred and fifty five, which takes eight bits. "
    "Three channels make twenty four bits per pixel, enough for about sixteen point seven million colors. "
    "Bit depth is the number of bits per pixel. More bits mean more colors, and bigger files. "
    "Quantization replaces each pixel with the nearest color from a small palette. "
    "A full color photo can drop to two hundred and fifty six colors, or even to eight. "
    "The file gets smaller, but smooth areas like skies can break into visible steps called banding. "
    "Screens use the R G B model, which adds light. Printers use C M Y K, which subtracts it. "
    "And color pickers use H S L: hue, saturation and lightness. "
    "Now open the color mixer and listen to your color."
)


def synthesize_wav(path):
    """Windows SAPI text-to-speech, 44.1 kHz, 16-bit, mono PCM."""
    text = NARRATION.replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$v = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name };"
        "if ($v -contains 'Microsoft Zira Desktop') { $s.SelectVoice('Microsoft Zira Desktop') };"
        "$s.Rate = 0;"
        "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100,"
        " [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,"
        " [System.Speech.AudioFormat.AudioChannel]::Mono);"
        f"$s.SetOutputToWaveFile('{path}', $f);"
        f"$s.Speak('{text}');"
        "$s.Dispose()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def wav_to_mp3(wav_path, mp3_path, kbps=64):
    with wave.open(str(wav_path), "rb") as w:
        channels, rate, width = w.getnchannels(), w.getframerate(), w.getsampwidth()
        frames = w.readframes(w.getnframes())
        duration = w.getnframes() / rate
    assert width == 2, "narration.wav must be 16-bit PCM"
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(rate)
    enc.set_channels(channels)
    enc.set_quality(2)
    mp3_path.write_bytes(enc.encode(frames) + enc.flush())
    return {"rate": rate, "channels": channels, "bits": width * 8, "seconds": round(duration, 1)}


def png_bit_depth(path):
    with open(path, "rb") as f:
        f.read(16)
        _w, _h, depth, ctype = struct.unpack(">IIBB", f.read(10))
    return depth, ctype


def main():
    sizes = {}

    hero_src = SRC / "hero-master.png"
    if not hero_src.exists():
        render_subpixels().save(hero_src, optimize=True)
    hero = Image.open(hero_src).convert("RGB")
    hero.thumbnail((1200, 1200))
    hero.save(IMG / "hero.webp", "WEBP", quality=78, method=6)
    sizes["hero.webp"] = {"master": hero_src.stat().st_size, "web": (IMG / "hero.webp").stat().st_size,
                          "dims": hero.size, "raw": hero.size[0] * hero.size[1] * 3}

    photo_src = SRC / "photo-master.png"
    if not photo_src.exists():
        render_sunset().save(photo_src, optimize=True)
    photo = Image.open(photo_src).convert("RGB")
    photo.thumbnail((800, 800), Image.LANCZOS)
    raw = photo.size[0] * photo.size[1] * 3

    photo.save(IMG / "photo-24bit.png", optimize=True)
    for n, name in ((256, "photo-256.png"), (8, "photo-8.png")):
        q = photo.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q.save(IMG / name, optimize=True)
    for name in ("photo-24bit.png", "photo-256.png", "photo-8.png"):
        depth, ctype = png_bit_depth(IMG / name)
        sizes[name] = {"master": photo_src.stat().st_size, "web": (IMG / name).stat().st_size,
                       "dims": photo.size, "raw": raw, "png_bit_depth": depth, "png_color_type": ctype}

    wav = SRC / "narration.wav"
    if not wav.exists():
        synthesize_wav(wav)
    info = wav_to_mp3(wav, AUD / "narration.mp3")
    sizes["narration.mp3"] = {"master": wav.stat().st_size, "web": (AUD / "narration.mp3").stat().st_size, **info}

    (SRC / "media-sizes.json").write_text(json.dumps(sizes, indent=2))
    for k, v in sizes.items():
        print(f"{k:16} {v['master']:>10,} B master -> {v['web']:>9,} B web   {v}")


if __name__ == "__main__":
    main()
