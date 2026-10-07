/* Kulay Lab · client-side interactivity */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------------- Color math ---------------- */
  const toHex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  const toBin = (n) => n.toString(2).padStart(8, "0");

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0, s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function rgbToCmyk(r, g, b) {
    const k = 1 - Math.max(r, g, b) / 255;
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    const f = (v) => ((1 - v / 255 - k) / (1 - k)) * 100;
    return { c: f(r), m: f(g), y: f(b), k: k * 100 };
  }

  // Relative luminance (WCAG) to pick black or white text on the swatch.
  function luminance(r, g, b) {
    const lin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  const hueToHz = (h) => 220 + (h / 360) * 660;

  /* ---------------- Mobile navigation ---------------- */
  const navToggle = $(".nav-toggle");
  const nav = $("#site-nav");

  navToggle.addEventListener("click", () => {
    const open = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      navToggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
    }
  });

  // Highlight the nav link of the section currently on screen.
  const navLinks = $$(".site-nav a");
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => {
        a.setAttribute("aria-current", String(a.hash === "#" + entry.target.id));
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach((s) => spy.observe(s));

  /* ---------------- SVG additive light diagram ---------------- */
  const lightsOn = { r: true, g: true, b: true };
  const NAMES = {
    "": "", r: "Red", g: "Green", b: "Blue",
    rg: "Yellow", gb: "Cyan", rb: "Magenta", rgb: "White",
  };

  function updateDiagram() {
    $$("#rgb-diagram .light").forEach((c) => {
      c.classList.toggle("off", !lightsOn[c.dataset.light]);
    });
    $$("#rgb-diagram [data-region]").forEach((t) => {
      const mix = [...t.dataset.region].filter((ch) => lightsOn[ch]).join("");
      t.textContent = NAMES[mix];
      // Only pure blue is too dark for black text.
      t.setAttribute("fill", mix === "b" ? "#fff" : "#000");
    });
  }

  $$("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = btn.dataset.toggle;
      lightsOn[ch] = !lightsOn[ch];
      btn.setAttribute("aria-pressed", String(lightsOn[ch]));
      updateDiagram();
    });
  });
  updateDiagram();

  /* ---------------- Color mixer ---------------- */
  const sliders = { r: $("#r"), g: $("#g"), b: $("#b") };
  const outputs = { r: $("#r-out"), g: $("#g-out"), b: $("#b-out") };
  const swatch = $("#swatch");
  const swatchHex = $("#swatch-hex");
  const out = {
    hex: $("#out-hex"), rgb: $("#out-rgb"), bin: $("#out-bin"),
    hsl: $("#out-hsl"), hz: $("#out-hz"),
  };
  const modelsChip = $("#models-chip");

  function bar(label, pct, color, text, extraClass = "") {
    return `<div class="bar ${extraClass}"><b>${label}</b>` +
      `<span class="bar-track"><span class="bar-fill" style="--w:${pct}%;--c:${color}"></span></span>` +
      `<output>${text}</output></div>`;
  }

  // Build the model bars once, then only update their values.
  const bars = {
    rgb: $("#bars-rgb"), cmyk: $("#bars-cmyk"), hsl: $("#bars-hsl"),
  };
  bars.rgb.innerHTML = bar("R", 0, "#e5383b", "") + bar("G", 0, "#2bab52", "") + bar("B", 0, "#3366ff", "");
  bars.cmyk.innerHTML = bar("C", 0, "#00b7eb", "") + bar("M", 0, "#e5007e", "") + bar("Y", 0, "#ffd400", "") + bar("K", 0, "#222", "");
  bars.hsl.innerHTML = bar("H", 0, "", "", "bar-hue") + bar("S", 0, "", "") + bar("L", 0, "", "");

  function setBars(container, rows) {
    $$(".bar", container).forEach((el, i) => {
      const [pct, text, color] = rows[i];
      const fill = $(".bar-fill", el);
      fill.style.setProperty("--w", pct + "%");
      if (color) fill.style.setProperty("--c", color);
      $(".bar-track", el).style.setProperty("--w", pct + "%");
      $("output", el).textContent = text;
    });
  }

  function current() {
    return { r: +sliders.r.value, g: +sliders.g.value, b: +sliders.b.value };
  }

  function render() {
    const { r, g, b } = current();
    const hex = "#" + toHex(r) + toHex(g) + toHex(b);
    const hsl = rgbToHsl(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);
    const css = `rgb(${r}, ${g}, ${b})`;

    outputs.r.value = r;
    outputs.g.value = g;
    outputs.b.value = b;

    // Each track previews the color that slider would produce at 0 and 255.
    sliders.r.style.setProperty("--track", `linear-gradient(90deg, rgb(0,${g},${b}), rgb(255,${g},${b}))`);
    sliders.g.style.setProperty("--track", `linear-gradient(90deg, rgb(${r},0,${b}), rgb(${r},255,${b}))`);
    sliders.b.style.setProperty("--track", `linear-gradient(90deg, rgb(${r},${g},0), rgb(${r},${g},255))`);

    swatch.style.setProperty("--swatch", css);
    swatch.style.setProperty("--swatch-ink", luminance(r, g, b) > 0.18 ? "#000" : "#fff");
    swatchHex.textContent = hex;
    modelsChip.style.background = css;

    out.hex.textContent = hex;
    out.rgb.textContent = `${r}, ${g}, ${b}`;
    out.bin.innerHTML =
      `<span class="ch-r">${toBin(r)}</span> <span class="ch-g">${toBin(g)}</span> <span class="ch-b">${toBin(b)}</span>`;
    out.hsl.textContent = `${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%`;
    out.hz.textContent = `${Math.round(hueToHz(hsl.h))} Hz`;

    setBars(bars.rgb, [
      [r / 2.55, r], [g / 2.55, g], [b / 2.55, b],
    ]);
    setBars(bars.cmyk, [
      [cmyk.c, Math.round(cmyk.c) + "%"],
      [cmyk.m, Math.round(cmyk.m) + "%"],
      [cmyk.y, Math.round(cmyk.y) + "%"],
      [cmyk.k, Math.round(cmyk.k) + "%"],
    ]);
    setBars(bars.hsl, [
      [hsl.h / 3.6, Math.round(hsl.h) + "°"],
      [hsl.s, Math.round(hsl.s) + "%", `hsl(${hsl.h} 100% 45%)`],
      [hsl.l, Math.round(hsl.l) + "%", "#888"],
    ]);
  }

  Object.values(sliders).forEach((s) => s.addEventListener("input", render));

  $$(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.hex.slice(1), 16);
      sliders.r.value = (n >> 16) & 255;
      sliders.g.value = (n >> 8) & 255;
      sliders.b.value = n & 255;
      render();
    });
  });

  render();

  /* ---------------- Web Audio: hear this color ---------------- */
  let audioCtx = null;
  const hearBtn = $("#hear");

  hearBtn.addEventListener("click", () => {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const { r, g, b } = current();
    const { h, l } = rgbToHsl(r, g, b);
    const freq = hueToHz(h);
    const now = audioCtx.currentTime;
    const dur = 1.2;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    // Lightness sets the loudness, so black is quiet and bright colors ring out.
    const peak = 0.08 + 0.22 * Math.min(1, l / 50);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);

    hearBtn.classList.add("playing");
    $("#tone-note").innerHTML =
      `Playing <span class="mono">${Math.round(freq)} Hz</span> for a hue of <span class="mono">${Math.round(h)}°</span>`;
    osc.onended = () => hearBtn.classList.remove("playing");
  });

  /* ---------------- Bit depth posterizer ---------------- */
  const bitsInput = $("#bits");
  const bitsOut = $("#bits-out");
  const bitsCount = $("#bits-count");
  const canvas = $("#posterize-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // Source: hue sweeps left to right, lightness fades top to bottom.
  const source = new Uint8ClampedArray(W * H * 4);
  (function buildSource() {
    for (let y = 0; y < H; y++) {
      const light = 0.8 - (y / (H - 1)) * 0.6;
      for (let x = 0; x < W; x++) {
        const hue = (x / (W - 1)) * 300;
        const c = (1 - Math.abs(2 * light - 1));
        const hp = hue / 60;
        const xx = c * (1 - Math.abs((hp % 2) - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if (hp < 1) [r1, g1] = [c, xx];
        else if (hp < 2) [r1, g1] = [xx, c];
        else if (hp < 3) [g1, b1] = [c, xx];
        else if (hp < 4) [g1, b1] = [xx, c];
        else if (hp < 5) [r1, b1] = [xx, c];
        else [r1, b1] = [c, xx];
        const m = light - c / 2;
        const i = (y * W + x) * 4;
        source[i] = (r1 + m) * 255;
        source[i + 1] = (g1 + m) * 255;
        source[i + 2] = (b1 + m) * 255;
        source[i + 3] = 255;
      }
    }
  })();

  function posterize() {
    const bits = +bitsInput.value;
    const levels = 2 ** bits;
    const step = 255 / (levels - 1);
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(source[i] / step) * step;
      d[i + 1] = Math.round(source[i + 1] / step) * step;
      d[i + 2] = Math.round(source[i + 2] / step) * step;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const perPixel = bits * 3;
    bitsOut.value = bits;
    bitsCount.textContent =
      `${levels} levels per channel · ${perPixel} bits per pixel = ${(2 ** perPixel).toLocaleString("en-US")} colors`;
  }

  bitsInput.addEventListener("input", posterize);
  posterize();

  /* ---------------- Quantization zoom ---------------- */
  const zoomBtn = $("#zoom");
  const compare = $("#compare");
  zoomBtn.addEventListener("click", () => {
    const on = zoomBtn.getAttribute("aria-pressed") !== "true";
    zoomBtn.setAttribute("aria-pressed", String(on));
    compare.classList.toggle("zoomed", on);
    zoomBtn.textContent = on ? "Zoom out" : "Zoom into the sun";
  });
})();
