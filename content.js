(() => {
  const IFRAME_TITLE_RE = /(chat|assistant|virtual agent|support bot)/i;

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // WIDGETS is rebuilt whenever custom rules load/change (see loadState() and
  // the cbb-site-state listener) so user-added rules take effect without a
  // page reload. Tokens are escaped — a custom rule is meant as a literal
  // substring match, not a hand-written regex fragment, and an unescaped
  // metacharacter (e.g. a stray ".") could silently match far more than
  // intended. "(?!)" never matches anything, so a rule with no tokens is
  // inert instead of (via RegExp("")) matching every element on the page.
  function buildWidgetList(customWidgets) {
    const merged = [...(typeof CBB_WIDGETS !== "undefined" ? CBB_WIDGETS : []), ...(customWidgets || [])];
    return merged.map((w) => ({
      ...w,
      tokenRegex: new RegExp((w.tokens || []).map(escapeRegExp).join("|") || "(?!)", "i"),
    }));
  }

  let WIDGETS = buildWidgetList([]);

  let enabled = true; // optimistic default to avoid a flash of visible widgets
  let trusted = false; // this site is fully trusted via the options page
  let allowedWidgets = new Set();
  let observer = null;

  function protectionActive() {
    return enabled && !trusted;
  }
  const hiddenState = new WeakMap(); // el -> widget key
  // Elements already classified as a widget's container, kept for the whole
  // page's lifetime (not just one sweep/mutation batch) — widgets often
  // build their DOM incrementally, appending an inner button or icon as a
  // *separate* later mutation. Without remembering the container across
  // calls, that later child gets independently matched against the catalog
  // (e.g. a generic "chat-bubble" class hits the generic-ai entry) and
  // hidden on its own, even though its allowed/shown ancestor covers it.
  const classifiedContainers = new Set();
  const detectedKeys = new Set(); // widget keys actually seen on this page load — the
  // single source of truth for "blocked" counts, computed in the background
  // worker as detected-minus-allowed and unioned across every frame on the
  // tab. Per-frame element counters were tried here before and double
  // counted vendors that render in multiple frames (a wrapper in the top
  // page plus the widget's own iframe document).

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
  }

  function restoreElement(el) {
    if (!hiddenState.has(el)) return;
    hiddenState.delete(el);
    el.removeAttribute("data-cbb-hidden");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("pointer-events");
  }

  // Classifies each element independently, but once an element matches a
  // widget it's treated as that widget's whole container: descendants —
  // including ones appended in later, separate mutations — are left alone
  // rather than re-matched against the catalog.
  function classifyElements(elements) {
    outer: for (const el of elements) {
      for (const container of classifiedContainers) {
        if (!container.isConnected) {
          classifiedContainers.delete(container);
          continue;
        }
        if (container !== el && container.contains(el)) continue outer;
      }
      const key = findWidgetKey(el);
      if (!key) continue;
      noteDetected(key);
      if (!protectionActive() || allowedWidgets.has(key)) {
        restoreElement(el);
      } else {
        hideElement(el, key);
      }
      classifiedContainers.add(el);
    }
  }

  function sweep() {
    // "body *" only selects descendants — it can never select <body> itself.
    // Some widgets (Intercom's messenger iframe, for one) key off an id/class
    // on the <body> tag directly. If that gets hidden early — the
    // MutationObserver runs synchronously with pessimistic defaults before
    // the async site-state lookup resolves — no later sweep can ever reach
    // it to undo that, since the selector structurally excludes it. It'd
    // stay hidden forever even after the widget is allowed.
    const elements = document.body
      ? [document.body, ...document.querySelectorAll("body *")]
      : document.querySelectorAll("body *");
    classifyElements(elements);
  }

  // Tells the background service worker which widgets have actually shown
  // up on this page, so the popup can offer allow toggles only for widgets
  // that are really blocked here instead of the whole vendor catalog.
  let detectTimer = null;
  function reportDetected() {
    if (detectTimer) return;
    detectTimer = setTimeout(() => {
      detectTimer = null;
      try {
        chrome.runtime.sendMessage({ type: "cbb-detected", keys: Array.from(detectedKeys) });
      } catch (e) {
        /* extension context may be gone during navigation */
      }
    }, 150);
  }

  function noteDetected(key) {
    if (detectedKeys.has(key)) return;
    detectedKeys.add(key);
    reportDetected();
  }

  function handleNode(node) {
    if (node.nodeType !== 1) return;
    const children = node.querySelectorAll ? node.querySelectorAll("*") : [];
    classifyElements([node, ...children]);
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!protectionActive()) return;
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
    if (protectionActive()) {
      root.classList.add("cbb-active");
    } else {
      root.classList.remove("cbb-active");
    }
    sweep();
  }

  // Site scoping (which hostname's exceptions/trust/custom rules apply)
  // lives in the background service worker, which always knows the tab's
  // top-level URL via sender.tab — even when this script is running inside
  // a cross-origin widget iframe that can't read window.top.location itself.
  function loadState(cb) {
    try {
      chrome.runtime.sendMessage({ type: "cbb-get-site-state" }, (response) => {
        if (chrome.runtime.lastError || !response) return cb();
        enabled = response.enabled !== false;
        trusted = !!response.trusted;
        allowedWidgets = new Set(Array.isArray(response.allowed) ? response.allowed : []);
        WIDGETS = buildWidgetList(response.customWidgets);
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
      trusted = !!message.trusted;
      allowedWidgets = new Set(Array.isArray(message.allowed) ? message.allowed : []);
      WIDGETS = buildWidgetList(message.customWidgets);
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
