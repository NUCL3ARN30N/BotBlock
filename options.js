const trustedForm = document.getElementById("trusted-form");
const trustedInput = document.getElementById("trusted-input");
const trustedListEl = document.getElementById("trusted-list");

const customForm = document.getElementById("custom-form");
const customNameInput = document.getElementById("custom-name");
const customDomainsInput = document.getElementById("custom-domains");
const customTokensInput = document.getElementById("custom-tokens");
const customListEl = document.getElementById("custom-list");

const subscriptionForm = document.getElementById("subscription-form");
const subscriptionInput = document.getElementById("subscription-input");
const subscriptionSubmit = document.getElementById("subscription-submit");
const subscriptionListEl = document.getElementById("subscription-list");
const subscriptionStatus = document.getElementById("subscription-status");

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const backupStatus = document.getElementById("backup-status");

const BUILTIN_WIDGETS = typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : [];

let trustedSites = [];
let customWidgets = [];
let subscribedLists = [];

// --- helpers ---------------------------------------------------------

// Accepts "example.com", "https://example.com/path", "www.example.com" etc.
// and reduces it to just the hostname the way the rest of the extension
// keys everything off (matches location.hostname in content.js).
function normalizeHostname(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase() || null;
  } catch (e) {
    try {
      return new URL(`https://${trimmed}`).hostname.toLowerCase() || null;
    } catch (e2) {
      return null;
    }
  }
}

function parseList(text) {
  return [...new Set(
    String(text || "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

// sanitizeDomain/slugify are shared with background.js via widgets.js
// (cbbSanitizeDomain/cbbSlugify) so a widget entry ends up in the same
// shape regardless of whether it was hand-typed here or fetched from a
// subscribed filter list.
const sanitizeDomain = cbbSanitizeDomain;
const slugify = cbbSlugify;

function generateCustomKey(name) {
  const known = new Set([...BUILTIN_WIDGETS.map((w) => w.key), ...customWidgets.map((w) => w.key)]);
  const base = `custom-${slugify(name) || "widget"}`;
  let key = base;
  while (known.has(key)) {
    key = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return key;
}

let statusTimer = null;
function showStatus(el, message, ok) {
  el.textContent = message;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.add("hidden"), 5000);
}

// --- trusted sites ----------------------------------------------------

function saveTrustedSites() {
  chrome.storage.local.set({ trustedSites });
}

function renderTrustedList() {
  trustedListEl.innerHTML = "";
  if (!trustedSites.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No trusted sites yet.";
    trustedListEl.appendChild(empty);
    return;
  }
  for (const hostname of trustedSites) {
    const row = document.createElement("div");
    row.className = "entry";

    const main = document.createElement("div");
    main.className = "entry-main";
    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = hostname;
    main.appendChild(title);

    const removeBtn = document.createElement("button");
    removeBtn.className = "entry-remove";
    removeBtn.type = "button";
    removeBtn.title = "Remove";
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.addEventListener("click", () => {
      trustedSites = trustedSites.filter((h) => h !== hostname);
      saveTrustedSites();
      renderTrustedList();
    });

    row.appendChild(main);
    row.appendChild(removeBtn);
    trustedListEl.appendChild(row);
  }
}

trustedForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const hostname = normalizeHostname(trustedInput.value);
  if (!hostname) {
    trustedInput.focus();
    return;
  }
  if (!trustedSites.includes(hostname)) {
    trustedSites = [...trustedSites, hostname].sort();
    saveTrustedSites();
    renderTrustedList();
  }
  trustedInput.value = "";
  trustedInput.focus();
});

// --- custom widget rules -----------------------------------------------

function saveCustomWidgets() {
  chrome.storage.local.set({ customWidgets });
}

function renderCustomList() {
  customListEl.innerHTML = "";
  if (!customWidgets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No custom rules yet.";
    customListEl.appendChild(empty);
    return;
  }
  for (const widget of customWidgets) {
    const row = document.createElement("div");
    row.className = "entry";

    const main = document.createElement("div");
    main.className = "entry-main";
    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = widget.name;
    const sub = document.createElement("div");
    sub.className = "entry-sub";
    const domainsPart = widget.domains && widget.domains.length ? widget.domains.join(", ") : "no domains (DOM-only)";
    sub.textContent = `${domainsPart} · tokens: ${widget.tokens.join(", ")}`;
    main.appendChild(title);
    main.appendChild(sub);

    const removeBtn = document.createElement("button");
    removeBtn.className = "entry-remove";
    removeBtn.type = "button";
    removeBtn.title = "Remove";
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.addEventListener("click", () => {
      customWidgets = customWidgets.filter((w) => w.key !== widget.key);
      saveCustomWidgets();
      renderCustomList();
    });

    row.appendChild(main);
    row.appendChild(removeBtn);
    customListEl.appendChild(row);
  }
}

customForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = customNameInput.value.trim();
  const domains = parseList(customDomainsInput.value).map(sanitizeDomain).filter(Boolean);
  const tokens = parseList(customTokensInput.value);

  if (!name) {
    customNameInput.focus();
    return;
  }
  if (!tokens.length) {
    customTokensInput.focus();
    return;
  }

  const widget = { key: generateCustomKey(name), name, domains, tokens, custom: true };
  customWidgets = [...customWidgets, widget];
  saveCustomWidgets();
  renderCustomList();

  customForm.reset();
  customNameInput.focus();
});

// --- filter list subscriptions --------------------------------------------

function renderSubscriptionList() {
  subscriptionListEl.innerHTML = "";
  if (!subscribedLists.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No subscriptions yet.";
    subscriptionListEl.appendChild(empty);
    return;
  }
  for (const list of subscribedLists) {
    const row = document.createElement("div");
    row.className = "entry";

    const main = document.createElement("div");
    main.className = "entry-main";
    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = list.name || list.url;
    const sub = document.createElement("div");
    sub.className = "entry-sub";
    const count = Array.isArray(list.widgets) ? list.widgets.length : 0;
    let status;
    if (list.lastError) status = `error: ${list.lastError}`;
    else if (list.lastFetchedAt) status = `updated ${new Date(list.lastFetchedAt).toLocaleString()}`;
    else status = "not fetched yet";
    sub.textContent = `${count} widget${count === 1 ? "" : "s"} · ${status}`;
    if (list.lastError) sub.classList.add("entry-sub-error");
    main.appendChild(title);
    main.appendChild(sub);

    // Must be a <label>, not a <span> — the checkbox itself is visually
    // hidden (opacity: 0) and only the sibling slider is visible, so a
    // native label association is what makes clicking the slider actually
    // toggle the input.
    const switchWrap = document.createElement("label");
    switchWrap.className = "mini-switch";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = list.enabled !== false;
    const slider = document.createElement("span");
    slider.className = "mini-slider";
    toggle.addEventListener("change", () => {
      subscribedLists = subscribedLists.map((l) => (l.url === list.url ? { ...l, enabled: toggle.checked } : l));
      chrome.storage.local.set({ subscribedLists });
    });
    switchWrap.appendChild(toggle);
    switchWrap.appendChild(slider);

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "entry-icon-btn";
    refreshBtn.type = "button";
    refreshBtn.title = "Update now";
    refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add("spinning");
      chrome.runtime.sendMessage({ type: "cbb-refresh-subscription", url: list.url }, (response) => {
        chrome.storage.local.get({ subscribedLists: [] }, (data) => {
          subscribedLists = Array.isArray(data.subscribedLists) ? data.subscribedLists : [];
          renderSubscriptionList();
          if (response && response.ok) {
            showStatus(subscriptionStatus, `"${response.name}" updated (${response.widgets.length} widgets).`, true);
          } else {
            showStatus(subscriptionStatus, (response && response.error) || "Couldn't update that list.", false);
          }
        });
      });
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "entry-remove";
    removeBtn.type = "button";
    removeBtn.title = "Unsubscribe";
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.addEventListener("click", () => {
      subscribedLists = subscribedLists.filter((l) => l.url !== list.url);
      chrome.storage.local.set({ subscribedLists });
      renderSubscriptionList();
    });

    row.appendChild(main);
    row.appendChild(switchWrap);
    row.appendChild(refreshBtn);
    row.appendChild(removeBtn);
    subscriptionListEl.appendChild(row);
  }
}

subscriptionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = subscriptionInput.value.trim();
  if (!url) {
    subscriptionInput.focus();
    return;
  }
  try {
    new URL(url);
  } catch (err) {
    showStatus(subscriptionStatus, "That doesn't look like a valid URL.", false);
    return;
  }

  subscriptionSubmit.disabled = true;
  chrome.runtime.sendMessage({ type: "cbb-add-subscription", url }, (response) => {
    subscriptionSubmit.disabled = false;
    if (!response || !response.ok) {
      showStatus(subscriptionStatus, (response && response.error) || "Couldn't subscribe to that list.", false);
      return;
    }
    subscriptionInput.value = "";
    chrome.storage.local.get({ subscribedLists: [] }, (data) => {
      subscribedLists = Array.isArray(data.subscribedLists) ? data.subscribedLists : [];
      renderSubscriptionList();
      showStatus(
        subscriptionStatus,
        `Subscribed to "${response.list.name}" (${response.list.widgets.length} widgets).`,
        true
      );
    });
  });
});

// --- backup -------------------------------------------------------------

exportBtn.addEventListener("click", () => {
  chrome.storage.local.get(
    { enabled: true, siteAllowedWidgets: {}, trustedSites: [], customWidgets: [], subscribedLists: [] },
    (data) => {
      if (chrome.runtime.lastError || !data) {
        showStatus(backupStatus, "Couldn't read settings to export.", false);
        return;
      }
      const payload = {
        botblock: true,
        version: 1,
        exportedAt: new Date().toISOString(),
        enabled: data.enabled !== false,
        siteAllowedWidgets: data.siteAllowedWidgets || {},
        trustedSites: data.trustedSites || [],
        customWidgets: data.customWidgets || [],
        subscribedLists: data.subscribedLists || [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `botblock-settings-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus(backupStatus, "Settings exported.", true);
    }
  );
});

importBtn.addEventListener("click", () => importFile.click());

function sanitizeSiteAllowedWidgets(raw, knownKeys) {
  const cleaned = {};
  if (!raw || typeof raw !== "object") return cleaned;
  for (const [host, keys] of Object.entries(raw)) {
    if (typeof host !== "string" || !host || !Array.isArray(keys)) continue;
    // A "sub-*" key belongs to a subscribed list whose widgets haven't been
    // (re-)fetched yet at import time — trust the shape of the key itself
    // rather than dropping the exception; the subscription refresh
    // triggered right after import reconciles it against the real list.
    const filtered = [
      ...new Set(keys.filter((k) => typeof k === "string" && (knownKeys.has(k) || k.startsWith("sub-")))),
    ];
    if (filtered.length) cleaned[host] = filtered;
  }
  return cleaned;
}

function sanitizeTrustedSites(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((h) => typeof h === "string" && h).map((h) => h.toLowerCase()))].sort();
}

// Subscription *widgets* are never trusted from an import file — only the
// {url, name, enabled} triple survives, and a live refresh (triggered right
// after import) repopulates the real widget list from the actual URL. This
// keeps an imported settings file from being able to inject arbitrary
// widget rules without them ever having come from a real fetch.
function sanitizeSubscriptionEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const l of raw) {
    if (!l || typeof l !== "object" || typeof l.url !== "string" || !l.url) continue;
    let url;
    try {
      url = new URL(l.url).href;
    } catch (e) {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const name = typeof l.name === "string" && l.name.trim() ? l.name.trim() : "Untitled list";
    cleaned.push({
      url,
      name,
      enabled: l.enabled !== false,
      addedAt: typeof l.addedAt === "string" ? l.addedAt : new Date().toISOString(),
      lastFetchedAt: null,
      lastError: null,
      widgets: [],
    });
  }
  return cleaned;
}

function sanitizeCustomWidgets(raw) {
  if (!Array.isArray(raw)) return [];
  const seenKeys = new Set(BUILTIN_WIDGETS.map((w) => w.key));
  const cleaned = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const name = typeof w.name === "string" ? w.name.trim() : "";
    const tokens = Array.isArray(w.tokens) ? w.tokens.filter((t) => typeof t === "string" && t.trim()) : [];
    if (!name || !tokens.length) continue;
    const domains = Array.isArray(w.domains) ? w.domains.map(sanitizeDomain).filter(Boolean) : [];
    let key = typeof w.key === "string" && w.key.startsWith("custom-") ? w.key : `custom-${slugify(name) || "widget"}`;
    while (seenKeys.has(key)) key = `${key}-${Math.random().toString(36).slice(2, 6)}`;
    seenKeys.add(key);
    cleaned.push({ key, name, domains, tokens, custom: true });
  }
  return cleaned;
}

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (e) {
      showStatus(backupStatus, "That file isn't valid JSON.", false);
      return;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.botblock) {
      showStatus(backupStatus, "That doesn't look like a BotBlock settings file.", false);
      return;
    }

    const enabled = parsed.enabled !== false;
    const cleanedCustomWidgets = sanitizeCustomWidgets(parsed.customWidgets);
    const cleanedSubscribedLists = sanitizeSubscriptionEntries(parsed.subscribedLists);
    const knownKeys = new Set([...BUILTIN_WIDGETS.map((w) => w.key), ...cleanedCustomWidgets.map((w) => w.key)]);
    const cleanedSiteAllowedWidgets = sanitizeSiteAllowedWidgets(parsed.siteAllowedWidgets, knownKeys);
    const cleanedTrustedSites = sanitizeTrustedSites(parsed.trustedSites);

    chrome.storage.local.set(
      {
        enabled,
        siteAllowedWidgets: cleanedSiteAllowedWidgets,
        trustedSites: cleanedTrustedSites,
        customWidgets: cleanedCustomWidgets,
        subscribedLists: cleanedSubscribedLists,
      },
      () => {
        trustedSites = cleanedTrustedSites;
        customWidgets = cleanedCustomWidgets;
        subscribedLists = cleanedSubscribedLists;
        renderTrustedList();
        renderCustomList();
        renderSubscriptionList();
        showStatus(
          backupStatus,
          cleanedSubscribedLists.length
            ? "Settings imported, refreshing subscribed lists. Already-open tabs need a reload to fully apply blocking changes."
            : "Settings imported. Already-open tabs need a reload to fully apply blocking changes.",
          true
        );
        // Imported subscriptions carry no widgets (never trusted from a
        // file) — fetch each one now so they're populated immediately
        // instead of waiting for the next daily alarm.
        for (const list of cleanedSubscribedLists) {
          chrome.runtime.sendMessage({ type: "cbb-refresh-subscription", url: list.url }, () => {
            chrome.storage.local.get({ subscribedLists: [] }, (data) => {
              subscribedLists = Array.isArray(data.subscribedLists) ? data.subscribedLists : [];
              renderSubscriptionList();
            });
          });
        }
      }
    );
  };
  reader.onerror = () => showStatus(backupStatus, "Couldn't read that file.", false);
  reader.readAsText(file);
});

// --- init -----------------------------------------------------------------

chrome.storage.local.get({ trustedSites: [], customWidgets: [], subscribedLists: [] }, (data) => {
  trustedSites = Array.isArray(data && data.trustedSites) ? data.trustedSites : [];
  customWidgets = Array.isArray(data && data.customWidgets) ? data.customWidgets : [];
  subscribedLists = Array.isArray(data && data.subscribedLists) ? data.subscribedLists : [];
  renderTrustedList();
  renderCustomList();
  renderSubscriptionList();
});
