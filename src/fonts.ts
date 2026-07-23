// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

// Embeds the webfonts used inside a captured element into the SVG as
// data-URI @font-face rules, so the SVG renders correctly outside the page
// (other machines, Figma, and the isolated <img> context used for PNG export).

type FontSource = { url: string; format?: string }

type ParsedFace = {
  family: string
  familyKey: string
  weight: string
  weightRange: [number, number]
  style: 'normal' | 'italic'
  stretch?: string
  unicodeRange?: string
  sources: FontSource[]
}

type UsedFonts = {
  families: Set<string>
  weights: Map<string, Set<number>>
  styles: Map<string, Set<string>>
}

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'math', 'emoji', 'fangsong',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont',
])

const MAX_EMBED_BYTES = 8 * 1024 * 1024

// url -> data URI (null = fetch failed; don't retry within the session)
const fontDataCache = new Map<string, string | null>()

function familyKey(name: string): string {
  return name.trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase()
}

function parseWeightRange(raw: string): [number, number] {
  const w = raw.trim().toLowerCase()
  if (!w || w === 'normal') return [400, 400]
  if (w === 'bold') return [700, 700]
  const parts = w.split(/\s+/).map((p) => parseInt(p, 10)).filter((n) => !isNaN(n))
  if (parts.length === 2) return [Math.min(parts[0], parts[1]), Math.max(parts[0], parts[1])]
  if (parts.length === 1) return [parts[0], parts[0]]
  return [400, 400]
}

function collectUsedFonts(root: Element): UsedFonts {
  const used: UsedFonts = { families: new Set(), weights: new Map(), styles: new Map() }
  const els = [root, ...root.querySelectorAll('*')]
  for (const el of els) {
    const cs = getComputedStyle(el)
    const weight = parseInt(cs.fontWeight, 10) || 400
    const style = /italic|oblique/.test(cs.fontStyle) ? 'italic' : 'normal'
    for (const raw of cs.fontFamily.split(',')) {
      const key = familyKey(raw)
      if (!key || GENERIC_FAMILIES.has(key)) continue
      used.families.add(key)
      if (!used.weights.has(key)) used.weights.set(key, new Set())
      used.weights.get(key)!.add(weight)
      if (!used.styles.has(key)) used.styles.set(key, new Set())
      used.styles.get(key)!.add(style)
    }
  }
  return used
}

const SRC_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)(?:\s*format\(\s*(['"]?)([^'")]+)\3\s*\))?/g

function buildFace(
  familyRaw: string,
  srcRaw: string,
  weightRaw: string,
  styleRaw: string,
  stretchRaw: string,
  unicodeRangeRaw: string,
  baseHref: string | null,
): ParsedFace | null {
  const family = familyRaw.trim().replace(/^['"]|['"]$/g, '')
  if (!family || !srcRaw) return null
  const sources: FontSource[] = []
  for (const m of srcRaw.matchAll(SRC_URL_RE)) {
    try {
      const url = m[2].startsWith('data:') ? m[2] : new URL(m[2], baseHref ?? document.baseURI).href
      sources.push({ url, format: m[4]?.toLowerCase() })
    } catch { /* unresolvable URL */ }
  }
  if (!sources.length) return null
  const weight = weightRaw.trim() || 'normal'
  return {
    family,
    familyKey: familyKey(family),
    weight,
    weightRange: parseWeightRange(weight),
    style: /italic|oblique/.test(styleRaw) ? 'italic' : 'normal',
    stretch: stretchRaw.trim() || undefined,
    unicodeRange: unicodeRangeRaw.trim() || undefined,
    sources,
  }
}

function faceFromRule(rule: CSSFontFaceRule, baseHref: string | null): ParsedFace | null {
  const s = rule.style
  return buildFace(
    s.getPropertyValue('font-family'),
    s.getPropertyValue('src'),
    s.getPropertyValue('font-weight'),
    s.getPropertyValue('font-style'),
    s.getPropertyValue('font-stretch'),
    s.getPropertyValue('unicode-range'),
    baseHref,
  )
}

const FACE_BLOCK_RE = /@font-face\s*\{([^}]*)\}/g

function facesFromCssText(css: string, baseHref: string | null): ParsedFace[] {
  const out: ParsedFace[] = []
  for (const block of css.matchAll(FACE_BLOCK_RE)) {
    const body = block[1]
    const get = (prop: string) => {
      const m = body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, 'i'))
      return m ? m[1].trim() : ''
    }
    const face = buildFace(
      get('font-family'), get('src'), get('font-weight'),
      get('font-style'), get('font-stretch'), get('unicode-range'),
      baseHref,
    )
    if (face) out.push(face)
  }
  return out
}

async function facesFromSheet(sheet: CSSStyleSheet, out: ParsedFace[]): Promise<void> {
  let rules: CSSRuleList | null = null
  try {
    rules = sheet.cssRules
  } catch {
    rules = null // cross-origin stylesheet; fall through to fetching its text
  }
  if (rules) {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        const face = faceFromRule(rule, sheet.href)
        if (face) out.push(face)
      } else if (rule instanceof CSSImportRule) {
        try {
          if (rule.styleSheet) await facesFromSheet(rule.styleSheet, out)
        } catch { /* cross-origin import */ }
      }
    }
    return
  }
  if (!sheet.href) return
  try {
    const res = await fetch(sheet.href, { mode: 'cors', credentials: 'omit' })
    if (res.ok) out.push(...facesFromCssText(await res.text(), sheet.href))
  } catch (err) {
    console.warn('Cappie: could not read stylesheet for fonts', sheet.href, err)
  }
}

async function collectFaces(): Promise<ParsedFace[]> {
  const out: ParsedFace[] = []
  const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])]
  for (const sheet of sheets) {
    await facesFromSheet(sheet as CSSStyleSheet, out)
  }
  return out
}

function faceMatches(face: ParsedFace, used: UsedFonts): boolean {
  if (!used.families.has(face.familyKey)) return false
  if (face.style === 'italic' && !used.styles.get(face.familyKey)?.has('italic')) return false
  const [min, max] = face.weightRange
  for (const w of used.weights.get(face.familyKey) ?? []) {
    if (w >= min - 100 && w <= max + 100) return true
  }
  return false
}

function pickSource(sources: FontSource[]): FontSource {
  const byFormat = (fmt: string) => sources.find((s) => s.format === fmt || (!s.format && s.url.includes(`.${fmt}`)))
  return byFormat('woff2') ?? byFormat('woff') ?? sources[0]
}

function mimeFor(url: string, format?: string): string {
  const f = format ?? url.split('?')[0].split('.').pop()?.toLowerCase()
  switch (f) {
    case 'woff2': return 'font/woff2'
    case 'woff': return 'font/woff'
    case 'ttf': case 'truetype': return 'font/ttf'
    case 'otf': case 'opentype': return 'font/otf'
    default: return 'application/octet-stream'
  }
}

async function toDataURI(src: FontSource): Promise<string | null> {
  if (src.url.startsWith('data:')) return src.url
  const cached = fontDataCache.get(src.url)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(src.url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
    }
    const uri = `data:${mimeFor(src.url, src.format)};base64,${btoa(bin)}`
    fontDataCache.set(src.url, uri)
    return uri
  } catch (err) {
    console.warn('Cappie: could not fetch font', src.url, err)
    fontDataCache.set(src.url, null)
    return null
  }
}

/** Returns the number of font faces embedded. */
export async function embedWebFonts(svgDoc: XMLDocument, root: Element): Promise<number> {
  const used = collectUsedFonts(root)
  if (!used.families.size) return 0
  const faces = (await collectFaces()).filter((f) => faceMatches(f, used))
  if (!faces.length) return 0

  let css = ''
  let embedded = 0
  let totalBytes = 0
  for (const face of faces) {
    const uri = await toDataURI(pickSource(face.sources))
    if (!uri) continue
    if (totalBytes + uri.length > MAX_EMBED_BYTES) {
      console.warn(`Cappie: skipping remaining fonts — embed budget (${MAX_EMBED_BYTES / 1024 / 1024}MB) reached`)
      break
    }
    totalBytes += uri.length
    css += `@font-face{font-family:${JSON.stringify(face.family)};src:url("${uri}");` +
      `font-weight:${face.weight};font-style:${face.style};` +
      (face.stretch ? `font-stretch:${face.stretch};` : '') +
      (face.unicodeRange ? `unicode-range:${face.unicodeRange};` : '') +
      '}\n'
    embedded++
  }
  if (!css) return 0

  const existing: Element | null = svgDoc.querySelector('style')
  const styleEl = existing ?? svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style')
  if (!existing) svgDoc.documentElement.prepend(styleEl)
  styleEl.textContent = `${styleEl.textContent ?? ''}\n${css}`
  return embedded
}
