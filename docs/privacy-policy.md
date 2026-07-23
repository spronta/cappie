# Cappie privacy policy

Last updated: 24 July 2026

Cappie is a Chrome extension published by Spronta Ltd. that captures a web page element you select and exports it as an SVG or PNG file.

## What we collect

Nothing. Cappie has no analytics, no accounts, no telemetry, and no server. Spronta Ltd. never receives your data, because there is nowhere for it to be sent.

## What stays on your device

- **Capture history.** Your last 12 captures (a thumbnail plus the SVG source) are stored locally with `chrome.storage.local` so you can re-export them. Clear them at any time from the capture history page, or by removing the extension.
- **Preferences.** Options such as transparent background, padding and PNG scale are remembered while a page is loaded.

Neither leaves your browser.

## Page access

Cappie reads the current page only after you explicitly activate it there, by clicking the toolbar icon, pressing the keyboard shortcut, or choosing "Capture with Cappie" from the right-click menu. It uses Chrome's `activeTab` permission, which grants access to that one tab for that one session and nothing else. Cappie requests no host permissions and does not run in the background on any site.

While building a capture, Cappie fetches the fonts and images the page already references, so they can be embedded in the exported file. Those requests go to the same asset hosts the page itself uses, carry no credentials, and send no information about you.

## Changes

Any change to this policy will be published in the repository at https://github.com/spronta/cappie, with the date above updated.

## Contact

Questions about this policy or about how Cappie handles your data: hello@spronta.com
