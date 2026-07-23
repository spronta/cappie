// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['src/content.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/content.js',
  logLevel: 'info',
})

await build({
  entryPoints: ['src/background.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/background.js',
  logLevel: 'info',
})

await build({
  entryPoints: ['src/history.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/history.js',
  logLevel: 'info',
})

cpSync('src/history.html', 'dist/history.html')
cpSync('manifest.json', 'dist/manifest.json')
if (existsSync('icons')) cpSync('icons', 'dist/icons', { recursive: true })

console.log('Cappie built → dist/ (load this folder as an unpacked extension)')
