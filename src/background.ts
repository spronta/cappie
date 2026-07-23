// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Spronta Ltd.

async function inject(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
  } catch (err) {
    // chrome:// pages, the Web Store, etc. can't be scripted
    console.warn('Cappie: cannot run on this page', err)
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) void inject(tab.id)
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-picker' && tab?.id) void inject(tab.id)
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'cappie-capture',
    title: 'Capture with Cappie',
    contexts: ['page', 'selection', 'image', 'link'],
  })
  chrome.contextMenus.create({
    id: 'cappie-history',
    title: 'Capture history',
    contexts: ['action'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'cappie-capture' && tab?.id) {
    void inject(tab.id)
  } else if (info.menuItemId === 'cappie-history') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('history.html') })
  }
})
