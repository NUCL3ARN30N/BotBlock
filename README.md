# BotBlock

[![Stars](https://img.shields.io/github/stars/NUCL3ARN30N/BotBlock?style=flat-square&color=6c5ce7&labelColor=16161b)](https://github.com/NUCL3ARN30N/BotBlock/stargazers)
[![Forks](https://img.shields.io/github/forks/NUCL3ARN30N/BotBlock?style=flat-square&color=6c5ce7&labelColor=16161b)](https://github.com/NUCL3ARN30N/BotBlock/network/members)
[![Issues](https://img.shields.io/github/issues/NUCL3ARN30N/BotBlock?style=flat-square&color=fd79a8&labelColor=16161b)](https://github.com/NUCL3ARN30N/BotBlock/issues)
[![License](https://img.shields.io/github/license/NUCL3ARN30N/BotBlock?style=flat-square&color=00b894&labelColor=16161b)](LICENSE)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Manifest V3](https://img.shields.io/badge/Manifest_V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white)

> Browser extension that blocks chatbot widgets and embedded AI assistants on any website, with a global toggle and per-site exceptions.

## Blocking

| Feature | Description |
|---|---|
| **Network Blocking** | Blocks 70+ known chat/AI-widget vendors at the request level via `declarativeNetRequest` — script, iframe, XHR, and websocket |
| **DOM Blocking** | Removes any widget element left in the page, and keeps watching via `MutationObserver` for widgets injected after load |
| **Live Toggle** | The popup's global Enabled/Disabled switch applies instantly across every open tab, no reload needed |
| **Per-Site Exceptions** | Allow a single widget on one site without disabling protection anywhere else — the choice is remembered for future visits to that site |
| **Trusted Sites** | Fully exempt a site from blocking in one step, instead of allowing widgets one at a time — managed from the options page |
| **Custom Widget Rules** | Add your own vendor (name, domains, DOM tokens) from the options page for anything not in the built-in catalog — gets the same network + DOM blocking as any built-in widget |
| **Filter List Subscriptions** | Subscribe to a shared JSON list of widget rules instead of adding each one by hand — refreshes automatically, see [Filter Lists](#filter-lists) below |
| **Backup** | Export/import your protection setting, per-site allow-list, trusted sites, custom rules, and subscriptions as a JSON file, from the options page |
| **Badge Counter** | Toolbar badge shows how many widgets were blocked on the current tab |

## Supported Widgets

70+ vendors out of the box — Intercom, Drift, Zendesk Chat, Tawk.to, Crisp, Tidio, Freshchat, Voiceflow, Botpress, Chatbase, Typebot, HubSpot Chat, Facebook Messenger plugin, IBM Watson Assistant, Google Dialogflow Messenger, and more — plus a generic detector for unbranded chat/AI-assistant widgets. All of it lives in one shared registry (`widgets.js`), so adding a new vendor is a single entry, not a scattered patch.

## Filter Lists

Beyond the built-in catalog and your own custom rules, BotBlock can subscribe to community-maintained filter lists — JSON files listing additional widget vendors, refreshed automatically about once a day. A starter list lives at [NUCL3ARN30N/botblock-filterlists](https://github.com/NUCL3ARN30N/botblock-filterlists); subscribe to it (or your own) from the options page's **Filter List Subscriptions** section. That repo also documents the list format and how to contribute a new vendor.

## Installation

**Chrome / Edge / Brave**

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** and select the repository folder

**Firefox** (121+)

1. Clone or download this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select any file inside the repository folder (e.g. `manifest.json`)

## Requirements

Any modern Chromium-based browser (Chrome, Edge, Brave) or Firefox 121+ (for Manifest V3 `background.service_worker` support). No backend required — all blocking runs entirely within your browser.

## Architecture

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, unmodified across Chrome and Firefox |
| `widgets.js` | Shared vendor registry (name, domains, DOM keyword tokens) used by background, content script, and popup |
| `background.js` | Service worker — rebuilds dynamic `declarativeNetRequest` rules from `widgets.js` plus custom/subscribed widgets minus each site's allow-list, fetches and refreshes filter list subscriptions (`chrome.alarms`, once daily), tracks per-tab blocked counts |
| `content.js` | Injected at `document_start` on every frame; identifies which vendor an element belongs to and removes/hides it live unless that vendor is allowed, or the site is fully trusted |
| `popup.html` / `popup.js` / `popup.css` | Toolbar popup — enable/disable switch, per-tab domain + block count, expandable per-site widget allow-list |
| `options.html` / `options.js` / `options.css` | Full settings page (`chrome.runtime.openOptionsPage()`) — manage trusted sites, custom widget rules, filter list subscriptions, and backup export/import |
| `icons/`, `gen_icons.ps1` | Toolbar icons and the script that generates them |

## Credits

Popup UI styled after [NUCL3ARN30N/sitecheck](https://github.com/NUCL3ARN30N/sitecheck).
