# Chrome Web Store submission

Everything the dev console asks for, ready to paste. Rebuild the package with:

```bash
npm run build && rm -f cappie-1.0.0.zip && (cd dist && zip -qr ../cappie-1.0.0.zip .)
```

Upload `cappie-1.0.0.zip` (61 KB). Bump `version` in `manifest.json` for every subsequent upload — the store rejects a re-used version number.

## Store listing

**Name:** Cappie

**Short description** (132 char limit, currently 106):

> Capture any element on a page as a real vector SVG or a high-res PNG, ready to paste straight into Figma.

**Category:** Developer Tools (secondary fit: Workflow & Planning)

**Language:** English (United States)

**Detailed description:**

> Cappie turns any element on any web page into a design asset.
>
> Hover to highlight, click to select, then export. You get a real vector SVG — actual rect, text and image nodes, not a screenshot wrapped in a foreignObject — so it pastes into Figma, Illustrator or Sketch as editable layers. Or export a PNG at up to 10x for print-sharp raster.
>
> Built for anyone who makes marketing graphics, docs, changelogs or decks out of product UI and is tired of cropping blurry screenshots.
>
> WHAT IT DOES
>
> • Vector SVG export — pastes into Figma as editable vector layers
> • PNG export from 1x to 10x, auto-clamped to the browser's canvas limit
> • Walk the tree — press the up arrow to grab the whole card instead of just the button, or jump to any ancestor from the breadcrumb
> • Erase mode — click a cookie banner, badge or stray chip to strip it from the capture; the live page is never modified
> • Transparent background — drop the selection's own background, border and shadow for clean layering
> • Padding — add up to 64px of transparent margin, baked into the SVG viewBox
> • 3-second delay — release the page so you can open a dropdown or hover state, then capture it
> • Similar elements — capture every matching card or row in one go
> • Webfonts embedded — the fonts your selection actually uses are inlined into the SVG, so text renders correctly on other machines
> • Capture history — the last 12 captures with thumbnails, re-exportable at any time
>
> Launch with the toolbar icon, Alt+Shift+C, or right-click and choose Capture with Cappie.
>
> PRIVACY
>
> Cappie collects nothing. No analytics, no accounts, no servers. Captures are created in your browser and saved only to your own device. The extension reads a page only after you explicitly activate it on that tab.
>
> OPEN SOURCE
>
> Source and issue tracker: https://github.com/spronta/cappie (AGPL-3.0)
>
> LIMITATIONS
>
> Content inside cross-origin iframes, canvas and video elements can't be captured. Cross-origin images and fonts are embedded only when the host allows CORS. Chrome blocks all extensions on chrome:// pages and the Chrome Web Store itself.

## Privacy practices tab

**Single purpose:**

> Cappie lets the user select a visible element on the current page and export that element as an SVG or PNG image file for use in design tools.

**Permission justifications:**

| Permission | Justification to paste |
|---|---|
| `activeTab` | Cappie needs to read the DOM and computed styles of the page the user is currently viewing in order to reproduce the selected element as SVG. activeTab limits this to the single tab the user explicitly invoked Cappie on, via the toolbar icon, keyboard shortcut or context menu. |
| `scripting` | Used to inject the element picker overlay and capture logic into the active tab on user invocation. The extension has no persistent content script; code runs only after the user activates it. |
| `storage` | Stores the user's capture history (thumbnails and SVG source of their last 12 captures) and their sticky UI preferences locally via chrome.storage.local. Nothing is transmitted anywhere. |
| `contextMenus` | Adds a single "Capture with Cappie" right-click entry so users can start the picker from the element they intend to capture. |

**Host permissions:** none requested. Cappie relies on activeTab instead, which is the narrowest option and usually clears review faster. Do not add broad host permissions without a concrete need.

**Remote code:** No, I am not using remote code. Everything executes from files in the package. Cappie does fetch font and image *assets* referenced by the page in order to embed them in the capture, but it never loads or evaluates external script.

**Data collection:** tick nothing. Then certify all three: no sale of data, no unrelated-purpose use, no creditworthiness use.

**Privacy policy URL:** required whenever the console asks for one even at zero collection. Publish `docs/privacy-policy.md` (see repo) at a stable URL, e.g. a GitHub Pages site or a spronta.com page, and paste that link.

## Assets to produce

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128x128 PNG | done, `icons/icon-128.png` |
| Screenshots | 1280x800 or 640x400 PNG, 1 required, 5 max | **needed** |
| Small promo tile | 440x280 PNG | optional, boosts placement |
| Marquee promo tile | 1400x560 PNG | optional, needed for featuring |

Suggested five screenshots, in order: the picker highlighting an element with the toolbar visible; the breadcrumb dropdown mid-tree-walk; erase mode with a cookie banner being removed; the result pasted into Figma as editable layers; the capture history page. Frames from the demo video work if you scale them to exactly 1280x800.

## Process

1. Register at https://chrome.google.com/webstore/devconsole — one-time $5 USD fee, Google account, identity verification.
2. Set the publisher display name to Spronta Ltd. so the listing doesn't show a personal Gmail address.
3. New item, upload the zip, fill the listing and privacy tabs above, attach screenshots.
4. Submit. First-time publishers with narrow permissions usually clear in a few days; if review flags anything it comes back with the exact policy clause.
5. Ship updates by bumping `version` and uploading a fresh zip.
