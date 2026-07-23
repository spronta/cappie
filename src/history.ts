// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

import { clampScale, download, rasterizePNG } from './export'
import { clearCaptures, listCaptures, removeCapture, type CaptureRecord } from './store'

const app = document.getElementById('app')!
const countEl = document.getElementById('count')!
const clearBtn = document.getElementById('clear') as HTMLButtonElement

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function baseName(rec: CaptureRecord): string {
  return `cappie-${rec.desc.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-')}`
}

function card(rec: CaptureRecord): HTMLElement {
  const c = el('div', 'card')

  const thumbwrap = el('div', 'thumbwrap')
  if (rec.thumb) {
    const img = el('img')
    img.src = rec.thumb
    img.alt = rec.desc
    thumbwrap.appendChild(img)
  } else {
    thumbwrap.appendChild(el('span', 'nothumb', 'no preview'))
  }
  c.appendChild(thumbwrap)

  const meta = el('div', 'meta')
  meta.appendChild(el('b', undefined, rec.desc))
  meta.appendChild(el('div', 'dims', `${Math.round(rec.width)} × ${Math.round(rec.height)} · ${new Date(rec.ts).toLocaleString()}`))
  const link = el('a', undefined, rec.title || rec.url)
  link.href = rec.url
  link.target = '_blank'
  link.rel = 'noreferrer'
  meta.appendChild(link)
  c.appendChild(meta)

  const actions = el('div', 'actions')
  const svgBtn = el('button', undefined, 'SVG')
  const pngBtn = el('button', undefined, 'PNG 3×')
  const copyBtn = el('button', undefined, 'Copy SVG')
  const delBtn = el('button', 'danger', 'Delete')
  if (!rec.svg) {
    for (const b of [svgBtn, pngBtn, copyBtn]) {
      b.disabled = true
      b.title = 'This capture was too large to keep in history'
    }
  }
  svgBtn.addEventListener('click', () => {
    download(new Blob([rec.svg], { type: 'image/svg+xml' }), `${baseName(rec)}.svg`)
  })
  pngBtn.addEventListener('click', async () => {
    pngBtn.disabled = true
    try {
      const scale = clampScale(3, rec.width, rec.height)
      download(await rasterizePNG(rec.svg, rec.width, rec.height, scale), `${baseName(rec)}-${scale}x.png`)
    } catch (err) {
      console.error('Cappie: PNG export failed', err)
      pngBtn.textContent = 'Failed'
    } finally {
      pngBtn.disabled = false
    }
  })
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(rec.svg)
      copyBtn.textContent = 'Copied ✓'
      setTimeout(() => { copyBtn.textContent = 'Copy SVG' }, 1500)
    } catch (err) {
      console.warn('Cappie: clipboard write failed', err)
    }
  })
  delBtn.addEventListener('click', async () => {
    await removeCapture(rec.id)
    await render()
  })
  actions.append(svgBtn, pngBtn, copyBtn, delBtn)
  c.appendChild(actions)
  return c
}

async function render() {
  const records = await listCaptures()
  app.innerHTML = ''
  countEl.textContent = records.length ? `${records.length} capture${records.length === 1 ? '' : 's'}` : ''
  clearBtn.hidden = !records.length
  if (!records.length) {
    app.appendChild(el('div', 'empty', 'No captures yet — pick an element with Cappie and it will show up here.'))
    return
  }
  for (const rec of records) app.appendChild(card(rec))
}

clearBtn.addEventListener('click', async () => {
  await clearCaptures()
  await render()
})

void render()
