importScripts("widgets.js");

const tabCounts = new Map();

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname || null;
  } catch (e) {
    return null;
  }
}

function allowedForHost(siteAllowedWidgets, hostname) {
  if (!hostname) return [];
  const list = siteAllowedWidgets[hostname];
  return Array.isArray(list) ? list : [];
}

// Builds one block rule per widget domain/urlFilter, excluding any site
// where the user has explicitly allowed that specific widget. This keeps
// blocking global by default while letting exceptions persist per-site.
function buildRules(siteAllowedWidgets) {
  const exceptionsByWidget = new Map();
  for (const [hostname, keys] of Object.entries(siteAllowedWidgets)) {
    for (const key of keys) {
      if (!exceptionsByWidget.has(key)) exceptionsByWidget.set(key, []);
      exceptionsByWidget.get(key).push(hostname);
    }
  }

  const rules = [];
  let id = 1;
  for (const widget of CBB_WIDGETS) {
    const excludedInitiatorDomains = exceptionsByWidget.get(widget.key);
    const filters = [];
    if (widget.domains) {
      for (const domain of widget.domains) filters.push(`||${domain}^`);
    }
    if (widget.urlFilters) {
      for (const filter of widget.urlFilters) filters.push(filter);
    }
    for (const urlFilter of filters) {
      const condition = {
        urlFilter,
        resourceTypes: ["script", "sub_frame", "xmlhttprequest", "websocket"],
      };
      if (excludedInitiatorDomains && excludedInitiatorDomains.length) {
        condition.excludedInitiatorDomains = excludedInitiatorDomains;
      }
      rules.push({ id: id++, priority: 1, action: { type: "block" }, condition });
    }
  }
  return rules;
}

function syncDynamicRules() {
  chrome.storage.local.get({ enabled: true, siteAllowedWidgets: {} }, (data) => {
    const enabled = data.enabled !== false;
    const desired = enabled ? buildRules(data.siteAllowedWidgets || {}) : [];

    chrome.declarativeNetRequest.getDynamicRules((existing) => {
      const removeRuleIds = existing.map((r) => r.id);
      chrome.declarativeNetRequest.updateDynamicRules(
        { removeRuleIds, addRules: desired },
        () => {
          if (chrome.runtime.lastError) {
            // Ignore — can happen transiently while rules are still settling.
          }
        }
      );
    });
  });
}

// Pushes fresh {enabled, allowed} state to every open tab so already-open
// pages reflect a toggle/allow-list change live, without a reload.
function broadcastSiteState() {
  chrome.storage.local.get({ enabled: true, siteAllowedWidgets: {} }, (data) => {
    const enabled = data.enabled !== false;
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (typeof tab.id !== "number" || !tab.url) continue;
        const hostname = hostnameForUrl(tab.url);
        const allowed = allowedForHost(data.siteAllowedWidgets || {}, hostname);
        chrome.tabs.sendMessage(tab.id, { type: "cbb-site-state", enabled, allowed }, () => {
          if (chrome.runtime.lastError) {
            // No content script in this tab (chrome://, extension gallery, etc.) — ignore.
          }
        });
      }
    });
  });
}

function updateBadge(tabId, enabled) {
  if (typeof tabId !== "number") return;
  if (!enabled) {
    chrome.action.setBadgeText({ tabId, text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#9ca3af" });
    return;
  }
  const count = tabCounts.get(tabId) || 0;
  chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#dc2626" });
}

function refreshAllBadges() {
  chrome.storage.local.get({ enabled: true }, (data) => {
    const enabled = data.enabled !== false;
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) updateBadge(tab.id, enabled);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true, siteAllowedWidgets: {} }, (data) => {
    if (data.enabled === undefined) chrome.storage.local.set({ enabled: true });
    syncDynamicRules();
  });
});

chrome.runtime.onStartup?.addListener(() => {
  syncDynamicRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.siteAllowedWidgets) {
    syncDynamicRules();
    broadcastSiteState();
  }
  if (changes.enabled) {
    refreshAllBadges();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "cbb-get-site-state") {
    const hostname = sender.tab ? hostnameForUrl(sender.tab.url) : null;
    chrome.storage.local.get({ enabled: true, siteAllowedWidgets: {} }, (data) => {
      sendResponse({
        enabled: data.enabled !== false,
        allowed: allowedForHost(data.siteAllowedWidgets || {}, hostname),
      });
    });
    return true;
  }

  if (message.type === "cbb-blocked" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id;
    const prev = tabCounts.get(tabId) || 0;
    tabCounts.set(tabId, prev + (message.count || 0));
    chrome.storage.local.get({ enabled: true }, (data) => {
      updateBadge(tabId, data.enabled !== false);
    });
    return;
  }

  if (message.type === "cbb-get-tab-count") {
    const tabId = message.tabId;
    sendResponse({ count: tabCounts.get(tabId) || 0 });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabCounts.set(tabId, 0);
    chrome.storage.local.get({ enabled: true }, (data) => {
      updateBadge(tabId, data.enabled !== false);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCounts.delete(tabId);
});

syncDynamicRules();
refreshAllBadges();
