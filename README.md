# BotBlock

[![GitHub stars](https://img.shields.io/github/stars/NUCL3ARN30N/BotBlock?style=for-the-badge)](https://github.com/NUCL3ARN30N/BotBlock/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/NUCL3ARN30N/BotBlock?style=for-the-badge)](https://github.com/NUCL3ARN30N/BotBlock/network/members)
[![GitHub issues](https://img.shields.io/github/issues/NUCL3ARN30N/BotBlock?style=for-the-badge)](https://github.com/NUCL3ARN30N/BotBlock/issues)
[![GitHub license](https://img.shields.io/github/license/NUCL3ARN30N/BotBlock?style=for-the-badge)](LICENSE)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Manifest V3](https://img.shields.io/badge/Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)

> Browser extension that blocks chatbot widgets and embedded AI assistants on any website, with a global toggle and per-site exceptions

## Quick Start

| Browser                   | Steps                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Chrome / Edge / Brave** | Clone or download this repo → open `chrome://extensions/` → enable **Developer Mode** → **Load unpacked** → pick the folder   |
| **Firefox** (121+)        | Clone or download this repo → open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` |

Protection is on from the first page load. The toolbar badge counts what was blocked on the current tab.

## Blocking

| #  | Feature                       | Description                                                                                                                                 |
| -- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | **Network Blocking**          | Blocks 70+ known chat/AI-widget vendors at the request level via `declarativeNetRequest` — script, iframe, XHR, and websocket               |
| 2  | **DOM Blocking**              | Removes any widget element left in the page, and keeps watching via `MutationObserver` for widgets injected after load                      |
| 3  | **Live Toggle**               | The popup's global Enabled/Disabled switch applies instantly across every open tab, no reload needed                                        |
| 4  | **Per-Site Exceptions**       | Allow a single widget on one site without disabling protection anywhere else — remembered for future visits                                 |
| 5  | **Trusted Sites**             | Fully exempt a site from blocking in one step, instead of allowing widgets one at a time — managed from the options page                    |
| 6  | **Custom Widget Rules**       | Add your own vendor (name, domains, DOM tokens) for anything not in the built-in catalog — same network + DOM blocking as built-ins         |
| 7  | **Filter List Subscriptions** | Subscribe to a shared JSON list of widget rules instead of adding each by hand — refreshes automatically, see [Filter Lists](#filter-lists) |
| 8  | **Backup**                    | Export/import your protection setting, per-site allow-list, trusted sites, custom rules, and subscriptions as a JSON file                   |
| 9  | **Badge Counter**             | Toolbar badge shows how many widgets were blocked on the current tab                                                                        |

## Supported Widgets

70+ vendors out of the box, plus a generic detector for unbranded chat/AI-assistant widgets. All of
it lives in one shared registry (`widgets.js`), so adding a new vendor is a single entry, not a
scattered patch.

| Category            | Vendors                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| **Live chat**       | Intercom, Drift, Zendesk Chat, Tawk.to, Crisp, Tidio, Freshchat, HubSpot Chat |
| **Bot builders**    | Voiceflow, Botpress, Chatbase, Typebot                                        |
| **Platforms**       | Facebook Messenger plugin, IBM Watson Assistant, Google Dialogflow Messenger  |
| **Everything else** | Generic detector for unbranded chat and AI-assistant widgets                  |

## Filter Lists

Beyond the built-in catalog and your own custom rules, BotBlock can subscribe to community-maintained
filter lists — JSON files listing additional widget vendors, refreshed automatically about once a day.
A starter list lives at [NUCL3ARN30N/botblock-filterlists](https://github.com/NUCL3ARN30N/botblock-filterlists);
subscribe to it (or your own) from the options page's **Filter List Subscriptions** section. That repo
also documents the list format and how to contribute a new vendor.

## Architecture

| File                                          | Purpose                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                               | MV3 manifest, unmodified across Chrome and Firefox                                                                                                                                                                                             |
| `widgets.js`                                  | Shared vendor registry (name, domains, DOM keyword tokens) used by background, content script, and popup                                                                                                                                       |
| `background.js`                               | Service worker — rebuilds dynamic `declarativeNetRequest` rules from `widgets.js` plus custom/subscribed widgets minus each site's allow-list, refreshes filter list subscriptions once daily (`chrome.alarms`), tracks per-tab blocked counts |
| `content.js`                                  | Injected at `document_start` on every frame; identifies which vendor an element belongs to and removes/hides it live unless that vendor is allowed, or the site is fully trusted                                                               |
| `popup.html` / `popup.js` / `popup.css`       | Toolbar popup — enable/disable switch, per-tab domain + block count, expandable per-site widget allow-list                                                                                                                                     |
| `options.html` / `options.js` / `options.css` | Full settings page — trusted sites, custom widget rules, filter list subscriptions, backup export/import                                                                                                                                       |
| `icons/`, `gen_icons.ps1`                     | Toolbar icons and the script that generates them                                                                                                                                                                                               |

## Requirements

**Browser:** Any modern Chromium-based browser (Chrome, Edge, Brave) or Firefox 121+ (for Manifest V3 `background.service_worker` support)  
**Server:** None — all blocking runs entirely within your browser  
**Design:** Popup UI styled after [NUCL3ARN30N/sitecheck](https://github.com/NUCL3ARN30N/sitecheck)

---

Badges from [envoy1084/awesome-badges](https://github.com/envoy1084/awesome-badges)
