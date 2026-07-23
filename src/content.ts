// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

import { elementToSVG, inlineResources } from 'dom-to-svg'
import { embedWebFonts } from './fonts'
import { clampScale, download, rasterizePNG, rasterizeThumb } from './export'
import { addCapture } from './store'

declare global {
  interface Window {
    __cappie?: { toggle(): void }
    __cappieLastSVG?: string
    __cappieLastPNG?: { width: number; height: number; bytes: number; scale: number }
    __cappieLastBatch?: number
  }
}

type Mode = 'hover' | 'locked'

const Z_MAX = '2147483647'
const BATCH_LIMIT = 20

function createCappie() {
  let active = false
  let mode: Mode = 'hover'
  let target: Element | null = null
  // elements we walked up from, so ↓ retraces the same path back down
  let downStack: Element[] = []
  let toastTimer: number | undefined
  // capture options
  let excludeMode = false
  const excluded = new Set<Element>()
  let noBg = false
  let pad = 0
  let delayArmed = false

  const host = document.createElement('cappie-root')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .box {
        position: fixed; z-index: ${Z_MAX}; pointer-events: none;
        border: 1.5px solid #a3e635; background: rgba(163, 230, 53, 0.08);
        border-radius: 2px;
      }
      .xbox {
        position: fixed; z-index: ${Z_MAX}; pointer-events: none;
        border: 1.5px dashed #f87171; background: rgba(248, 113, 113, 0.14);
        border-radius: 2px;
      }
      .xhover {
        position: fixed; z-index: ${Z_MAX}; pointer-events: none;
        border: 1.5px solid #f87171; background: rgba(248, 113, 113, 0.1);
        border-radius: 2px;
      }
      .label {
        position: fixed; z-index: ${Z_MAX}; pointer-events: none;
        background: #0b0b0f; color: #fafafa; border: 1px solid #27272a;
        font-size: 11px; line-height: 1; padding: 5px 8px; border-radius: 6px;
        white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
      }
      .label b { color: #a3e635; font-weight: 600; }
      .label span { color: #a1a1aa; margin-left: 6px; }
      .toolbar {
        position: fixed; z-index: ${Z_MAX};
        display: flex; flex-direction: column; gap: 6px;
        background: #0b0b0f; border: 1px solid #27272a; border-radius: 10px;
        padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .row { display: flex; align-items: center; gap: 6px; }
      .flex { flex: 1; }
      button, select {
        appearance: none; border: 1px solid #27272a; background: #18181b; color: #fafafa;
        font-size: 12px; line-height: 1; padding: 7px 9px; border-radius: 7px; cursor: pointer;
      }
      button:hover, select:hover { background: #27272a; }
      button.primary { background: #a3e635; border-color: #a3e635; color: #0b0b0f; font-weight: 600; }
      button.primary:hover { background: #bef264; }
      button.toggle.on { background: #a3e635; border-color: #a3e635; color: #0b0b0f; font-weight: 600; }
      button:disabled { opacity: 0.4; cursor: default; }
      select.crumb { max-width: 220px; }
      .padctl { display: flex; align-items: center; gap: 2px; }
      .padctl button { padding: 7px 7px; }
      .padv { min-width: 30px; text-align: center; font-size: 11px; color: #a1a1aa; }
      .toast {
        position: fixed; z-index: ${Z_MAX}; left: 50%; bottom: 24px; transform: translateX(-50%);
        background: #0b0b0f; color: #fafafa; border: 1px solid #27272a;
        font-size: 12.5px; padding: 9px 14px; border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4); white-space: nowrap;
      }
      [hidden] { display: none !important; }
    </style>
    <div class="box" hidden></div>
    <div class="xhover" hidden></div>
    <div class="xboxes"></div>
    <div class="label" hidden></div>
    <div class="toolbar" hidden>
      <div class="row">
        <select class="crumb" title="Jump to any container"></select>
        <button data-act="parent" title="Select container (↑)">&#8593;</button>
        <button data-act="child" title="Back down (↓)">&#8595;</button>
        <span class="flex"></span>
        <button data-act="close" title="Cancel (Esc)">&#10005;</button>
      </div>
      <div class="row">
        <button data-act="exclude" class="toggle" title="Erase mode — click parts of the selection to remove them from the capture">Erase</button>
        <button data-act="nobg" class="toggle" title="Strip the selection's own background, border and shadow">No BG</button>
        <span class="padctl" title="Transparent padding around the capture">
          <button data-act="pad-">&#8722;</button><span class="padv">0px</span><button data-act="pad+">+</button>
        </span>
        <select class="scale" title="PNG export scale">
          <option value="1">1&times;</option>
          <option value="2">2&times;</option>
          <option value="3" selected>3&times;</option>
          <option value="4">4&times;</option>
          <option value="10">10&times;</option>
        </select>
        <button data-act="timer" class="toggle" title="Arm a 3s delay — open menus / hover states before the shot">3s</button>
        <span class="flex"></span>
        <button data-act="similar" title="Capture every similar element on the page as SVGs (up to ${BATCH_LIMIT})">Similar</button>
        <button data-act="capture" class="primary" title="Capture SVG (Enter)">SVG</button>
        <button data-act="capture-png" class="primary" title="Capture PNG at the selected scale (&#8679;Enter = 3&times;, &#8997;Enter = 10&times;)">PNG</button>
      </div>
    </div>
    <div class="toast" hidden></div>
  `
  const box = shadow.querySelector('.box') as HTMLElement
  const xhover = shadow.querySelector('.xhover') as HTMLElement
  const xboxes = shadow.querySelector('.xboxes') as HTMLElement
  const label = shadow.querySelector('.label') as HTMLElement
  const toolbar = shadow.querySelector('.toolbar') as HTMLElement
  const crumbSel = shadow.querySelector('select.crumb') as HTMLSelectElement
  const scaleSel = shadow.querySelector('select.scale') as HTMLSelectElement
  const padv = shadow.querySelector('.padv') as HTMLElement
  const toastEl = shadow.querySelector('.toast') as HTMLElement
  const parentBtn = shadow.querySelector('[data-act="parent"]') as HTMLButtonElement
  const childBtn = shadow.querySelector('[data-act="child"]') as HTMLButtonElement
  const excludeBtn = shadow.querySelector('[data-act="exclude"]') as HTMLButtonElement
  const nobgBtn = shadow.querySelector('[data-act="nobg"]') as HTMLButtonElement
  const timerBtn = shadow.querySelector('[data-act="timer"]') as HTMLButtonElement

  const cursorStyle = document.createElement('style')
  cursorStyle.textContent = '*, *::before, *::after { cursor: crosshair !important; }'

  function describe(el: Element): string {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const cls = el.classList.length
      ? '.' + [...el.classList].slice(0, 2).join('.')
      : ''
    return `${tag}${id}${cls}`
  }

  function ancestorChain(el: Element): Element[] {
    const chain: Element[] = []
    let n: Element | null = el
    while (n && n !== document.documentElement) {
      chain.push(n)
      if (n === document.body) break
      n = n.parentElement
    }
    return chain
  }

  function refreshToolbar() {
    if (!target) return
    crumbSel.innerHTML = ''
    for (const [i, el] of ancestorChain(target).entries()) {
      const opt = document.createElement('option')
      opt.value = String(i)
      opt.textContent = (i ? '↑ '.repeat(Math.min(i, 3)) : '') + describe(el)
      crumbSel.appendChild(opt)
    }
    crumbSel.selectedIndex = 0
    parentBtn.disabled = !(target.parentElement && target !== document.body)
    childBtn.disabled = !(downStack.length || target.firstElementChild)
    excludeBtn.classList.toggle('on', excludeMode)
    nobgBtn.classList.toggle('on', noBg)
    timerBtn.classList.toggle('on', delayArmed)
    padv.textContent = `${pad}px`
  }

  function placeBox(elBox: HTMLElement, r: DOMRect) {
    elBox.hidden = false
    elBox.style.left = `${r.left}px`
    elBox.style.top = `${r.top}px`
    elBox.style.width = `${r.width}px`
    elBox.style.height = `${r.height}px`
  }

  function renderExcluded() {
    xboxes.innerHTML = ''
    for (const el of excluded) {
      if (!el.isConnected) continue
      const d = document.createElement('div')
      d.className = 'xbox'
      placeBox(d, el.getBoundingClientRect())
      xboxes.appendChild(d)
    }
  }

  function positionOverlay() {
    if (!target || !target.isConnected) return
    const r = target.getBoundingClientRect()
    placeBox(box, r)

    label.hidden = false
    label.innerHTML = `<b></b><span></span>`
    ;(label.firstElementChild as HTMLElement).textContent = describe(target)
    ;(label.lastElementChild as HTMLElement).textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`
    const labelTop = r.top > 30 ? r.top - 26 : r.bottom + 6
    label.style.left = `${Math.max(6, r.left)}px`
    label.style.top = `${labelTop}px`

    renderExcluded()

    if (mode === 'locked') {
      toolbar.hidden = false
      const tw = toolbar.offsetWidth || 560
      const th = toolbar.offsetHeight || 80
      let tx = r.left
      let ty = r.bottom + 8
      if (ty + th > window.innerHeight - 8) ty = Math.max(8, r.top - th - 8)
      tx = Math.min(Math.max(8, tx), Math.max(8, window.innerWidth - tw - 8))
      toolbar.style.left = `${tx}px`
      toolbar.style.top = `${ty}px`
    } else {
      toolbar.hidden = true
    }
  }

  function toast(msg: string, ms = 2400) {
    toastEl.textContent = msg
    toastEl.hidden = false
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => { toastEl.hidden = true }, ms)
  }

  function hideUi() {
    box.hidden = true
    xhover.hidden = true
    xboxes.innerHTML = ''
    label.hidden = true
    toolbar.hidden = true
  }

  function pageTargetFromEvent(e: Event): Element | null {
    const path = e.composedPath()
    if (path.includes(host)) return null
    const t = path[0]
    if (!(t instanceof Element)) return null
    if (t === document.documentElement || t === host) return null
    return t
  }

  function lock(el: Element) {
    mode = 'locked'
    target = el
    downStack = []
    excluded.clear()
    excludeMode = false
    xhover.hidden = true
    refreshToolbar()
    positionOverlay()
  }

  function jumpTo(el: Element, viaChainIndex?: number) {
    if (viaChainIndex && target) {
      downStack.push(...ancestorChain(target).slice(0, viaChainIndex))
    }
    target = el
    refreshToolbar()
    positionOverlay()
  }

  function selectParent() {
    if (!target) return
    const p = target.parentElement
    if (!p || target === document.body) return
    downStack.push(target)
    target = p
    refreshToolbar()
    positionOverlay()
  }

  function selectChild() {
    if (!target) return
    const c = downStack.pop() ?? target.firstElementChild
    if (!c) return
    target = c
    refreshToolbar()
    positionOverlay()
  }

  function fileName(el: Element, ext: string, suffix = ''): string {
    const base = describe(el).replace(/[^a-z0-9.#-]+/gi, '-').replace(/[.#]/g, '-')
    const d = new Date()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
    return `cappie-${base}-${ts}${suffix}.${ext}`.replace(/-+/g, '-')
  }

  function scaleFromSelect(): number {
    return parseFloat(scaleSel.value) || 3
  }

  // Temporary style tweaks (erased elements, transparent background) applied
  // only for the synchronous elementToSVG pass, then restored.
  function prepareCaptureStyles(el: Element, tweaks: boolean): Array<() => void> {
    const cleanups: Array<() => void> = []
    if (!tweaks) return cleanups
    for (const x of excluded) {
      if (!(x instanceof HTMLElement) || x === el || !el.contains(x) || !x.isConnected) continue
      const prev = x.style.visibility
      x.style.visibility = 'hidden'
      cleanups.push(() => { x.style.visibility = prev })
    }
    if (noBg && el instanceof HTMLElement) {
      const s = el.style
      const prev = { background: s.background, boxShadow: s.boxShadow, borderColor: s.borderColor }
      s.background = 'none'
      s.boxShadow = 'none'
      s.borderColor = 'transparent'
      cleanups.push(() => {
        s.background = prev.background
        s.boxShadow = prev.boxShadow
        s.borderColor = prev.borderColor
      })
    }
    return cleanups
  }

  function applyPadding(svgDoc: XMLDocument) {
    if (!pad) return
    const root = svgDoc.documentElement
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    if (vb.length !== 4 || vb.some(isNaN)) return
    const [x, y, w, h] = vb
    root.setAttribute('viewBox', `${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`)
    root.setAttribute('width', String(w + 2 * pad))
    root.setAttribute('height', String(h + 2 * pad))
  }

  async function renderSvg(el: Element, tweaks: boolean): Promise<{ svg: string; width: number; height: number }> {
    const cleanups = prepareCaptureStyles(el, tweaks)
    let svgDoc: XMLDocument
    try {
      svgDoc = elementToSVG(el)
    } finally {
      cleanups.forEach((fn) => fn())
    }
    try {
      await inlineResources(svgDoc.documentElement)
    } catch (err) {
      console.warn('Cappie: some resources could not be inlined', err)
    }
    try {
      const fontCount = await embedWebFonts(svgDoc, el)
      if (fontCount) console.info(`Cappie: embedded ${fontCount} webfont face(s)`)
    } catch (err) {
      console.warn('Cappie: webfont embedding failed', err)
    }
    applyPadding(svgDoc)
    const root = svgDoc.documentElement
    const rect = el.getBoundingClientRect()
    const width = parseFloat(root.getAttribute('width') || '0') || rect.width
    const height = parseFloat(root.getAttribute('height') || '0') || rect.height
    return { svg: new XMLSerializer().serializeToString(svgDoc), width, height }
  }

  async function saveToHistory(el: Element, svg: string, width: number, height: number) {
    try {
      const thumb = await rasterizeThumb(svg, width, height, 320).catch(() => '')
      await addCapture({
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ts: Date.now(),
        url: location.href,
        title: document.title,
        desc: describe(el),
        width, height, svg, thumb,
      })
    } catch (err) {
      console.warn('Cappie: could not save capture to history', err)
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  // Let the hidden overlay actually leave the frame before elementToSVG reads
  // the page. rAF is throttled to a standstill in background/occluded tabs, so
  // race it against a short timeout — never hang a capture on rendering state.
  const settleFrame = () =>
    new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (!done) {
          done = true
          resolve()
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(finish))
      setTimeout(finish, 120)
    })

  // 3s-delay mode: release the page so the user can open menus / hover states,
  // then shoot whatever is showing.
  async function runCountdown() {
    detachListeners()
    cursorStyle.remove()
    for (let s = 3; s > 0; s--) {
      toast(`Capturing in ${s}… set up your hover/menu state`, 1400)
      await sleep(1000)
    }
    delayArmed = false
  }

  async function capture(kind: 'svg' | 'png', requestedScale = scaleFromSelect()) {
    if (!target) return
    const el = target
    hideUi()
    if (delayArmed) await runCountdown()
    toast('Capturing…', 60000)
    await settleFrame()
    try {
      const { svg, width, height } = await renderSvg(el, true)
      window.__cappieLastSVG = svg

      let copied = false
      if (kind === 'svg') {
        try {
          await navigator.clipboard.writeText(svg)
          copied = true
        } catch { /* clipboard needs focus/permission; download still happens */ }
        download(new Blob([svg], { type: 'image/svg+xml' }), fileName(el, 'svg'))
        await saveToHistory(el, svg, width, height)
        deactivate()
        toast(copied ? 'SVG downloaded & copied to clipboard ✓' : 'SVG downloaded ✓')
      } else {
        const scale = clampScale(requestedScale, width, height)
        const png = await rasterizePNG(svg, width, height, scale)
        window.__cappieLastPNG = { width: Math.round(width * scale), height: Math.round(height * scale), bytes: png.size, scale }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          copied = true
        } catch { /* clipboard needs focus/permission; download still happens */ }
        download(png, fileName(el, `${scale}x.png`))
        await saveToHistory(el, svg, width, height)
        deactivate()
        const lbl = scale < requestedScale ? `PNG ${scale}× (clamped from ${requestedScale}× — canvas limit)` : `PNG ${scale}×`
        toast(copied ? `${lbl} downloaded & copied to clipboard ✓` : `${lbl} downloaded ✓`)
      }
    } catch (err) {
      console.error('Cappie: capture failed', err)
      refreshToolbar()
      positionOverlay()
      toast('Capture failed — see console for details')
    }
  }

  function findSimilar(el: Element): Element[] {
    let candidates: Element[]
    if (el.classList.length) {
      const selector = el.tagName.toLowerCase() + [...el.classList].map((c) => `.${CSS.escape(c)}`).join('')
      candidates = [...document.querySelectorAll(selector)]
    } else {
      candidates = [...(el.parentElement?.children ?? [])].filter((c) => c.tagName === el.tagName)
    }
    return candidates
      .filter((c) => !host.contains(c) && !c.contains(host))
      .filter((c) => {
        const r = c.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      .slice(0, BATCH_LIMIT)
  }

  async function captureSimilar() {
    if (!target) return
    const el = target
    const matches = findSimilar(el)
    if (matches.length < 2) {
      toast('No similar elements found — capture it solo with SVG/PNG')
      return
    }
    hideUi()
    await settleFrame()
    try {
      let done = 0
      for (const [i, m] of matches.entries()) {
        toast(`Capturing ${i + 1}/${matches.length}…`, 60000)
        const { svg } = await renderSvg(m, false)
        download(new Blob([svg], { type: 'image/svg+xml' }), fileName(m, 'svg', `-${i + 1}`))
        done++
        await sleep(180) // give Chrome room to accept sequential downloads
      }
      window.__cappieLastBatch = done
      deactivate()
      toast(`${done} similar elements downloaded as SVGs ✓ (allow multiple downloads if Chrome asks)`, 4000)
    } catch (err) {
      console.error('Cappie: batch capture failed', err)
      refreshToolbar()
      positionOverlay()
      toast('Batch capture failed — see console for details')
    }
  }

  function exitLockOrDeactivate() {
    if (excludeMode) {
      excludeMode = false
      xhover.hidden = true
      refreshToolbar()
      return
    }
    if (mode === 'locked') {
      mode = 'hover'
      target = null
      downStack = []
      excluded.clear()
      hideUi()
    } else {
      deactivate()
    }
  }

  // --- window-level listeners (capture phase so the page never reacts) ---

  const onMouseMove = (e: MouseEvent) => {
    if (!active) return
    if (excludeMode && mode === 'locked') {
      const el = pageTargetFromEvent(e)
      if (el && target && target.contains(el) && el !== target) {
        placeBox(xhover, el.getBoundingClientRect())
      } else {
        xhover.hidden = true
      }
      return
    }
    if (mode !== 'hover') return
    const el = pageTargetFromEvent(e)
    if (!el) return
    target = el
    positionOverlay()
  }

  const swallow = (e: Event) => {
    if (!active) return
    if (e.composedPath().includes(host)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  const onClick = (e: MouseEvent) => {
    if (!active) return
    if (e.composedPath().includes(host)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const el = pageTargetFromEvent(e)
    if (!el) return
    if (excludeMode && mode === 'locked') {
      if (target && target.contains(el) && el !== target) {
        if (excluded.has(el)) excluded.delete(el)
        else excluded.add(el)
        renderExcluded()
      }
      return
    }
    lock(el)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      exitLockOrDeactivate()
    } else if (mode === 'locked' && e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopImmediatePropagation()
      selectParent()
    } else if (mode === 'locked' && e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopImmediatePropagation()
      selectChild()
    } else if (mode === 'locked' && e.key === 'Enter') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.altKey) void capture('png', 10)
      else if (e.shiftKey) void capture('png', 3)
      else void capture('svg')
    }
  }

  const onReposition = () => {
    if (active && target) positionOverlay()
  }

  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    e.stopPropagation()
    switch (btn.dataset.act) {
      case 'parent': selectParent(); break
      case 'child': selectChild(); break
      case 'exclude':
        excludeMode = !excludeMode
        if (!excludeMode) xhover.hidden = true
        refreshToolbar()
        break
      case 'nobg':
        noBg = !noBg
        refreshToolbar()
        break
      case 'pad-':
        pad = Math.max(0, pad - 8)
        refreshToolbar()
        break
      case 'pad+':
        pad = Math.min(64, pad + 8)
        refreshToolbar()
        break
      case 'timer':
        delayArmed = !delayArmed
        refreshToolbar()
        break
      case 'similar': void captureSimilar(); break
      case 'capture': void capture('svg'); break
      case 'capture-png': void capture('png'); break
      case 'close': exitLockOrDeactivate(); break
    }
  })

  crumbSel.addEventListener('change', () => {
    if (!target) return
    const idx = crumbSel.selectedIndex
    if (idx > 0) {
      const chain = ancestorChain(target)
      if (chain[idx]) jumpTo(chain[idx], idx)
    }
  })

  function attachListeners() {
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('mousedown', swallow, true)
    window.addEventListener('mouseup', swallow, true)
    window.addEventListener('pointerdown', swallow, true)
    window.addEventListener('pointerup', swallow, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  }

  function detachListeners() {
    window.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('mousedown', swallow, true)
    window.removeEventListener('mouseup', swallow, true)
    window.removeEventListener('pointerdown', swallow, true)
    window.removeEventListener('pointerup', swallow, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }

  function activate() {
    if (active) return
    active = true
    mode = 'hover'
    target = null
    downStack = []
    excluded.clear()
    excludeMode = false
    delayArmed = false
    if (!host.isConnected) document.documentElement.appendChild(host)
    document.head.appendChild(cursorStyle)
    attachListeners()
    toast('Cappie: hover & click an element · ↑ container · Enter = SVG · ⇧Enter = PNG 3× · ⌥Enter = PNG 10× · Esc to quit', 4500)
  }

  function deactivate() {
    if (!active) return
    active = false
    mode = 'hover'
    target = null
    downStack = []
    excluded.clear()
    excludeMode = false
    delayArmed = false
    hideUi()
    cursorStyle.remove()
    detachListeners()
  }

  activate()

  return {
    toggle() {
      if (active) deactivate()
      else activate()
    },
  }
}

if (window.__cappie) {
  window.__cappie.toggle()
} else {
  window.__cappie = createCappie()
}

export {}
