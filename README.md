# Cappie

A little Chrome extension that lets you pick any DOM element on a page — or walk up to its container — and capture it as a **real vector SVG** or a **high-res PNG (1–10×)** you can layer into marketing graphics.

Under the hood it uses [dom-to-svg](https://github.com/felixfbecker/dom-to-svg), which converts layout into actual `<rect>`/`<text>`/`<image>` SVG nodes (no `foreignObject` screenshots), so captures paste cleanly into Figma, Illustrator, etc.

## Install

Grab the packaged build — no toolchain needed:

1. Download **`cappie-1.0.0.zip`** from the [latest release](https://github.com/spronta/cappie/releases/latest) and unzip it.
2. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, Arc).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the unzipped `cappie-1.0.0/` folder.
5. Pin Cappie so its icon stays in the toolbar.

Requires Chrome 116 or newer. A Chrome Web Store listing is on the way; until then this is the install path.

<details>
<summary>Prefer to build it yourself?</summary>

```bash
npm install
npm run build
```

Then load the generated `dist/` folder as an unpacked extension, same as steps 2–5 above.
</details>

## Usage

Launch the picker with the toolbar icon, **Alt+Shift+C**, or right-click → **Capture with Cappie**.

1. Hover to highlight an element, click to select it.
2. Walk the tree: **↑** selects the container, **↓** goes back down, or jump straight to any ancestor with the breadcrumb dropdown.
3. Shape the capture:
   - **Erase** — click parts of the selection (cookie banners, badges, chips) to strip them from the capture; the live page is untouched.
   - **No BG** — drop the selection's own background, border, and shadow for transparent layering.
   - **− / +** — add transparent padding (up to 64px) around the capture, baked into the SVG viewBox.
   - **Scale select** — PNG export scale, 1× to 10×. Huge selections auto-clamp to Chrome's canvas limits (~16k px per side); the toast reports the applied scale.
   - **3s** — arm a delay: the page is released for 3 seconds so you can open a dropdown or hover state, then the shot fires.
4. Capture:
   - **SVG** (or **Enter**) → vector SVG, downloaded + copied to clipboard as text.
   - **PNG** (or **Shift+Enter** for 3×, **Alt+Enter** for 10×) → PNG at the selected scale, downloaded + copied to clipboard as an image (paste straight into Figma).
   - **Similar** → capture every element matching the selection's tag + classes (up to 20) as individual SVGs. Allow multiple downloads if Chrome asks.
5. **Esc** exits Erase mode, then deselects, then quits. The icon/shortcut toggles the picker off too.

Options like No BG, padding, and scale are sticky while the page is loaded.

## Capture history

Every capture is saved (with a thumbnail) to a history page: right-click the Cappie toolbar icon → **Capture history**. Re-download the SVG, export a fresh PNG, copy the SVG text, or delete entries. History keeps the last 12 captures (~6MB budget); oversized captures keep their thumbnail but drop the stored SVG.

## Notes & limitations

- **Webfonts are embedded.** Cappie collects the page's `@font-face` rules (including cross-origin sheets like Google Fonts), fetches only the faces/weights actually used inside your selection, and inlines them as base64 `data:` URIs in the SVG's `<style>`. Captures render with the right fonts in Figma, other machines, and the PNG rasterizer. Total font payload is capped at 8 MB per capture. If a font host blocks CORS the face is skipped with a console warning and text falls back to the next family in the stack.
- **Cross-origin images** are inlined as data URIs only when the host allows CORS; otherwise the SVG keeps the URL reference.
- Content inside cross-origin **iframes**, `<canvas>`, and `<video>` can't be captured.
- Won't run on `chrome://` pages or the Chrome Web Store (Chrome blocks extensions there).

## Development

```bash
npm run build      # icons + bundles → dist/
npm run typecheck  # tsc --noEmit
```

`test/harness.html` loads the built content script directly (no extension needed) — serve the repo root with any static server and open it to test the picker end-to-end. Outside the extension, history falls back to `localStorage`, so `dist/history.html` works there too. The last capture is exposed as `window.__cappieLastSVG` / `window.__cappieLastPNG` / `window.__cappieLastBatch` for debugging.

## License

Copyright © 2026 Spronta Ltd.

Cappie is free software, licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). You can use it, modify it, and redistribute it — but derivative works must stay under the AGPL, including when you offer them to users over a network.

Bundled dependency: [dom-to-svg](https://github.com/felixfbecker/dom-to-svg) (MIT).

