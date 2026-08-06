importScripts("widgets.js");

const tabDetectedWidgets = new Map(); // tabId -> Set of widget keys seen on that page, unioned across every frame

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

function isTrustedHost(trustedSites, hostname) {
  return !!hostname && Array.isArray(trustedSites) && trustedSites.includes(hostname);
}

// Widgets from the user's own custom rules plus every *enabled* subscribed
// filter list, flattened into one array. This is the single place both the
// rule builder and the per-tab site-state message pull "everything beyond
// the built-in catalog" from, so content.js never needs to know
// subscriptions exist — it just sees a flat customWidgets list either way.
function extraWidgetsFrom(data) {
  const subWidgets = (Array.isArray(data.subscribedLists) ? data.subscribedLists : [])
    .filter((l) => l && l.enabled !== false && Array.isArray(l.widgets))
    .flatMap((l) => l.widgets);
  return [...(Array.isArray(data.customWidgets) ? data.customWidgets : []), ...subWidgets];
}

// Builds one block rule per widget domain/urlFilter, excluding any site
// where the user has explicitly allowed that specific widget, or trusted the
// whole site. This keeps blocking global by default while letting
// exceptions persist per-site. Custom widgets and subscribed filter-list
// widgets are merged in alongside the built-in catalog so they get the same
// network-level blocking, not just DOM hiding.
function buildRules(siteAllowedWidgets, trustedSites, extraWidgets) {
  const exceptionsByWidget = new Map();
  for (const [hostname, keys] of Object.entries(siteAllowedWidgets)) {
    for (const key of keys) {
      if (!exceptionsByWidget.has(key)) exceptionsByWidget.set(key, []);
      exceptionsByWidget.get(key).push(hostname);
    }
  }

  const allWidgets = [...CBB_WIDGETS, ...(Array.isArray(extraWidgets) ? extraWidgets : [])];
  const trusted = Array.isArray(trustedSites) ? trustedSites : [];

  const rules = [];
  let id = 1;
  for (const widget of allWidgets) {
    const excludedInitiatorDomains = [...new Set([...(exceptionsByWidget.get(widget.key) || []), ...trusted])];
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
      if (excludedInitiatorDomains.length) {
        condition.excludedInitiatorDomains = excludedInitiatorDomains;
      }
      rules.push({ id: id++, priority: 1, action: { type: "block" }, condition });
    }
  }
  return rules;
}

// syncDynamicRules() is triggered from several independent places (startup,
// onInstalled, onStartup, every siteAllowedWidgets/enabled change) that can
// fire close together — e.g. right after installing, the unconditional
// startup sync and onInstalled's sync both fire at once, and allowing a
// widget soon after can race a third. Each run does a non-atomic
// read-storage -> read-existing-rules -> replace-all-rules sequence, so two
// overlapping runs can interleave and let a stale one (computed before a
// widget was allowed) finish *after* the correct one, silently re-blocking
// it at the network layer even though storage says it's allowed. Queuing
// keeps runs sequential and guarantees the last one always reflects the
// latest storage state.
let syncRunning = false;
let syncQueued = false;

function syncDynamicRules() {
  if (syncRunning) {
    syncQueued = true;
    return;
  }
  syncRunning = true;
  runDynamicRuleSync(() => {
    syncRunning = false;
    if (syncQueued) {
      syncQueued = false;
      syncDynamicRules();
    }
  });
}

const STORAGE_DEFAULTS = { enabled: true, siteAllowedWidgets: {}, trustedSites: [], customWidgets: [], subscribedLists: [] };

function runDynamicRuleSync(done) {
  chrome.storage.local.get(STORAGE_DEFAULTS, (data) => {
    const enabled = data.enabled !== false;
    const desired = enabled ? buildRules(data.siteAllowedWidgets || {}, data.trustedSites, extraWidgetsFrom(data)) : [];

    chrome.declarativeNetRequest.getDynamicRules((existing) => {
      const removeRuleIds = existing.map((r) => r.id);
      chrome.declarativeNetRequest.updateDynamicRules(
        { removeRuleIds, addRules: desired },
        () => {
          if (chrome.runtime.lastError) {
            // Ignore — can happen transiently while rules are still settling.
          }
          done();
        }
      );
    });
  });
}

// Pushes fresh {enabled, allowed, trusted, customWidgets} state to every
// open tab so already-open pages reflect a toggle/allow-list/trust/custom
// rule change live, without a reload.
function broadcastSiteState() {
  chrome.storage.local.get(STORAGE_DEFAULTS, (data) => {
    const enabled = data.enabled !== false;
    const extraWidgets = extraWidgetsFrom(data);
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (typeof tab.id !== "number" || !tab.url) continue;
        const hostname = hostnameForUrl(tab.url);
        const allowed = allowedForHost(data.siteAllowedWidgets || {}, hostname);
        const trusted = isTrustedHost(data.trustedSites, hostname);
        chrome.tabs.sendMessage(
          tab.id,
          { type: "cbb-site-state", enabled, allowed, trusted, customWidgets: extraWidgets },
          () => {
            if (chrome.runtime.lastError) {
              // No content script in this tab (chrome://, extension gallery, etc.) — ignore.
            }
          }
        );
      }
    });
  });
}

// Distinct widgets currently blocked on a tab = widgets detected anywhere on
// the page (any frame) minus the ones allowed for that tab's hostname, or
// zero outright if the whole site is trusted. This is the single source of
// truth for both the toolbar badge and the popup stat, so they can never
// disagree.
function blockedCountForTab(tabId, cb) {
  const detected = tabDetectedWidgets.get(tabId);
  if (!detected || !detected.size) return cb(0);
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) return cb(detected.size);
    const hostname = hostnameForUrl(tab.url);
    chrome.storage.local.get({ siteAllowedWidgets: {}, trustedSites: [] }, (data) => {
      if (isTrustedHost(data.trustedSites, hostname)) return cb(0);
      const allowed = new Set(allowedForHost(data.siteAllowedWidgets || {}, hostname));
      let count = 0;
      for (const key of detected) {
        if (!allowed.has(key)) count++;
      }
      cb(count);
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
  blockedCountForTab(tabId, (count) => {
    chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#dc2626" });
  });
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
  chrome.storage.local.get(STORAGE_DEFAULTS, (data) => {
    if (data.enabled === undefined) chrome.storage.local.set({ enabled: true });
    syncDynamicRules();
  });
});

chrome.runtime.onStartup?.addListener(() => {
  syncDynamicRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    changes.enabled ||
    changes.siteAllowedWidgets ||
    changes.trustedSites ||
    changes.customWidgets ||
    changes.subscribedLists
  ) {
    syncDynamicRules();
    broadcastSiteState();
    // Any of these changes the blocked-vs-allowed split, so the badge needs
    // recomputing too, not just enabled toggles.
    refreshAllBadges();
  }
});

// Filter-list subscriptions let a widget rule be authored once and shared —
// a URL to a JSON file with the same {name, domains, tokens} shape as a
// custom widget, refreshed periodically instead of hand-typed per user.
const MAX_LIST_WIDGETS = 200;

function sanitizeListWidgets(rawWidgets, keyPrefix) {
  const cleaned = [];
  if (!Array.isArray(rawWidgets)) return cleaned;
  for (const w of rawWidgets.slice(0, MAX_LIST_WIDGETS)) {
    if (!w || typeof w !== "object") continue;
    const name = typeof w.name === "string" ? w.name.trim() : "";
    const tokens = Array.isArray(w.tokens) ? w.tokens.filter((t) => typeof t === "string" && t.trim()) : [];
    if (!name || !tokens.length) continue;
    const domains = Array.isArray(w.domains) ? w.domains.map(cbbSanitizeDomain).filter(Boolean) : [];
    const baseKey = typeof w.key === "string" && w.key.trim() ? cbbSlugify(w.key) : cbbSlugify(name);
    cleaned.push({ key: `sub-${keyPrefix}-${baseKey || "widget"}`, name, domains, tokens });
  }
  return cleaned;
}

// Fetches and validates a filter list. Throws with a user-facing message on
// any failure — network, bad JSON, or the wrong shape — so callers can
// surface it directly instead of failing silently.
async function fetchFilterList(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    throw new Error("Couldn't reach that URL.");
  }
  if (!res.ok) throw new Error(`Server responded with ${res.status}.`);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== "object" || !data.botblockFilterList || !Array.isArray(data.widgets)) {
    throw new Error("That doesn't look like a BotBlock filter list.");
  }
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Untitled list";
  const keyPrefix = cbbShortHash(url);
  const widgets = sanitizeListWidgets(data.widgets, keyPrefix);
  return { name, widgets };
}

function updateSubscribedList(url, patch) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ subscribedLists: [] }, (data) => {
      const lists = (Array.isArray(data.subscribedLists) ? data.subscribedLists : []).map((l) =>
        l.url === url ? { ...l, ...patch } : l
      );
      chrome.storage.local.set({ subscribedLists: lists }, () => resolve(lists));
    });
  });
}

function refreshSubscription(url) {
  return fetchFilterList(url)
    .then((result) =>
      updateSubscribedList(url, {
        name: result.name,
        widgets: result.widgets,
        lastFetchedAt: new Date().toISOString(),
        lastError: null,
      }).then(() => ({ ok: true, ...result }))
    )
    .catch((err) => {
      const message = err && err.message ? err.message : String(err);
      return updateSubscribedList(url, { lastError: message, lastFetchedAt: new Date().toISOString() }).then(() => ({
        ok: false,
        error: message,
      }));
    });
}

chrome.alarms.create("cbb-refresh-subscriptions", { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "cbb-refresh-subscriptions") return;
  chrome.storage.local.get({ subscribedLists: [] }, (data) => {
    for (const list of data.subscribedLists || []) {
      if (list.enabled === false) continue;
      refreshSubscription(list.url);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "cbb-add-subscription") {
    const url = typeof message.url === "string" ? message.url.trim() : "";
    if (!url) {
      sendResponse({ ok: false, error: "No URL provided." });
      return true;
    }
    chrome.storage.local.get({ subscribedLists: [] }, (data) => {
      const lists = Array.isArray(data.subscribedLists) ? data.subscribedLists : [];
      if (lists.some((l) => l.url === url)) {
        sendResponse({ ok: false, error: "Already subscribed to this list." });
        return;
      }
      fetchFilterList(url)
        .then((result) => {
          const entry = {
            url,
            name: result.name,
            enabled: true,
            addedAt: new Date().toISOString(),
            lastFetchedAt: new Date().toISOString(),
            lastError: null,
            widgets: result.widgets,
          };
          chrome.storage.local.set({ subscribedLists: [...lists, entry] }, () => {
            sendResponse({ ok: true, list: entry });
          });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
        });
    });
    return true;
  }

  if (message.type === "cbb-refresh-subscription") {
    const url = typeof message.url === "string" ? message.url : "";
    refreshSubscription(url).then((result) => sendResponse(result));
    return true;
  }

  if (message.type === "cbb-get-site-state") {
    const hostname = sender.tab ? hostnameForUrl(sender.tab.url) : null;
    chrome.storage.local.get(STORAGE_DEFAULTS, (data) => {
      sendResponse({
        enabled: data.enabled !== false,
        allowed: allowedForHost(data.siteAllowedWidgets || {}, hostname),
        trusted: isTrustedHost(data.trustedSites, hostname),
        customWidgets: extraWidgetsFrom(data),
      });
    });
    return true;
  }

  if (message.type === "cbb-detected" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id;
    const keys = Array.isArray(message.keys) ? message.keys : [];
    const set = tabDetectedWidgets.get(tabId) || new Set();
    for (const key of keys) set.add(key);
    tabDetectedWidgets.set(tabId, set);
    chrome.storage.local.get({ enabled: true }, (data) => {
      updateBadge(tabId, data.enabled !== false);
    });
    return;
  }

  if (message.type === "cbb-get-tab-widgets") {
    const tabId = message.tabId;
    blockedCountForTab(tabId, (count) => {
      sendResponse({
        count,
        detectedKeys: Array.from(tabDetectedWidgets.get(tabId) || []),
      });
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabDetectedWidgets.delete(tabId);
    chrome.storage.local.get({ enabled: true }, (data) => {
      updateBadge(tabId, data.enabled !== false);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabDetectedWidgets.delete(tabId);
});

syncDynamicRules();
refreshAllBadges();
