(() => {
  const IFRAME_TITLE_RE = /(chat|assistant|virtual agent|support bot)/i;

  const WIDGETS = (typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : []).map((w) => ({
    ...w,
    tokenRegex: new RegExp(w.tokens.join("|"), "i"),
  }));

  let enabled = true; // optimistic default to avoid a flash of visible widgets
  let allowedWidgets = new Set();
  let blockedCount = 0;
  let observer = null;
  const hiddenState = new WeakMap(); // el -> widget key

  const root = document.documentElement;
  if (root) root.classList.add("cbb-active");

  function findWidgetKey(el) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const id = typeof el.id === "string" ? el.id : "";
    const cls = typeof el.className === "string" ? el.className : "";
    const isIframe = tag === "iframe";
    const src = isIframe ? el.getAttribute("src") || "" : "";
    const title = isIframe ? el.getAttribute("title") || "" : "";

    for (const w of WIDGETS) {
      if (w.tokenRegex.test(tag) || w.tokenRegex.test(id) || w.tokenRegex.test(cls)) return w.key;
      if (src) {
        if (w.tokenRegex.test(src)) return w.key;
        if (w.domains && w.domains.some((d) => src.includes(d))) return w.key;
      }
    }
    if (isIframe && title && IFRAME_TITLE_RE.test(title)) return "generic-ai";
    return null;
  }

  function hideElement(el, key) {
    if (allowedWidgets.has(key)) return;
    if (hiddenState.has(el)) return;
    hiddenState.set(el, key);
    el.setAttribute("data-cbb-hidden", key);
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    blockedCount++;
    reportBlocked();
  }

  function restoreElement(el) {
    if (!hiddenState.has(el)) return;
    hiddenState.delete(el);
    el.removeAttribute("data-cbb-hidden");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("pointer-events");
  }

  function sweep() {
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const key = findWidgetKey(el);
      if (!key) continue;
      if (!enabled || allowedWidgets.has(key)) {
        restoreElement(el);
      } else {
        hideElement(el, key);
      }
    }
  }

  let reportTimer = null;
  function reportBlocked() {
    if (reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      try {
        chrome.runtime.sendMessage({ type: "cbb-blocked", count: blockedCount });
      } catch (e) {
        /* extension context may be gone during navigation */
      }
      blockedCount = 0;
    }, 150);
  }

  function handleNode(node) {
    const key = findWidgetKey(node);
    if (key && enabled && !allowedWidgets.has(key)) hideElement(node, key);
    const children = node.querySelectorAll ? node.querySelectorAll("*") : [];
    for (const child of children) {
      const childKey = findWidgetKey(child);
      if (childKey && enabled && !allowedWidgets.has(childKey)) hideElement(child, childKey);
    }
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          handleNode(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function applyState() {
    if (!root) return;
    if (enabled) {
      root.classList.add("cbb-active");
    } else {
      root.classList.remove("cbb-active");
    }
    sweep();
  }

  // Site scoping (which hostname's exceptions apply) lives in the
  // background service worker, which always knows the tab's top-level URL
  // via sender.tab — even when this script is running inside a
  // cross-origin widget iframe that can't read window.top.location itself.
  function loadState(cb) {
    try {
      chrome.runtime.sendMessage({ type: "cbb-get-site-state" }, (response) => {
        if (chrome.runtime.lastError || !response) return cb();
        enabled = response.enabled !== false;
        allowedWidgets = new Set(Array.isArray(response.allowed) ? response.allowed : []);
        cb();
      });
    } catch (e) {
      cb();
    }
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== "cbb-site-state") return;
      enabled = message.enabled !== false;
      allowedWidgets = new Set(Array.isArray(message.allowed) ? message.allowed : []);
      applyState();
    });
  } catch (e) {
    /* runtime API unavailable */
  }

  if (document.documentElement) {
    startObserving();
  }

  function init() {
    loadState(applyState);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
