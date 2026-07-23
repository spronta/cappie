// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

// Capture history storage. Uses chrome.storage.local in the extension;
// falls back to localStorage so the test harness works without extension APIs.

export type CaptureRecord = {
  id: string
  ts: number
  url: string
  title: string
  desc: string
  width: number
  height: number
  svg: string // '' when the capture was too large to store
  thumb: string // small PNG data URL, may be ''
}

const KEY = 'cappieHistory'
const MAX_RECORDS = 12
const MAX_TOTAL_CHARS = 6_000_000
const MAX_SVG_CHARS = 3_000_000

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local
}

async function readAll(): Promise<CaptureRecord[]> {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get(KEY)
    return Array.isArray(data[KEY]) ? data[KEY] : []
  }
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(records: CaptureRecord[]): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [KEY]: records })
    return
  }
  // localStorage has a ~5MB quota — evict oldest until the write fits
  const toWrite = [...records]
  while (true) {
    try {
      localStorage.setItem(KEY, JSON.stringify(toWrite))
      return
    } catch {
      if (!toWrite.length) return
      toWrite.pop()
    }
  }
}

function evict(records: CaptureRecord[]): CaptureRecord[] {
  const out = [...records]
  const total = () => out.reduce((n, r) => n + r.svg.length + r.thumb.length, 0)
  while (out.length > MAX_RECORDS || (out.length > 1 && total() > MAX_TOTAL_CHARS)) out.pop()
  return out
}

export async function addCapture(record: CaptureRecord): Promise<void> {
  const rec = record.svg.length > MAX_SVG_CHARS ? { ...record, svg: '' } : record
  const records = await readAll()
  records.unshift(rec)
  await writeAll(evict(records))
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  return readAll()
}

export async function removeCapture(id: string): Promise<void> {
  await writeAll((await readAll()).filter((r) => r.id !== id))
}

export async function clearCaptures(): Promise<void> {
  await writeAll([])
}
