const optEnabled = document.getElementById("opt-enabled");
const optDisabled = document.getElementById("opt-disabled");
const domainEl = document.getElementById("current-domain");
const tabBadgeEl = document.getElementById("tab-count-badge");
const tabCountEl = document.getElementById("tab-count");
const blockedToggle = document.getElementById("blocked-toggle");
const blockedChevron = document.getElementById("blocked-chevron");
const blockedList = document.getElementById("blocked-list");
const widgetsCountEl = document.getElementById("widgets-count");
const reloadBanner = document.getElementById("reload-banner");
const reloadBannerText = document.getElementById("reload-banner-text");
const reloadBtn = document.getElementById("reload-btn");
const optionsBtn = document.getElementById("options-btn");
const trustedBadge = document.getElementById("trusted-badge");

// Extended with any custom rules the user added on the options page once
// storage loads — see the init flow below.
let WIDGETS = typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : [];

let currentHost = null;
let currentTabId = null;
let siteAllowedWidgets = {};
let allowedWidgets = new Set();
let detectedWidgetKeys = new Set();

// Only widgets actually blocked on this page (or already allowed here)
// are offered as toggles — the popup never lists the whole vendor catalog.
function relevantWidgets() {
  return WIDGETS.filter((w) => detectedWidgetKeys.has(w.key) || allowedWidgets.has(w.key));
}

function blockedWidgets() {
  return WIDGETS.filter((w) => detectedWidgetKeys.has(w.key) && !allowedWidgets.has(w.key));
}

function showReloadBanner(message) {
  reloadBannerText.textContent = message;
  reloadBanner.classList.remove("hidden");
}

function render(enabled) {
  optEnabled.classList.toggle("active", enabled);
  optDisabled.classList.toggle("active", !enabled);
}

function renderWidgetsCount() {
  const relevantCount = relevantWidgets().length;
  const allowedCount = allowedWidgets.size;
  widgetsCountEl.textContent = allowedCount > 0
    ? `${relevantCount} · ${allowedCount} allowed here`
    : `${relevantCount}`;
}

// Per-site: allowing a widget here only unblocks it on `currentHost`, and
// that exception is remembered for every future visit to this site.
function setWidgetAllowed(key, allowed) {
  if (allowed) allowedWidgets.add(key);
  else allowedWidgets.delete(key);

  if (!currentHost) return;
  const list = Array.from(allowedWidgets);
  if (list.length) siteAllowedWidgets[currentHost] = list;
  else delete siteAllowedWidgets[currentHost];

  chrome.storage.local.set({ siteAllowedWidgets });
  renderWidgetsCount();
  buildBlockedList();
  tabCountEl.textContent = String(blockedWidgets().length);

  // Allowing a widget lifts the network-level block, but any request it
  // already made while blocked is gone for good — the widget's script never
  // ran, so unhiding its (nonexistent) DOM does nothing until the page
  // reloads and the script gets a fresh chance to load.
  if (allowed) showReloadBanner("Reload the page for the allowed widget to load.");
}

// The dropdown lists every widget relevant to this page (currently blocked,
// or already allowed here) with its own toggle — this is the single place
// to review and flip a widget's state, instead of splitting a read-only
// blocked list and a separate interactive widgets list that showed mostly
// the same entries twice.
function buildBlockedList() {
  blockedList.innerHTML = "";
  const relevant = relevantWidgets();
  if (!relevant.length) {
    const empty = document.createElement("div");
    empty.className = "widgets-empty";
    empty.textContent = "No chat or AI widgets have been blocked on this page yet.";
    blockedList.appendChild(empty);
    return;
  }
  for (const widget of relevant) {
    const row = document.createElement("label");
    row.className = "widget-item";
    row.dataset.key = widget.key;

    const name = document.createElement("span");
    name.className = "widget-item-name";
    name.textContent = widget.name;

    const switchWrap = document.createElement("span");
    switchWrap.className = "mini-switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !allowedWidgets.has(widget.key);

    const slider = document.createElement("span");
    slider.className = "mini-slider";

    input.addEventListener("change", () => {
      const blocked = input.checked;
      row.classList.toggle("is-allowed", !blocked);
      setWidgetAllowed(widget.key, !blocked);
    });

    switchWrap.appendChild(input);
    switchWrap.appendChild(slider);
    row.appendChild(name);
    row.appendChild(switchWrap);
    row.classList.toggle("is-allowed", allowedWidgets.has(widget.key));
    blockedList.appendChild(row);
  }
}

blockedToggle.addEventListener("click", () => {
  const willExpand = blockedList.classList.contains("hidden");
  blockedList.classList.toggle("hidden", !willExpand);
  blockedChevron.classList.toggle("open", willExpand);
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

optEnabled.addEventListener("click", () => {
  if (optEnabled.classList.contains("active")) return;
  chrome.storage.local.set({ enabled: true });
  render(true);
  showReloadBanner("Reload the page to apply blocking here.");
});

optDisabled.addEventListener("click", () => {
  if (optDisabled.classList.contains("active")) return;
  chrome.storage.local.set({ enabled: false });
  render(false);
  showReloadBanner("Reload the page to unblock everything here.");
});

reloadBtn.addEventListener("click", () => {
  if (typeof currentTabId === "number") chrome.tabs.reload(currentTabId);
  reloadBanner.classList.add("hidden");
  window.close();
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) return;

  if (tab.url) {
    try {
      currentHost = new URL(tab.url).hostname || null;
      domainEl.textContent = currentHost || tab.url;
    } catch (e) {
      domainEl.textContent = tab.url;
    }
  } else {
    domainEl.textContent = "Unavailable";
  }

  chrome.storage.local.get(
    { enabled: true, siteAllowedWidgets: {}, trustedSites: [], customWidgets: [], subscribedLists: [] },
    (data) => {
      render(data.enabled !== false);
      const subWidgets = (data.subscribedLists || [])
        .filter((l) => l && l.enabled !== false && Array.isArray(l.widgets))
        .flatMap((l) => l.widgets);
      WIDGETS = [
        ...(typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : []),
        ...(data.customWidgets || []),
        ...subWidgets,
      ];
      siteAllowedWidgets = data.siteAllowedWidgets || {};
      const list = currentHost ? siteAllowedWidgets[currentHost] : null;
      allowedWidgets = new Set(Array.isArray(list) ? list : []);
      const trusted = currentHost ? (data.trustedSites || []).includes(currentHost) : false;
      trustedBadge.classList.toggle("hidden", !trusted);
      renderWidgetsCount();
      buildBlockedList();
    }
  );

  if (typeof tab.id !== "number") return;
  currentTabId = tab.id;
  chrome.runtime.sendMessage({ type: "cbb-get-tab-widgets", tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) return;
    const count = (response && response.count) || 0;
    detectedWidgetKeys = new Set(Array.isArray(response && response.detectedKeys) ? response.detectedKeys : []);
    tabCountEl.textContent = String(count);
    if (count > 0) {
      tabBadgeEl.textContent = `${count} blocked`;
      tabBadgeEl.classList.remove("hidden");
    }
    renderWidgetsCount();
    buildBlockedList();
  });
});
