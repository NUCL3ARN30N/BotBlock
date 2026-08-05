const optEnabled = document.getElementById("opt-enabled");
const optDisabled = document.getElementById("opt-disabled");
const protectionDesc = document.getElementById("protection-desc");
const domainEl = document.getElementById("current-domain");
const tabBadgeEl = document.getElementById("tab-count-badge");
const tabCountEl = document.getElementById("tab-count");
const widgetsToggle = document.getElementById("widgets-toggle");
const widgetsChevron = document.getElementById("widgets-chevron");
const widgetsList = document.getElementById("widgets-list");
const widgetsCountEl = document.getElementById("widgets-count");
const widgetsDescEl = document.getElementById("widgets-desc");

const WIDGETS = typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : [];

let currentHost = null;
let siteAllowedWidgets = {};
let allowedWidgets = new Set();

function render(enabled) {
  optEnabled.classList.toggle("active", enabled);
  optDisabled.classList.toggle("active", !enabled);
  protectionDesc.textContent = enabled
    ? "Blocking chat widgets and embedded AI assistants on every site."
    : "Protection is off — chat widgets are allowed on every site.";
}

function renderWidgetsCount() {
  const allowedCount = allowedWidgets.size;
  widgetsCountEl.textContent = allowedCount > 0
    ? `${WIDGETS.length} · ${allowedCount} allowed here`
    : `${WIDGETS.length}`;
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
}

function buildWidgetsList() {
  widgetsList.innerHTML = "";
  for (const widget of WIDGETS) {
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
    widgetsList.appendChild(row);
  }
}

widgetsToggle.addEventListener("click", () => {
  const willExpand = widgetsList.classList.contains("hidden");
  widgetsList.classList.toggle("hidden", !willExpand);
  widgetsChevron.classList.toggle("open", willExpand);
});

optEnabled.addEventListener("click", () => {
  chrome.storage.local.set({ enabled: true });
  render(true);
});

optDisabled.addEventListener("click", () => {
  chrome.storage.local.set({ enabled: false });
  render(false);
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

  if (currentHost) {
    widgetsDescEl.textContent = `Allow an individual widget on ${currentHost} without turning off protection everywhere else. Choices are remembered for future visits.`;
  }

  chrome.storage.local.get({ enabled: true, siteAllowedWidgets: {} }, (data) => {
    render(data.enabled !== false);
    siteAllowedWidgets = data.siteAllowedWidgets || {};
    const list = currentHost ? siteAllowedWidgets[currentHost] : null;
    allowedWidgets = new Set(Array.isArray(list) ? list : []);
    renderWidgetsCount();
    buildWidgetsList();
  });

  if (typeof tab.id !== "number") return;
  chrome.runtime.sendMessage({ type: "cbb-get-tab-count", tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) return;
    const count = (response && response.count) || 0;
    tabCountEl.textContent = String(count);
    if (count > 0) {
      tabBadgeEl.textContent = `${count} blocked`;
      tabBadgeEl.classList.remove("hidden");
    }
  });
});
