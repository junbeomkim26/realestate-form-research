/**
 * 필드로그 (FieldLog) — 폼 화면의 구조, 실제 조작 순서, 조작 전후 상태를 기록한다.
 *
 * [확장] 툴바 아이콘에서 시작/정지한다. 페이지와 iframe별 기록은 storage에 누적된다.
 * [콘솔] 이 파일을 붙여넣으면 시작한다. 상태("라벨")로 중간 상태, 끝()으로 JSON을 저장한다.
 *
 * ⚠ 등록/저장 버튼은 누르지 말 것 (실매물이 등록될 수 있다).
 */
(() => {
  "use strict";

  const EXT = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id && chrome.storage);
  const CONTROL_STORAGE = EXT ? (chrome.storage.session || chrome.storage.local) : null;
  const CONTROL_AREA = EXT && chrome.storage.session ? "session" : "local";
  // URL은 탭과 iframe을 구별하지 못한다. 이 문서 컨텍스트에만 붙는 ID를 한 번 만들고,
  // 값 가림 모드까지 키에 넣어 같은 URL의 기록끼리 서로 덮어쓰지 않게 한다.
  const CAPTURE_ID = (() => {
    let id = "";
    try { if (crypto && typeof crypto.randomUUID === "function") id = crypto.randomUUID(); } catch (_) {}
    if (!id) id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return id;
  })();
  const storageKeyFor = (mask) => `p:${CAPTURE_ID}:${mask ? "masked" : "plain"}`;
  const FIELD_KEY_CACHE_BY_MODE = { plain: new WeakMap(), masked: new WeakMap() };

  if (window.__flLoaded) return;
  window.__flLoaded = true;

  const FIELD_SELECTOR = [
    "input", "select", "textarea", "[contenteditable]",
    "[role=combobox]", "[role=radio]", "[role=checkbox]", "[role=switch]",
    "[role=textbox]", "[role=listbox]", "[role=option]",
  ].join(",");
  const CLICK_SELECTOR = [
    "button", "label", "[role=button]", "[role=option]", "[role=tab]",
    "[role=radio]", "[role=checkbox]", "[role=switch]", "[role=combobox]", "a[href]",
  ].join(",");
  const OVERLAY_SELECTOR = [
    ".rdp", "[class*=calendar i]", "[class*=datepicker i]", "[class*=picker i]",
    "[role=dialog]", "[aria-modal=true]", "[role=listbox]", "[role=menu]",
  ].join(",");
  const INTERACTION_TYPES = [
    "pointerdown", "mousedown", "mouseup", "click", "focusin", "focusout",
    "beforeinput", "input", "change", "keydown", "keyup",
    "compositionstart", "compositionupdate", "compositionend",
  ];
  const EVENT_LIMIT = 4000;
  const MUTATION_LIMIT = 2500;
  const STATE_LIMIT = 120;
  const DOM_HTML_LIMIT = 500000;
  const SHADOW_HTML_LIMIT = 160000;
  const CONTEXT_HTML_LIMIT = 24000;
  const OVERLAY_HTML_LIMIT = 50000;
  const MASKED = "[가림]";
  const SENSITIVE_RE = /(password|passwd|pwd|secret|token|csrf|resident|ssn|owner|phone|mobile|contact|email|account|bank|license|registration|대표|소유|성명|이름|전화|연락|이메일|계좌|주민|사업자)/i;

  function createRecorder(opts) {
    const MASK = !!(opts && opts.mask);
    const PAGE_KEY = storageKeyFor(MASK);
    const SUMMARY_KEY = PAGE_KEY.replace(/^p:/, "i:");
    const offeredPrior = (opts && opts.prior) || null;
    // 구버전 비마스킹 기록은 어느 문자열이 실제 입력값인지 판별할 수 없다.
    // 마스킹 설정이 바뀐 세션끼리는 합치지 않아 과거 값이 새 export에 섞이지 않게 한다.
    const prior = offeredPrior && offeredPrior.meta &&
      offeredPrior.meta.captureId === CAPTURE_ID && offeredPrior.meta.storageKey === PAGE_KEY &&
      !!offeredPrior.meta.maskValues === MASK ? offeredPrior : null;
    const t0 = Date.now();
    const base = prior && typeof prior.meta === "object" ? (prior.meta.durationSec || 0) * 1000 : 0;
    const now = () => base + (Date.now() - t0);

    let stopped = false;
    let saveTimer = null;
    let saving = false;
    let savePending = false;
    let savePendingForce = false;
    let saveCallbacks = [];
    let mutationTimer = null;
    let mo = null;
    let box = null;
    let lastAction = null;
    let stateSerial = 0;
    let initialState = null;

    const REC = prior || {
      meta: {}, fields: {}, clickables: {}, actions: [], timeline: [],
      interactionEvents: [], interactionEventsDropped: 0,
      mutations: [], mutationsDropped: 0,
      states: [], statesDropped: 0,
    };
    REC.fields = REC.fields || {};
    REC.clickables = REC.clickables || {};
    REC.actions = REC.actions || [];
    REC.timeline = REC.timeline || [];
    REC.interactionEvents = REC.interactionEvents || [];
    REC.interactionEventsDropped = REC.interactionEventsDropped || 0;
    REC.mutations = REC.mutations || [];
    REC.mutationsDropped = REC.mutationsDropped || 0;
    REC.states = REC.states || [];
    REC.statesDropped = REC.statesDropped || 0;
    stateSerial = REC.states.length;
    REC.meta = Object.assign({}, REC.meta, {
      schemaVersion: 2,
      captureId: CAPTURE_ID,
      storageKey: PAGE_KEY,
      summaryKey: SUMMARY_KEY,
      url: location.href,
      host: location.hostname,
      title: document.title,
      frame: window.top === window ? "(top)" : "(iframe)",
      maskValues: MASK,
      ua: navigator.userAgent,
      limits: {
        interactionEvents: EVENT_LIMIT, mutations: MUTATION_LIMIT, states: STATE_LIMIT,
        domHtmlChars: DOM_HTML_LIMIT, shadowHtmlChars: SHADOW_HTML_LIMIT,
      },
    });
    if (Number.isInteger(opts && opts.frameId) && opts.frameId >= 0) REC.meta.chromeFrameId = opts.frameId;
    if (opts && typeof opts.documentId === "string" && opts.documentId) REC.meta.chromeDocumentId = opts.documentId;
    if (offeredPrior && !prior) REC.meta.priorDiscardedDueToMaskChange = true;
    if (!REC.meta.startedAt) REC.meta.startedAt = new Date().toISOString();
    REC.meta.sessions = (REC.meta.sessions || 0) + 1;
    delete REC.meta.endedAt;

    const cssEscape = (v) => {
      if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(v));
      return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
    };
    const attrQuote = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const cleanText = (v, max = 80) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
    const txt = (el, max = 80) => {
      try { return cleanText(el && (el.innerText || el.textContent || ""), max); }
      catch (_) { return ""; }
    };
    const isStableId = (id) => !!id && !/^:r[0-9a-z]+:$/i.test(id);
    const isElement = (n) => !!n && n.nodeType === 1;
    const isShadowRoot = (n) => !!n && n.nodeType === 11 && !!n.host;
    const isChoice = (el) => {
      const type = String(el.getAttribute("type") || "").toLowerCase();
      const role = String(el.getAttribute("role") || "").toLowerCase();
      return type === "radio" || type === "checkbox" || role === "radio" || role === "checkbox" || role === "switch";
    };
    const isControl = (el) => !!(isElement(el) && el.matches && el.matches(FIELD_SELECTOR) &&
      !(el.hasAttribute("contenteditable") && String(el.getAttribute("contenteditable")).toLowerCase() === "false"));
    const isRecorderUI = (node) => {
      const el = isElement(node) ? node : node && node.parentElement;
      return !!(el && el.closest && el.closest("[data-fieldlog-ui]"));
    };

    function sensitiveElement(el) {
      if (!isElement(el)) return false;
      const type = String(el.getAttribute("type") || "").toLowerCase();
      if (type === "password" || type === "hidden") return true;
      const hint = ["name", "id", "placeholder", "autocomplete", "aria-label"]
        .map((a) => el.getAttribute(a) || "").join(" ");
      return SENSITIVE_RE.test(hint);
    }

    function safeValue(el, value) {
      const s = value == null ? "" : String(value);
      return (MASK || sensitiveElement(el)) && s !== "" ? MASKED : s;
    }

    function textCarriesValue(el) {
      if (!isElement(el)) return false;
      const role = String(el.getAttribute("role") || "").toLowerCase();
      return !!(el.tagName === "TEXTAREA" || el.isContentEditable || role === "textbox" || role === "combobox");
    }

    function safeText(el, value) {
      const fallback = cleanText(value, 500);
      if (!isElement(el)) return fallback;

      // 부모 row/dialog의 textContent에도 편집 칸의 값이 섞인다. 값 노드만 [가림]으로
      // 바꾸며 내려가서 라벨·버튼·옵션 같은 구조적 문구는 그대로 보존한다.
      function structural(node) {
        if (!node) return "";
        if (node.nodeType === 3) return node.nodeValue || "";
        if (!isElement(node) || isRecorderUI(node)) return "";
        const hide = sensitiveElement(node) || (MASK && textCarriesValue(node));
        if (hide) return txt(node, 2000) ? ` ${MASKED} ` : "";
        let out = "";
        for (const child of node.childNodes) out += structural(child);
        return out;
      }

      if (sensitiveElement(el) || (MASK && textCarriesValue(el))) return fallback ? MASKED : "";
      if (!MASK && !rootQuery(el, "*").some(sensitiveElement)) return fallback;
      return cleanText(structural(el), 500);
    }

    function segmentOf(el) {
      const tag = el.tagName.toLowerCase();
      if (isStableId(el.id)) return `${tag}#${cssEscape(el.id)}`;
      const parent = el.parentElement;
      const i = parent ? [...parent.children].indexOf(el) + 1 : 1;
      return `${tag}:nth-child(${i})`;
    }

    function pathOf(el) {
      if (!isElement(el)) return "";
      const reverse = [];
      let e = el;
      let depth = 0;
      while (isElement(e) && depth++ < 24) {
        reverse.push(segmentOf(e));
        if (e.parentElement) { e = e.parentElement; continue; }
        const root = e.getRootNode && e.getRootNode();
        if (isShadowRoot(root)) { reverse.push(">>>"); e = root.host; }
        else break;
      }
      const tokens = reverse.reverse();
      let out = "";
      for (const token of tokens) {
        if (token === ">>>") out += " >>> ";
        else { if (out && !out.endsWith(" ")) out += ">"; out += token; }
      }
      return out;
    }

    function groupKeyOf(el) {
      const n = el.getAttribute("name");
      if (!n) return null;
      const form = el.form || (el.closest && el.closest("form"));
      const formPart = form ? (isStableId(form.id) ? `form:${form.id}` : `formPath:${pathOf(form)}`) : "noForm";
      const root = el.getRootNode && el.getRootNode();
      const rootPart = isShadowRoot(root) ? `shadow:${pathOf(root.host)}` : "document";
      return `${rootPart}|${formPart}|name:${n}`;
    }

    // 녹화를 껐다 켜도 같은 문서·같은 모드의 익명 컨트롤 키는 유지한다.
    const fieldKeyCache = FIELD_KEY_CACHE_BY_MODE[MASK ? "masked" : "plain"];

    function duplicateGeneralName(el, name) {
      let count = 0;
      for (const candidate of deepQueryAll(FIELD_SELECTOR)) {
        if (!isControl(candidate) || isChoice(candidate) || candidate.getAttribute("name") !== name) continue;
        count++;
        if (count > 1) return true;
      }
      return false;
    }

    function choiceBaseKey(el, name) {
      if (isStableId(el.id)) return `name:${name}|id:${el.id}`;
      const value = el.getAttribute("value");
      if (value != null && value !== "" && !sensitiveElement(el)) return `name:${name}|value:${value}`;
      return `name:${name}|path:${pathOf(el)}`;
    }

    function disambiguateChoiceKey(el, base) {
      const matches = deepQueryAll(FIELD_SELECTOR).filter((candidate) =>
        isControl(candidate) && isChoice(candidate) && candidate.getAttribute("name") === el.getAttribute("name") &&
        choiceBaseKey(candidate, candidate.getAttribute("name")) === base);
      if (matches.length <= 1) return base;
      const group = groupKeyOf(el);
      const sameGroup = matches.filter((candidate) => groupKeyOf(candidate) === group);
      return `${base}|group:${group}${sameGroup.length > 1 ? `|path:${pathOf(el)}` : ""}`;
    }

    function keyOf(el) {
      const cached = fieldKeyCache.get(el);
      if (cached) return cached;
      const n = el.getAttribute("name");
      let key = "";
      if (isChoice(el) && n) {
        key = disambiguateChoiceKey(el, choiceBaseKey(el, n));
      } else if (n) {
        // 하나뿐인 기존 name 키는 호환하고, 중복 name만 경로를 붙여 충돌을 없앤다.
        key = duplicateGeneralName(el, n) ? `name:${n}|path:${pathOf(el)}` : `name:${n}`;
      } else if (isStableId(el.id)) key = `id:${el.id}`;
      else {
        const ph = el.getAttribute("placeholder");
        if (ph) key = `ph:${el.tagName.toLowerCase()}:${ph}`;
        else if (textCarriesValue(el) || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || "value" in el) {
          // 편집 결과인 text/value를 키로 쓰면 입력 순간 다른 필드가 된다. 최초 경로를 고정한다.
          key = `path:${pathOf(el)}`;
        } else {
          const t = txt(el);
          key = t && !MASK && !sensitiveElement(el) ? `text:${el.tagName.toLowerCase()}:${t}` : `path:${pathOf(el)}`;
        }
      }
      fieldKeyCache.set(el, key);
      return key;
    }

    function rootQuery(root, selector) {
      try { return [...root.querySelectorAll(selector)]; }
      catch (_) { return []; }
    }

    function collectShadowRoots(root = document, out = []) {
      for (const el of rootQuery(root, "*")) {
        if (el.shadowRoot && el.shadowRoot.mode === "open") {
          out.push(el.shadowRoot);
          collectShadowRoots(el.shadowRoot, out);
        }
      }
      return out;
    }

    function deepQueryAll(selector, root = document) {
      const out = rootQuery(root, selector);
      for (const shadow of collectShadowRoots(root)) {
        observeRoot(shadow);
        out.push(...rootQuery(shadow, selector));
      }
      return [...new Set(out)].filter((el) => !isRecorderUI(el));
    }

    function closestControl(el) {
      let e = el;
      for (let i = 0; isElement(e) && i < 16; i++) {
        if (isControl(e)) return e;
        if (e.parentElement) e = e.parentElement;
        else {
          const root = e.getRootNode && e.getRootNode();
          e = isShadowRoot(root) ? root.host : null;
        }
      }
      return null;
    }

    const ATTRS = [
      "name", "id", "type", "placeholder", "class", "role", "aria-label", "for",
      "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-expanded",
      "aria-haspopup", "aria-checked", "aria-selected", "aria-disabled", "autocomplete",
      "tabindex", "contenteditable", "form", "inputmode", "pattern", "maxlength", "minlength",
      "min", "max", "step", "readonly", "disabled", "required", "multiple", "accept", "onclick",
    ];

    function safeAttr(el, name, value) {
      if (value == null) return value;
      if ((name === "value" || name === "aria-valuetext" || name === "aria-valuenow") && (MASK || sensitiveElement(el))) {
        return value === "" ? "" : MASKED;
      }
      if (MASK && name.startsWith("data-") && !/^(data-testid|data-test|data-cy|data-qa)$/i.test(name)) return value === "" ? "" : MASKED;
      return String(value);
    }

    function attrsOf(el) {
      const o = {};
      for (const a of ATTRS) {
        if (el.hasAttribute(a)) o[a] = safeAttr(el, a, el.getAttribute(a)).slice(0, 400);
      }
      for (const { name, value } of [...el.attributes]) {
        if (!name.startsWith("data-")) continue;
        const keepLocator = /^(data-testid|data-test|data-cy|data-qa)$/i.test(name);
        o[name] = ((MASK && !keepLocator) || (!keepLocator && sensitiveElement(el))) ? MASKED : String(value).slice(0, 200);
      }
      return o;
    }

    function labelsOf(el) {
      const found = [];
      const add = (node, source) => {
        if (!isElement(node)) return;
        const text = safeText(node, txt(node, 160));
        if (!text) return;
        const item = { text, source, path: pathOf(node) };
        if (!found.some((x) => x.text === item.text && x.path === item.path)) found.push(item);
      };
      try { for (const l of [...(el.labels || [])]) add(l, "labels"); } catch (_) {}
      const root = el.getRootNode ? el.getRootNode() : document;
      if (el.id) {
        try { add(root.querySelector(`label[for="${attrQuote(el.id)}"]`), "for"); } catch (_) {}
      }
      const wrap = el.closest && el.closest("label");
      if (wrap) add(wrap, "wrapper");
      const ids = `${el.getAttribute("aria-labelledby") || ""} ${el.getAttribute("aria-describedby") || ""}`.trim().split(/\s+/).filter(Boolean);
      for (const id of ids) {
        let node = null;
        try { node = typeof root.getElementById === "function" ? root.getElementById(id) : root.querySelector(`#${cssEscape(id)}`); }
        catch (_) {}
        add(node, "aria");
      }
      return found;
    }

    function guessLabel(el) {
      const linked = labelsOf(el);
      if (linked.length) return linked[0].text;
      let p = el.parentElement;
      for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
        for (const c of rootQuery(p, "label, th, p, span, div, h1, h2, h3, h4, legend")) {
          if (c.contains(el)) continue;
          const t = safeText(c, txt(c));
          if (t && t.length <= 25 && !/^\d+$/.test(t)) return t;
        }
      }
      return "";
    }

    function locatorCandidates(el) {
      const c = [];
      const add = (kind, selector, score) => {
        if (selector && !c.some((x) => x.selector === selector)) c.push({ kind, selector, score });
      };
      if (isStableId(el.id)) add("id", `#${cssEscape(el.id)}`, 100);
      for (const a of ["data-testid", "data-test", "data-cy", "data-qa"]) {
        if (el.hasAttribute(a)) add(a, `[${a}="${attrQuote(el.getAttribute(a))}"]`, 95);
      }
      const tag = el.tagName.toLowerCase();
      const name = el.getAttribute("name");
      if (name) {
        const value = isChoice(el) && el.getAttribute("value") != null && !sensitiveElement(el) ? `[value="${attrQuote(el.getAttribute("value"))}"]` : "";
        add("name", `${tag}[name="${attrQuote(name)}"]${value}`, isChoice(el) ? 92 : 90);
      }
      const role = el.getAttribute("role");
      const aria = el.getAttribute("aria-label");
      if (role && aria) add("role+aria", `[role="${attrQuote(role)}"][aria-label="${attrQuote(aria)}"]`, 85);
      const ph = el.getAttribute("placeholder");
      if (ph) add("placeholder", `${tag}[placeholder="${attrQuote(ph)}"]`, 70);
      for (const label of labelsOf(el).slice(0, 3)) c.push({ kind: "label", text: label.text, path: label.path, score: 75 });
      add("path", pathOf(el), 20);
      return c;
    }

    function visible(el) {
      if (!isElement(el)) return false;
      try {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && cs.visibility !== "collapse" &&
          Number(cs.opacity || 1) !== 0 && r.width > 0 && r.height > 0;
      } catch (_) { return el.offsetParent !== null; }
    }

    function deepElementFromPoint(x, y) {
      let el = null;
      try { el = document.elementFromPoint(x, y); } catch (_) {}
      for (let i = 0; isElement(el) && el.shadowRoot && i < 8; i++) {
        let inner = null;
        try { inner = el.shadowRoot.elementFromPoint(x, y); } catch (_) {}
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    }

    function deepActiveElement() {
      let el = document.activeElement;
      for (let i = 0; isElement(el) && el.shadowRoot && el.shadowRoot.activeElement && i < 8; i++) el = el.shadowRoot.activeElement;
      return isElement(el) ? el : null;
    }

    function runtimeOf(el, detailed = true) {
      const out = {};
      let raw = "";
      if (["SELECT", "TEXTAREA", "INPUT"].includes(el.tagName)) raw = String(el.value || "");
      else if (el.isContentEditable || ["textbox", "combobox"].includes(el.getAttribute("role"))) raw = txt(el, 500);
      if (raw !== "" || "value" in el || el.isContentEditable) out.value = safeValue(el, raw);
      if ("checked" in el || ["radio", "checkbox", "switch"].includes(el.getAttribute("role"))) {
        const checked = "checked" in el ? !!el.checked : el.getAttribute("aria-checked");
        out.checked = checked;
      }
      if (el.tagName === "SELECT") {
        out.selectedIndex = el.selectedIndex;
        out.selected = [...el.selectedOptions].map((o) => ({
          index: o.index,
          value: sensitiveElement(el) ? MASKED : o.value,
          text: cleanText(o.text, 120),
        }));
      } else if (el.tagName === "OPTION" || el.getAttribute("role") === "option") {
        const selected = "selected" in el ? !!el.selected : el.getAttribute("aria-selected");
        out.selected = selected;
      }
      out.disabled = !!(el.disabled || el.getAttribute("aria-disabled") === "true");
      out.readOnly = !!el.readOnly;
      out.focused = deepActiveElement() === el;
      if (el.validity) {
        const v = el.validity;
        out.validity = {
          valid: v.valid, valueMissing: v.valueMissing, typeMismatch: v.typeMismatch,
          patternMismatch: v.patternMismatch, tooLong: v.tooLong, tooShort: v.tooShort,
          rangeUnderflow: v.rangeUnderflow, rangeOverflow: v.rangeOverflow,
          stepMismatch: v.stepMismatch, badInput: v.badInput, customError: v.customError,
        };
      }
      if (detailed) {
        try {
          const cs = getComputedStyle(el);
          out.computedStyle = {
            display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
            pointerEvents: cs.pointerEvents, position: cs.position, zIndex: cs.zIndex,
          };
        } catch (_) {}
        try {
          const r = el.getBoundingClientRect();
          const n = (x) => Math.round(Number(x || 0) * 100) / 100;
          out.rect = { x: n(r.x), y: n(r.y), top: n(r.top), left: n(r.left), right: n(r.right), bottom: n(r.bottom), width: n(r.width), height: n(r.height) };
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          if (r.width > 0 && r.height > 0 && cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
            const hit = deepElementFromPoint(cx, cy);
            out.hitTest = { target: hit ? describe(hit) : null, path: hit ? pathOf(hit) : null, reachesTarget: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))) };
          }
        } catch (_) {}
      }
      return out;
    }

    function actualValue(el) {
      if (!el) return "";
      if ("checked" in el && (el.type === "checkbox" || el.type === "radio")) return String(!!el.checked);
      if (el.isContentEditable || ["textbox", "combobox"].includes(el.getAttribute("role"))) return txt(el, 2000);
      if ("value" in el) return String(el.value || "");
      if (["radio", "checkbox", "switch"].includes(el.getAttribute("role"))) return String(el.getAttribute("aria-checked") || "false");
      if (el.getAttribute("role") === "option") return String(el.getAttribute("aria-selected") || "false");
      return "";
    }

    function describe(el) {
      if (!isElement(el)) return "(?)";
      const n = el.getAttribute("name") || el.id || el.getAttribute("role") || "";
      const t = safeText(el, txt(el));
      return `${el.tagName.toLowerCase()}${n ? `[${n}]` : ""}${t ? ` "${t.slice(0, 30)}"` : ""}`;
    }

    function verdict(rec) {
      const a = rec.attrs || {};
      const bits = [];
      if (rec.tag === "select" || a.role === "listbox" || a.role === "combobox") bits.push(`목록에서 고르기 (옵션 ${(rec.options || []).length}개)`);
      else if (a.type === "checkbox" || a.role === "checkbox" || a.role === "switch") bits.push("체크박스 (켜기/끄기)");
      else if (a.type === "radio" || a.role === "radio") bits.push(`택1 라디오${rec.groupKey ? ` (그룹 ${rec.groupKey})` : ""}`);
      else if (a.type === "file") bits.push("파일 업로드");
      else if (rec.opens === "캘린더") bits.push("캘린더 — 직접 타이핑 말고 달력에서 날짜 클릭");
      else if (rec.opens === "자동완성" || rec.opens === "드롭다운") bits.push(`${rec.opens} — 입력 후 목록에서 선택해야 확정됨`);
      else {
        const numish = a.type === "number" || /numeric|decimal|tel/.test(a.inputmode || "");
        const dateHint = /\d{4}[-.]?\d{2}[-.]?\d{2}|YYYY|20210720|년.*월.*일/.test(`${a.placeholder || ""}`);
        if (dateHint) bits.push(`날짜 (형식 힌트: "${a.placeholder}")`);
        else if (numish) bits.push(/decimal/.test(a.inputmode || "") ? "숫자 (소수 허용)" : "숫자");
        else bits.push(a.contenteditable !== undefined || a.role === "textbox" ? "편집 가능한 텍스트" : "자유 텍스트");
      }
      if (a.readonly !== undefined) bits.push("readonly (타이핑 불가)");
      if (a.disabled !== undefined || a["aria-disabled"] === "true") bits.push("초기 disabled");
      if (a.maxlength) bits.push(`최대 ${a.maxlength}자`);
      if (a.required !== undefined) bits.push("필수");
      if (rec.reformatted) bits.push(`입력 후 자동변환: "${rec.reformatted.from}" → "${rec.reformatted.to}"`);
      if (rec.rejected) bits.push("입력이 거부됨(비워짐)");
      if (rec.sideEffects && rec.sideEffects.length) bits.push(`이 칸을 채우면 자동으로 바뀌는 칸: ${rec.sideEffects.map((s) => s.key).join(", ")}`);
      return bits.join(" · ");
    }

    function optionsOf(el) {
      const optionRecord = (o) => ({
        text: safeText(o, o.text || txt(o, 160)),
        value: sensitiveElement(el) ? MASKED : String(o.value != null ? o.value : (o.getAttribute("data-value") || "")),
        disabled: !!(o.disabled || o.getAttribute("aria-disabled") === "true"),
      });
      if (el.tagName === "SELECT") return [...el.options].map(optionRecord);
      const ids = `${el.getAttribute("aria-controls") || ""} ${el.getAttribute("aria-owns") || ""}`.trim().split(/\s+/).filter(Boolean);
      const roots = [];
      for (const id of ids) {
        const root = el.getRootNode ? el.getRootNode() : document;
        let target = null;
        try { target = typeof root.getElementById === "function" ? root.getElementById(id) : root.querySelector(`#${cssEscape(id)}`); } catch (_) {}
        if (!target) { try { target = document.getElementById(id); } catch (_) {} }
        if (target) roots.push(target);
      }
      if (el.getAttribute("role") === "listbox") roots.push(el);
      const options = [];
      for (const root of roots) for (const o of rootQuery(root, "[role=option], option")) options.push(optionRecord(o));
      return options;
    }

    const fieldStates = new Map();
    const currentElements = new Map();

    function eachField(fn) {
      for (const el of deepQueryAll(FIELD_SELECTOR)) if (isControl(el)) fn(el, keyOf(el));
    }

    function addTransition(rec, type, detail) {
      rec.transitions = rec.transitions || [];
      const item = Object.assign({ t: now(), type, afterAction: lastAction }, detail || {});
      rec.transitions.push(item);
      return item;
    }

    function sweep(reason) {
      if (stopped) return;
      discoverShadowRoots();
      const added = [], changed = [], seen = new Map();
      currentElements.clear();
      eachField((el, k) => {
        const vis = visible(el), label = guessLabel(el), linkedLabels = labelsOf(el), previous = fieldStates.get(k);
        let rec = REC.fields[k];
        if (!rec) {
          rec = REC.fields[k] = {
            key: k, groupKey: isChoice(el) ? groupKeyOf(el) : null,
            legacyName: el.getAttribute("name") || null,
            tag: el.tagName.toLowerCase(), attrs: attrsOf(el), labels: label ? [label] : [],
            linkedLabels, locatorCandidates: locatorCandidates(el), options: [], everVisible: vis,
            firstSeen: now(), firstSeenAfter: lastAction, path: pathOf(el), observations: [], runtime: runtimeOf(el),
          };
          addTransition(rec, "added", { visible: vis });
          added.push(k);
        } else {
          rec.labels = rec.labels || [];
          rec.linkedLabels = rec.linkedLabels || [];
          rec.locatorCandidates = rec.locatorCandidates || locatorCandidates(el);
          rec.options = rec.options || [];
          rec.observations = rec.observations || [];
          if (!rec.groupKey && isChoice(el)) rec.groupKey = groupKeyOf(el);
          if (label && !rec.labels.includes(label)) rec.labels.push(label);
          for (const l of linkedLabels) if (!rec.linkedLabels.some((x) => x.text === l.text && x.path === l.path)) rec.linkedLabels.push(l);
          rec.attrs = attrsOf(el); // 사라진 속성까지 영원히 남기지 않고 최신 상태로 교체
          if (previous && !previous.present) { changed.push({ key: k, what: "DOM 재등장" }); addTransition(rec, "readded", { visible: vis }); }
          if (previous && previous.present && previous.visible && !vis) { changed.push({ key: k, what: "숨겨짐" }); addTransition(rec, "hidden"); }
          else if (previous && previous.present && !previous.visible && vis) { changed.push({ key: k, what: "재표시" }); addTransition(rec, "reshown"); }
          if (vis && !rec.everVisible) rec.everVisible = true;
        }
        rec.lastSeen = now();
        rec.lastPath = pathOf(el);
        rec.runtime = Object.assign({}, rec.runtime || {}, runtimeOf(el, !(rec.runtime && rec.runtime.computedStyle && rec.runtime.rect)));
        const options = optionsOf(el), before = rec.options.length;
        for (const o of options) if (!rec.options.some((x) => x.text === o.text && x.value === o.value)) rec.options.push(o);
        if (rec.options.length > before) changed.push({ key: k, what: `옵션 ${before}→${rec.options.length}`, sample: rec.options.slice(-3).map((o) => o.text) });
        seen.set(k, { present: true, visible: vis });
        currentElements.set(k, el);
      });
      for (const [k, previous] of fieldStates) {
        if (!previous.present || seen.has(k)) continue;
        const rec = REC.fields[k];
        if (rec) { rec.lastRemoved = now(); addTransition(rec, "removed"); }
        seen.set(k, { present: false, visible: false });
        changed.push({ key: k, what: "DOM 제거" });
      }
      fieldStates.clear();
      for (const [k, v] of seen) fieldStates.set(k, v);

      for (const el of deepQueryAll(CLICK_SELECTOR)) {
        const rawText = txt(el);
        if (!rawText) continue;
        const text = safeText(el, rawText);
        let k = MASK ? `path:${pathOf(el)}` : `${el.tagName.toLowerCase()}|${text}`;
        if (REC.clickables[k] && REC.clickables[k].path !== pathOf(el)) k += `|${pathOf(el)}`;
        if (!REC.clickables[k]) {
          REC.clickables[k] = { tag: el.tagName.toLowerCase(), text, attrs: attrsOf(el), path: pathOf(el), locatorCandidates: locatorCandidates(el), firstSeen: now(), firstSeenAfter: lastAction };
          added.push(k);
        }
      }
      if (added.length || changed.length) {
        REC.timeline.push({ t: now(), reason, afterAction: lastAction, added, changed });
        queueSave();
      }
      badge();
    }

    function valueSnapshot() {
      const m = {};
      eachField((el, k) => { m[k] = actualValue(el); currentElements.set(k, el); });
      return m;
    }

    const LATE_LIMIT = 2000;
    const editedAt = Object.create(null);
    let lastEditAt = 0;
    let editSerial = 0;

    function recordInput(el, before, baseAt, typed, late) {
      if (stopped || !isElement(el)) return;
      const k = keyOf(el), rec = REC.fields[k];
      if (!rec) return;
      const after = valueSnapshot(), mine = after[k];
      // 같은 칸에 다음 키 입력이 이미 들어왔다면 값 차이는 자동서식이 아니라
      // 사용자의 연속 입력일 수 있다. 그 경우 앞선 예약 작업은 판정에 쓰지 않는다.
      const supersededByLaterEdit = editedAt[k] > baseAt;
      if (!supersededByLaterEdit && typed && mine !== typed) {
        if (!mine) rec.rejected = true;
        else rec.reformatted = { from: safeValue(el, typed), to: safeValue(el, mine) };
      }
      const side = [];
      if (!(late > LATE_LIMIT) && !(lastEditAt > baseAt)) {
        for (const other of Object.keys(after)) {
          if (other === k || editedAt[other] >= baseAt) continue;
          if (before[other] !== after[other] && after[other]) {
            const otherEl = currentElements.get(other);
            side.push({ key: other, from: safeValue(otherEl, before[other]), to: safeValue(otherEl, after[other]) });
          }
        }
      }
      if (side.length) {
        rec.sideEffects = rec.sideEffects || [];
        for (const s of side) if (!rec.sideEffects.some((x) => x.key === s.key)) rec.sideEffects.push(s);
        REC.timeline.push({ t: now(), reason: "부수효과", afterAction: `input:${k}`, added: [], changed: side.map((s) => ({ key: s.key, what: `자동변경 "${s.from}"→"${s.to}"` })) });
      }
      if (!MASK && mine) {
        rec.observations = rec.observations || [];
        rec.observations.push({ t: now(), 넣은값: safeValue(el, typed || "(직접입력)"), 남은값: safeValue(el, mine) });
      }
      rec.runtime = Object.assign({}, rec.runtime || {}, runtimeOf(el, false));
      queueSave();
      badge();
    }

    function capHtml(html, limit) {
      const s = String(html || "");
      return { html: s.length > limit ? s.slice(0, limit) : s, truncated: s.length > limit, originalLength: s.length };
    }

    function sanitizedClone(root) {
      // Chrome의 ShadowRoot(DocumentFragment)는 cloneNode() 자체가 예외를 던진다.
      // 자식만 새 DocumentFragment에 복제하면 같은 walk/sanitize 과정을 안전하게 탈 수 있다.
      let clone;
      if (isShadowRoot(root)) {
        clone = document.createDocumentFragment();
        for (const child of root.childNodes) clone.appendChild(child.cloneNode(true));
      } else clone = root.cloneNode(true);
      function walk(src, dst) {
        if (!src || !dst) return;
        if (src.nodeType === 3) return;
        if (isElement(src)) {
          const tag = src.tagName.toLowerCase();
          if (["script", "style", "noscript"].includes(tag) || isRecorderUI(src)) { dst.remove(); return; }
          for (const a of [...dst.attributes]) {
            if (/^on/i.test(a.name)) dst.removeAttribute(a.name);
            else if (MASK && a.name.startsWith("data-") && !/^(data-testid|data-test|data-cy|data-qa)$/i.test(a.name)) dst.setAttribute(a.name, a.value ? MASKED : "");
          }
          const secret = MASK || sensitiveElement(src);
          if (tag === "input") {
            dst.setAttribute("value", safeValue(src, src.value || ""));
            if (src.type === "checkbox" || src.type === "radio") {
              dst.removeAttribute("checked");
              if (src.checked) dst.setAttribute("checked", "");
            }
          } else if (tag === "textarea") { dst.textContent = safeValue(src, src.value || ""); return; }
          else if (tag === "select") {
            const so = [...src.options], dest = [...dst.options];
            for (let i = 0; i < dest.length; i++) { dest[i].removeAttribute("selected"); if (so[i] && so[i].selected) dest[i].setAttribute("selected", ""); }
          }
          const role = String(src.getAttribute("role") || "").toLowerCase();
          if ((src.isContentEditable || role === "textbox" || role === "combobox") && secret) { dst.textContent = txt(src, 2000) ? MASKED : ""; return; }
          if (secret) for (const a of ["aria-valuetext", "aria-valuenow"]) if (dst.hasAttribute(a)) dst.setAttribute(a, MASKED);
        }
        const sc = [...src.childNodes], dc = [...dst.childNodes];
        for (let i = 0; i < Math.min(sc.length, dc.length); i++) walk(sc[i], dc[i]);
      }
      walk(root, clone);
      return clone;
    }

    function serializeSanitized(root, limit) {
      let clone;
      try { clone = sanitizedClone(root); }
      catch (error) { return { html: "", truncated: false, originalLength: 0, error: String(error && error.message || error) }; }
      let html = "";
      if (clone && typeof clone.outerHTML === "string") html = clone.outerHTML;
      else { const holder = document.createElement("div"); holder.appendChild(clone); html = holder.innerHTML; }
      return capHtml(html, limit);
    }

    function contextRoot(el) {
      let node = el;
      for (let i = 0; isElement(node) && i < 4; i++) {
        if (node !== el && node.matches("fieldset, label, li, .row, [role=group], [role=radiogroup], [role=dialog], [aria-modal=true]")) return node;
        if (!node.parentElement) break;
        node = node.parentElement;
      }
      return (el && el.parentElement) || el;
    }

    function targetContext(el) {
      if (!isElement(el)) return null;
      const root = contextRoot(el), control = closestControl(el);
      return {
        target: describe(el), key: control ? keyOf(control) : null, path: pathOf(el),
        locators: locatorCandidates(el), runtime: control ? runtimeOf(control) : null,
        contextPath: pathOf(root), dom: serializeSanitized(root, CONTEXT_HTML_LIMIT),
      };
    }

    function visibleOverlays() {
      const out = [];
      for (const el of deepQueryAll(OVERLAY_SELECTOR)) {
        if (!visible(el)) continue;
        out.push({
          type: String(el.getAttribute("role") || el.className || el.tagName.toLowerCase()),
          path: pathOf(el), locators: locatorCandidates(el), text: safeText(el, txt(el, 240)),
          dom: serializeSanitized(el, OVERLAY_HTML_LIMIT), rect: runtimeOf(el).rect || null,
        });
        if (out.length >= 30) break;
      }
      return out;
    }

    function popupSig() {
      const vis = deepQueryAll(OVERLAY_SELECTOR).filter(visible);
      return vis.length + "|" + vis.map((e) => pathOf(e)).join(",");
    }

    function classifyPopup() {
      const cal = deepQueryAll(".rdp, [class*=calendar i], [class*=datepicker i], [class*=picker i]").find(visible);
      if (cal && rootQuery(cal, "button, td").length > 20) return "캘린더";
      const dlg = deepQueryAll("[role=dialog], [aria-modal=true]").find(visible);
      if (dlg && rootQuery(dlg, "input, textarea, [role=textbox]").length) return "모달";
      const opts = deepQueryAll("[role=option], [role=listbox] li, ul li").filter(visible);
      if (opts.length >= 2) return "드롭다운";
      if (dlg) return "모달";
      return null;
    }

    const pending = new Set();
    function later(ms, fn) {
      const due = Date.now() + ms;
      const job = { done: false, timer: null, run: null };
      job.run = () => { if (job.done) return; job.done = true; pending.delete(job); fn(Date.now() - due); };
      job.timer = setTimeout(job.run, ms);
      pending.add(job);
    }
    function flushPending() {
      for (const job of [...pending]) { clearTimeout(job.timer); job.run(); }
      pending.clear();
    }

    const beforeContext = new WeakMap();

    function cacheBeforeContext(el, source, force) {
      const control = closestControl(el);
      const target = control || el;
      if (!isElement(target)) return;
      const previous = beforeContext.get(target);
      if (!force && previous && Date.now() - previous.at <= 3000) return;
      const cached = {
        at: Date.now(), t: now(), source,
        targetContext: targetContext(target), overlays: visibleOverlays(),
      };
      beforeContext.set(target, cached);
      if (target !== el) beforeContext.set(el, cached);
    }

    function recentBeforeContext(el, control, type) {
      const cached = beforeContext.get(control || el) || beforeContext.get(el);
      if (!cached || Date.now() - cached.at > 5000) return null;
      if (type === "click" && cached.source !== "pointerdown") return null;
      return cached;
    }

    function newSemanticAction(type, el) {
      const control = closestControl(el);
      const cached = recentBeforeContext(el, control, type);
      const action = {
        id: `a${REC.actions.length + 1}`, t: now(), type, target: describe(el), path: pathOf(el),
        key: control ? keyOf(control) : null,
        before: cached ? {
          phase: cached.source, source: `${cached.source}-cache`,
          t: cached.t, targetContext: cached.targetContext, overlays: cached.overlays,
        } : {
          phase: "event-capture", source: "click-capture-fallback",
          targetContext: targetContext(el), overlays: visibleOverlays(),
        },
        after: null,
      };
      REC.actions.push(action);
      later(type === "click" ? 450 : 250, () => {
        action.after = { t: now(), targetContext: targetContext(el), overlays: visibleOverlays() };
        queueSave();
      });
      return action;
    }

    function actualTarget(e) {
      try { const p = e.composedPath && e.composedPath(); const n = p && p.find(isElement); if (n) return n; }
      catch (_) {}
      return isElement(e.target) ? e.target : e.target && e.target.parentElement;
    }

    function safeEventKey(el, key) {
      if (!key) return key || "";
      if (!(MASK || sensitiveElement(el))) return key;
      return key.length === 1 || key === "Process" || key === "Unidentified" ? MASKED : key;
    }

    function recordRawEvent(e, el) {
      const control = closestControl(el);
      let composed = [];
      try { composed = (e.composedPath ? e.composedPath() : []).filter(isElement).slice(0, 14).map((n) => ({ target: describe(n), path: pathOf(n) })); }
      catch (_) {}
      const event = {
        seq: (REC.meta.lastInteractionSeq || 0) + 1, t: now(), type: e.type,
        actualTarget: describe(el), actualTargetPath: pathOf(el),
        retargetedTarget: describe(isElement(e.target) ? e.target : null), composedPath: composed,
        fieldKey: control ? keyOf(control) : null, trusted: !!e.isTrusted,
      };
      REC.meta.lastInteractionSeq = event.seq;
      if ("inputType" in e && e.inputType) event.inputType = e.inputType;
      if ("data" in e && e.data != null) event.data = safeValue(control || el, e.data);
      if ("key" in e && e.key) event.eventKey = safeEventKey(control || el, e.key);
      if ("code" in e && e.code) event.eventCode = (MASK || sensitiveElement(control || el)) && /^Key|^Digit/.test(e.code) ? MASKED : e.code;
      if ("isComposing" in e) event.isComposing = !!e.isComposing;
      if ("button" in e) event.button = e.button;
      if ("buttons" in e) event.buttons = e.buttons;
      if ("pointerType" in e && e.pointerType) event.pointerType = e.pointerType;
      if (control) event.runtime = runtimeOf(control, false);
      if (REC.interactionEvents.length >= EVENT_LIMIT) {
        REC.interactionEvents.shift();
        REC.interactionEventsDropped++;
      }
      REC.interactionEvents.push(event);
    }

    const seenEvents = new WeakSet();
    function handleInteraction(e) {
      if (stopped || seenEvents.has(e)) return;
      seenEvents.add(e);
      const el = actualTarget(e);
      if (!isElement(el) || isRecorderUI(el)) return;
      recordRawEvent(e, el);
      if (e.type === "pointerdown") {
        cacheBeforeContext(el, "pointerdown", true);
      } else if (e.type === "focusin") {
        cacheBeforeContext(el, "focusin", true);
      } else if (e.type === "keydown" || e.type === "beforeinput") {
        // focusin이 없거나 오래된 경우에만 상세 DOM 문맥을 다시 잡는다.
        cacheBeforeContext(el, e.type, false);
      } else if (e.type === "click") {
        const action = newSemanticAction("click", el);
        lastAction = action.id;
        const control = closestControl(el);
        if (control && control.matches("input, textarea, [role=combobox], [role=textbox]")) {
          const k = keyOf(control), sigBefore = popupSig();
          later(450, (late) => {
            if (late > LATE_LIMIT || popupSig() === sigBefore) return;
            const kind = classifyPopup(), rec = REC.fields[k];
            if (rec && kind && !rec.opens) {
              rec.opens = kind;
              REC.timeline.push({ t: now(), reason: "클릭반응", afterAction: action.id, added: [], changed: [{ key: k, what: `클릭하니 ${kind} 열림` }] });
              queueSave(); badge();
            }
          });
        }
        queueSave(); badge();
      } else if (e.type === "change") {
        const control = closestControl(el);
        if (!control) return;
        const action = newSemanticAction("change", control);
        lastAction = action.id;
        const snap = valueSnapshot(), at = ++editSerial;
        editedAt[keyOf(control)] = lastEditAt = at;
        later(250, (late) => recordInput(control, snap, at, null, late));
        badge();
      } else if (e.type === "input") {
        const control = closestControl(el);
        if (!control) return;
        const typed = actualValue(control), snap = valueSnapshot(), at = ++editSerial;
        editedAt[keyOf(control)] = lastEditAt = at;
        later(400, (late) => recordInput(control, snap, at, typed, late));
      }
    }

    const observedRoots = new Set();
    function addInteractionListeners(root) {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      for (const type of INTERACTION_TYPES) root.addEventListener(type, handleInteraction, true);
    }
    function observeRoot(root) {
      if (!root || observedRoots.has(root)) return;
      addInteractionListeners(root);
      if (mo) try { mo.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true }); } catch (_) {}
    }
    function discoverShadowRoots() { for (const root of collectShadowRoots()) observeRoot(root); }

    function nodeSummary(node) {
      const el = isElement(node) ? node : null;
      if (!el) return { nodeType: node && node.nodeType, text: MASK && cleanText(node && node.textContent) ? MASKED : cleanText(node && node.textContent, 100) };
      return { tag: el.tagName.toLowerCase(), id: el.id || "", name: el.getAttribute("name") || "", role: el.getAttribute("role") || "", path: pathOf(el), text: safeText(el, txt(el, 100)) };
    }
    function pushMutation(item) {
      if (REC.mutations.length < MUTATION_LIMIT) REC.mutations.push(item);
      else REC.mutationsDropped++;
    }
    function handleMutations(records) {
      if (stopped) return;
      let meaningful = false;
      for (const m of records) {
        if (isRecorderUI(m.target)) continue;
        if (m.type === "childList") {
          const added = [...m.addedNodes].filter((n) => !isRecorderUI(n)).slice(0, 30).map(nodeSummary);
          const removed = [...m.removedNodes].filter((n) => !isRecorderUI(n)).slice(0, 30).map(nodeSummary);
          if (!added.length && !removed.length) continue;
          meaningful = true;
          pushMutation({ t: now(), type: "childList", afterAction: lastAction, target: nodeSummary(m.target), added, removed, addedCount: m.addedNodes.length, removedCount: m.removedNodes.length });
        } else if (m.type === "attributes") {
          meaningful = true;
          const name = m.attributeName;
          pushMutation({ t: now(), type: "attribute", afterAction: lastAction, target: nodeSummary(m.target), name, oldValue: safeAttr(m.target, name, m.oldValue), newValue: safeAttr(m.target, name, m.target.getAttribute(name)) });
        }
      }
      if (!meaningful) return;
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => sweep("mutation"), 300);
    }

    function frameContext() {
      let depth = 0;
      try { let w = window; while (w !== w.top && depth < 30) { depth++; w = w.parent; } }
      catch (_) { depth = Math.max(depth, 1); }
      let ancestorOrigins = [];
      try { ancestorOrigins = [...(location.ancestorOrigins || [])]; } catch (_) {}
      let frameElement = null;
      try {
        if (window.frameElement) frameElement = { target: describe(window.frameElement), path: pathOf(window.frameElement), attrs: attrsOf(window.frameElement), locators: locatorCandidates(window.frameElement) };
      } catch (_) {}
      const out = { depth, referrer: document.referrer || "", ancestorOrigins, windowName: window.name || "", sameOriginFrameElement: frameElement };
      if (Number.isInteger(REC.meta.chromeFrameId)) out.chromeFrameId = REC.meta.chromeFrameId;
      if (typeof REC.meta.chromeDocumentId === "string" && REC.meta.chromeDocumentId) out.chromeDocumentId = REC.meta.chromeDocumentId;
      return out;
    }

    function setChromeContext(frameId, documentId) {
      if (Number.isInteger(frameId) && frameId >= 0) REC.meta.chromeFrameId = frameId;
      if (typeof documentId === "string" && documentId) REC.meta.chromeDocumentId = documentId;
      REC.meta.frameContext = frameContext();
      if (initialState) initialState.frameContext = frameContext();
    }

    function shadowSnapshots() {
      return collectShadowRoots().map((root) => ({
        mode: root.mode || "open", host: describe(root.host), hostPath: pathOf(root.host),
        hostLocators: locatorCandidates(root.host), dom: serializeSanitized(root, SHADOW_HTML_LIMIT),
      }));
    }

    function captureState(label, requestId) {
      if (stopped) return null;
      const normalizedRequestId = requestId == null ? null : String(requestId);
      if (normalizedRequestId !== null) {
        const existing = REC.states.find((state) => state.requestId === normalizedRequestId);
        if (existing) return existing;
      }
      if (REC.states.length >= STATE_LIMIT) { REC.statesDropped++; return null; }
      const fields = [];
      eachField((el, k) => fields.push({
        key: k, groupKey: isChoice(el) ? groupKeyOf(el) : null, tag: el.tagName.toLowerCase(),
        legacyName: el.getAttribute("name") || null,
        path: pathOf(el), attrs: attrsOf(el), labels: labelsOf(el), locatorCandidates: locatorCandidates(el), runtime: runtimeOf(el),
      }));
      const activeEl = deepActiveElement();
      const state = {
        id: `s${++stateSerial}`, t: now(), at: new Date().toISOString(), label: String(label || "상태"),
        requestId: normalizedRequestId, url: location.href,
        dom: serializeSanitized(document.documentElement, DOM_HTML_LIMIT), fields,
        overlays: visibleOverlays(), activeElement: activeEl ? targetContext(activeEl) : null,
        frameContext: frameContext(), openShadows: shadowSnapshots(),
      };
      REC.states.push(state);
      REC.timeline.push({ t: now(), reason: "상태 스냅샷", stateId: state.id, label: state.label, afterAction: lastAction, added: [], changed: [] });
      queueSave(); badge();
      return state;
    }

    function finalize(markEnded) {
      for (const rec of Object.values(REC.fields)) rec.판정 = verdict(rec);
      REC.meta.url = location.href;
      REC.meta.host = location.hostname;
      REC.meta.title = document.title;
      REC.meta.frameContext = frameContext();
      REC.meta.updatedAt = new Date().toISOString();
      if (markEnded) REC.meta.endedAt = REC.meta.updatedAt;
      REC.meta.durationSec = Math.round(now() / 1000);
      REC.meta.interactionEventsDropped = REC.interactionEventsDropped;
      REC.meta.mutationsDropped = REC.mutationsDropped;
      REC.meta.statesDropped = REC.statesDropped;
      return REC;
    }

    // v1에서 이어받은 기록에 password/hidden/민감 name 값이 남아 있을 수 있다.
    // 새 이벤트만 가려서는 export 시 과거 값이 새므로, 알려진 값 슬롯도 시작 전에 정리한다.
    function scrubSensitivePrior() {
      const sensitiveKeys = new Set();
      for (const [key, rec] of Object.entries(REC.fields)) {
        const a = rec.attrs || {};
        const hint = `${a.type || ""} ${a.name || ""} ${a.id || ""} ${a.placeholder || ""} ${a.autocomplete || ""} ${key}`;
        if (a.type === "password" || a.type === "hidden" || SENSITIVE_RE.test(hint)) sensitiveKeys.add(key);
      }
      const maskRuntime = (runtime) => {
        if (runtime && typeof runtime === "object" && "value" in runtime && runtime.value !== "") runtime.value = MASKED;
      };
      for (const [key, rec] of Object.entries(REC.fields)) {
        if (sensitiveKeys.has(key)) {
          rec.observations = [];
          if (rec.reformatted) rec.reformatted = { from: MASKED, to: MASKED };
          maskRuntime(rec.runtime);
        }
        for (const side of rec.sideEffects || []) {
          if (sensitiveKeys.has(key) || sensitiveKeys.has(side.key)) {
            if (side.from !== "") side.from = MASKED;
            if (side.to !== "") side.to = MASKED;
          }
        }
      }
      for (const event of REC.interactionEvents) {
        if (!sensitiveKeys.has(event.fieldKey)) continue;
        if (event.data) event.data = MASKED;
        if (event.eventKey && event.eventKey.length === 1) event.eventKey = MASKED;
        if (event.eventCode && /^Key|^Digit/.test(event.eventCode)) event.eventCode = MASKED;
        maskRuntime(event.runtime);
      }
      for (const item of REC.timeline) {
        for (const changed of item.changed || []) if (sensitiveKeys.has(changed.key)) changed.what = "민감 값 변화 [가림]";
      }
      for (const state of REC.states) {
        for (const field of state.fields || []) if (sensitiveKeys.has(field.key)) maskRuntime(field.runtime);
      }
    }

    function runCallbacks(callbacks, error) {
      for (const cb of callbacks) try { cb(error); } catch (_) {}
    }

    function summaryOf(rec) {
      return {
        schemaVersion: rec.meta.schemaVersion,
        captureId: rec.meta.captureId,
        storageKey: rec.meta.storageKey,
        summaryKey: rec.meta.summaryKey,
        url: rec.meta.url,
        maskValues: rec.meta.maskValues,
        frame: rec.meta.frame,
        chromeFrameId: rec.meta.chromeFrameId,
        chromeDocumentId: rec.meta.chromeDocumentId,
        fieldCount: Object.keys(rec.fields || {}).length,
        actionCount: (rec.actions || []).length,
        stateCount: (rec.states || []).length,
        updatedAt: rec.meta.updatedAt,
        endedAt: rec.meta.endedAt,
      };
    }

    function saveNow(force, done) {
      if (typeof done === "function") saveCallbacks.push(done);
      if (!EXT || (stopped && !force)) {
        if (saveCallbacks.length) { const callbacks = saveCallbacks.splice(0); runCallbacks(callbacks, new Error("save-not-allowed")); }
        return;
      }
      if (saving) {
        savePending = true;
        savePendingForce = savePendingForce || !!force;
        return;
      }
      saving = true;
      const callbacksForThisSave = saveCallbacks.splice(0);
      try {
        const finalized = finalize(false);
        chrome.storage.local.set({ [PAGE_KEY]: finalized, [SUMMARY_KEY]: summaryOf(finalized) }, () => {
          const error = chrome.runtime.lastError || null;
          saving = false;
          runCallbacks(callbacksForThisSave, error);
          if (savePending) {
            const nextForce = savePendingForce;
            savePending = false;
            savePendingForce = false;
            saveNow(nextForce);
          }
        });
      } catch (error) {
        saving = false;
        runCallbacks(callbacksForThisSave, error);
        if (savePending) {
          const nextForce = savePendingForce;
          savePending = false;
          savePendingForce = false;
          saveNow(nextForce);
        }
      }
    }

    function queueSave() {
      if (!EXT || stopped) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveNow(false), 1200);
    }

    const hHide = () => { clearTimeout(saveTimer); flushPending(); sweep("hide"); saveNow(false); };
    const hVis = () => { if (document.hidden) hHide(); };

    function badge() {
      if (!box) return;
      const f = Object.values(REC.fields);
      const known = f.filter((x) => x.opens || x.reformatted || (x.observations || []).length || (x.options || []).length).length;
      box.innerHTML = `<b style="color:#a5b4fc">● REC</b> ${Math.round(now() / 1000)}s${MASK ? ' <span style="color:#94a3b8">(값 가림)</span>' : ""}<br>` +
        `칸 ${f.length} <span style="color:#6ee7b7">(성격파악 ${known})</span><br>` +
        `클릭대상 ${Object.keys(REC.clickables).length} · 조작 ${REC.actions.length} · 상태 ${REC.states.length}<br>` +
        `<span style="color:#fbbf24">${EXT ? "아이콘 → 정지·저장" : "상태(\"이름\") / 끝()"}</span>`;
    }

    function teardown() {
      if (stopped) return;
      stopped = true;
      clearTimeout(saveTimer); clearTimeout(mutationTimer);
      if (mo) mo.disconnect();
      for (const root of observedRoots) for (const type of INTERACTION_TYPES) root.removeEventListener(type, handleInteraction, true);
      observedRoots.clear();
      window.removeEventListener("pagehide", hHide);
      document.removeEventListener("visibilitychange", hVis);
      if (box) box.remove();
    }

    if (prior) scrubSensitivePrior();
    REC.meta.frameContext = frameContext();
    addInteractionListeners(document);
    mo = new MutationObserver(handleMutations);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeOldValue: true });
    discoverShadowRoots();
    window.addEventListener("pagehide", hHide);
    document.addEventListener("visibilitychange", hVis);

    const showBadge = window.top === window || deepQueryAll(FIELD_SELECTOR).length > 0;
    if (showBadge) {
      box = document.createElement("div");
      box.setAttribute("data-fieldlog-ui", "badge");
      box.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483647;background:#0a0e1a;color:#cfe;" +
        "border:1px solid #6366f1;border-radius:8px;font:12px/1.6 ui-monospace,monospace;padding:9px 12px;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:none;white-space:nowrap";
      document.documentElement.appendChild(box);
    }
    sweep("start");
    initialState = captureState("자동: 시작", `auto-start:${REC.meta.sessions}`);
    return { REC, storageKey: PAGE_KEY, summaryKey: SUMMARY_KEY, initialState, finalize, saveNow, teardown, sweep, flushPending, captureState, setChromeContext };
  }

  let active = null;
  let stopFlight = null;
  let lastStopResult = null;
  function start(mask, prior, frameId, documentId) {
    if (active) return active;
    active = createRecorder({ mask, prior, frameId, documentId });
    lastStopResult = null;
    return active;
  }
  function stop(done) {
    if (!active) {
      if (typeof done === "function") {
        if (stopFlight) stopFlight.callbacks.push({ fn: done, alreadyStopped: true });
        else if (lastStopResult) done(lastStopResult.error, lastStopResult.rec, true, lastStopResult.state);
        else done(new Error("final-save-status-unknown"), null, true, null);
      }
      return null;
    }
    const a = active;
    active = null;
    a.flushPending();
    a.sweep("stop");
    const stoppedState = a.captureState("자동: 정지", `auto-stop:${a.REC.meta.sessions}`);
    const rec = a.finalize(true);
    a.teardown();
    const flight = {
      rec, state: stoppedState,
      callbacks: typeof done === "function" ? [{ fn: done, alreadyStopped: false }] : [],
      after: [],
    };
    stopFlight = flight;
    a.saveNow(true, (error) => {
      if (stopFlight === flight) stopFlight = null;
      lastStopResult = { error: error || null, rec, state: stoppedState };
      for (const item of flight.callbacks.splice(0)) {
        try { item.fn(error || null, rec, item.alreadyStopped, stoppedState); } catch (_) {}
      }
      for (const after of flight.after.splice(0)) {
        try { after(error || null); } catch (_) {}
      }
    });
    return rec;
  }

  if (!EXT) {
    if (window.__flOn) { console.warn("[필드로그] 이미 녹화 중입니다. 끝() 으로 저장하세요."); return; }
    window.__flOn = true;
    const r = start(window.__flMask === true, null);
    window.__fieldlog = r.REC;
    window.__flSweep = () => r.sweep("manual");
    window.상태 = window.__flState = function (label) {
      r.sweep("manual-state");
      const state = r.captureState(label || "수동 상태", `console-${Date.now()}`);
      console.log(`[필드로그] 상태 저장: ${state ? state.id : "상한 초과"} ${label || "수동 상태"}`);
      return state;
    };
    window.끝 = window.__flDump = function () {
      const rec = stop();
      window.__flOn = false;
      const host = location.hostname.replace(/[^a-z0-9.]/gi, "_");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `fieldlog_${host}_${stamp}.json`;
      const envelope = {
        schemaVersion: 2,
        capturedAt: new Date().toISOString(),
        note: "",
        maskValues: !!(rec.meta && rec.meta.maskValues),
        pageCount: 1,
        stateCount: (rec.states || []).length,
        screenshotCount: 0,
        pages: [Object.assign({
          storageKey: rec.meta && rec.meta.storageKey,
          summaryKey: rec.meta && rec.meta.summaryKey,
          pageUrl: (rec.meta && rec.meta.url) || location.href,
        }, rec)],
        screenshots: [],
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      console.log(`[필드로그] 저장: ${name} — 칸 ${Object.keys(rec.fields).length}개, 조작 ${rec.actions.length}회, 상태 ${rec.states.length}개`);
      return name;
    };
    console.log('[필드로그] 녹화 시작. 중간 상태는 상태("라벨"), 끝나면 끝()');
    return;
  }

  let desired = null;
  let startFlight = null;

  function finishStart(flight, error, recorder) {
    if (startFlight !== flight) return;
    startFlight = null;
    const callbacks = flight.callbacks.splice(0);
    for (const cb of callbacks) {
      try { cb(error || null, recorder ? recorder.REC : null, recorder && recorder.initialState, false); } catch (_) {}
    }
  }

  function cancelStart(reason) {
    if (!startFlight) return;
    const flight = startFlight;
    startFlight = null;
    const error = reason instanceof Error ? reason : new Error(String(reason || "start-cancelled"));
    for (const cb of flight.callbacks.splice(0)) {
      try { cb(error, null, null, false); } catch (_) {}
    }
  }

  function ensureStarted(frameId, documentId, done) {
    const validFrameId = Number.isInteger(frameId) && frameId >= 0 ? frameId : null;
    const validDocumentId = typeof documentId === "string" && documentId ? documentId : null;
    if (stopFlight) {
      stopFlight.after.push((error) => {
        if (error) { if (typeof done === "function") done(error, null, null, false); }
        else if (desired !== false) ensureStarted(validFrameId, validDocumentId, done);
        else if (typeof done === "function") done(new Error("start-cancelled"), null, null, false);
      });
      return;
    }
    if (active) {
      const recorder = active;
      recorder.setChromeContext(validFrameId, validDocumentId);
      if (typeof done !== "function") return;
      recorder.saveNow(true, (error) => done(error || null, recorder.REC, recorder.initialState, true));
      return;
    }
    if (startFlight) {
      if (validFrameId !== null) startFlight.frameId = validFrameId;
      if (validDocumentId !== null) startFlight.documentId = validDocumentId;
      if (typeof done === "function") startFlight.callbacks.push(done);
      return;
    }

    const flight = { frameId: validFrameId, documentId: validDocumentId, callbacks: typeof done === "function" ? [done] : [] };
    startFlight = flight;
    chrome.storage.local.get("fl_mask", (settings) => {
      if (startFlight !== flight) return;
      const settingsError = chrome.runtime.lastError;
      if (settingsError) return finishStart(flight, new Error(settingsError.message || String(settingsError)), null);
      if (desired === false) return cancelStart("start-cancelled");
      const mask = settings.fl_mask === true;
      const pageKey = storageKeyFor(mask);
      chrome.storage.local.get(pageKey, (pages) => {
        if (startFlight !== flight) return;
        const pageError = chrome.runtime.lastError;
        if (pageError) return finishStart(flight, new Error(pageError.message || String(pageError)), null);
        if (desired === false) return cancelStart("start-cancelled");
        const recorder = start(mask, pages[pageKey] || null, flight.frameId, flight.documentId);
        recorder.setChromeContext(flight.frameId, flight.documentId);
        recorder.saveNow(true, (error) => finishStart(flight, error, recorder));
      });
    });
  }

  function apply(on) {
    if (on) ensureStarted(null, null, null);
    else {
      cancelStart("recording-disabled");
      if (active) stop();
    }
  }
  // 어떤 사이트에서든 쓰지만, 저장소 플래그만 보고 아무 탭에서나 켜지지는 않는다.
  // 팝업이 녹화를 시작한 origin 목록에 이 문서가 들어갈 때만 자동으로 시작한다.
  // (같은 사이트 안에서 페이지를 옮겨다녀도 계속 기록된다.)
  function autoStartAllowed(st) {
    const list = st && st.fl_origins;
    return !!(st && st.fl_on === true && Array.isArray(list) && list.includes(location.origin));
  }
  function syncFromStorage() {
    CONTROL_STORAGE.get(["fl_on", "fl_origins"], (st) => {
      if (chrome.runtime.lastError) return;
      if (desired === null) apply(autoStartAllowed(st));
    });
  }
  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== CONTROL_AREA || (!("fl_on" in chg) && !("fl_origins" in chg))) return;
    CONTROL_STORAGE.get(["fl_on", "fl_origins"], (st) => {
      if (chrome.runtime.lastError) return;
      // 정지는 origin 과 무관하게 즉시 따른다. 시작은 허용된 origin 에서만.
      if (!st || st.fl_on !== true) { desired = false; apply(false); return; }
      if (!autoStartAllowed(st)) return;
      desired = true; apply(true);
    });
  });

  if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === "function") {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !["fieldlog:start", "fieldlog:capture-state", "fieldlog:stop"].includes(message.type)) return;
      const requestId = message.requestId == null ? null : String(message.requestId);

      if (message.type === "fieldlog:start") {
        desired = true;
        ensureStarted(message.frameId, message.documentId, (error, rec, state, alreadyStarted) => {
          if (sendResponse) sendResponse({
            ok: !error, requestId,
            captureId: rec && rec.meta && rec.meta.captureId,
            storageKey: rec && rec.meta && rec.meta.storageKey,
            summaryKey: rec && rec.meta && rec.meta.summaryKey,
            frameId: rec && rec.meta && rec.meta.chromeFrameId,
            documentId: rec && rec.meta && rec.meta.chromeDocumentId,
            stateId: state && state.id,
            alreadyStarted: !!alreadyStarted,
            error: error ? String(error.message || error) : undefined,
          });
        });
        return true;
      }

      if (active) active.setChromeContext(message.frameId, message.documentId);

      if (message.type === "fieldlog:stop") {
        // 이 문서가 애초에 녹화한 적이 있는지. 없으면 저장 실패가 아니라 "해당 없음"이다.
        const everRecorded = !!(active || lastStopResult || startFlight || stopFlight);
        // 팝업이 잠시 뒤 fl_on=false를 쓰기 전에도 지연 중인 start 콜백이 재기동하지 않게 한다.
        desired = false;
        cancelStart("stopped-before-start");
        stop((error, rec, alreadyStopped, state) => {
          if (sendResponse) sendResponse({
            ok: !error, requestId,
            captureId: (rec && rec.meta && rec.meta.captureId) || CAPTURE_ID,
            storageKey: rec && rec.meta && rec.meta.storageKey,
            summaryKey: rec && rec.meta && rec.meta.summaryKey,
            frameId: (rec && rec.meta && rec.meta.chromeFrameId) ?? (Number.isInteger(message.frameId) ? message.frameId : undefined),
            documentId: (rec && rec.meta && rec.meta.chromeDocumentId) || (typeof message.documentId === "string" ? message.documentId : undefined),
            stateId: state && state.id,
            alreadyStopped: !!alreadyStopped,
            everRecorded,
            error: error ? String(error.message || error) : undefined,
          });
        });
        return true;
      }

      if (!active) { if (sendResponse) sendResponse({ ok: false, requestId, captureId: CAPTURE_ID, error: "not-recording" }); return; }
      active.sweep("manual-state");
      const state = active.captureState(message.label || "수동 상태", requestId);
      const rec = active.REC;
      active.saveNow(true, (error) => {
        if (sendResponse) sendResponse({
          ok: !!state && !error, requestId,
          captureId: rec.meta.captureId, storageKey: rec.meta.storageKey,
          summaryKey: rec.meta.summaryKey,
          frameId: rec.meta.chromeFrameId,
          documentId: rec.meta.chromeDocumentId,
          stateId: state && state.id,
          error: error ? String(error.message || error) : undefined,
        });
      });
      return true;
    });
  }
  syncFromStorage();
})();
