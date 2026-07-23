// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

// Generates the Cappie viewfinder icons as PNGs with zero image dependencies.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Design in 128-unit space: dark rounded square + lime viewfinder brackets.
const D = 128
const RADIUS = 28
const INSET = 26
const ARM = 26
const STROKE = 13
const BG = [11, 11, 15]
const FG = [163, 230, 53]

function insideRoundedRect(x, y) {
  if (x < 0 || y < 0 || x > D || y > D) return false
  const cx = Math.min(Math.max(x, RADIUS), D - RADIUS)
  const cy = Math.min(Math.max(y, RADIUS), D - RADIUS)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

function insideBracket(x, y) {
  // brackets are 4-way symmetric; fold into the top-left corner
  const sx = Math.min(x, D - x)
  const sy = Math.min(y, D - y)
  const horiz = sx >= INSET && sx <= INSET + ARM && sy >= INSET && sy <= INSET + STROKE
  const vert = sx >= INSET && sx <= INSET + STROKE && sy >= INSET && sy <= INSET + ARM
  return horiz || vert
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const scale = D / size
  const SS = 3 // supersampling grid
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0
      let fg = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale
          const y = (py + (sy + 0.5) / SS) * scale
          if (!insideRoundedRect(x, y)) continue
          cover++
          if (insideBracket(x, y)) fg++
        }
      }
      const n = SS * SS
      const alpha = Math.round((cover / n) * 255)
      const mix = cover ? fg / cover : 0
      const i = (py * size + px) * 4
      rgba[i] = Math.round(BG[0] + (FG[0] - BG[0]) * mix)
      rgba[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * mix)
      rgba[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * mix)
      rgba[i + 3] = alpha
    }
  }
  return encodePNG(size, rgba)
}

mkdirSync('icons', { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon-${size}.png`, renderIcon(size))
  console.log(`icons/icon-${size}.png`)
}
