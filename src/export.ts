// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

// Shared rasterization / download helpers for the content script and history page.

// Chrome caps canvases around 16384px per side / ~268M pixels total.
const MAX_CANVAS_SIDE = 16384
const MAX_CANVAS_AREA = 268_000_000

export function clampScale(scale: number, width: number, height: number): number {
  const s = Math.min(
    scale,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_AREA / (width * height)),
  )
  return Math.max(1, Math.floor(s * 100) / 100)
}

async function svgToImage(svg: string): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  img.decoding = 'async'
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('could not load captured SVG as an image'))
  })
  img.src = url
  await loaded
  return { img, revoke: () => URL.revokeObjectURL(url) }
}

async function rasterizeToCanvas(svg: string, width: number, height: number, scale: number): Promise<HTMLCanvasElement> {
  const { img, revoke } = await svgToImage(svg)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d canvas context')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas
  } finally {
    revoke()
  }
}

export async function rasterizePNG(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const canvas = await rasterizeToCanvas(svg, width, height, scale)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
}

/** Small PNG data URL preview, used for history thumbnails. */
export async function rasterizeThumb(svg: string, width: number, height: number, maxWidth: number): Promise<string> {
  const scale = Math.min(1, maxWidth / width)
  const canvas = await rasterizeToCanvas(svg, width, height, scale)
  return canvas.toDataURL('image/png')
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
