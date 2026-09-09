/* 당근부동산 매물 등록폼 — 정적 스냅샷 되살리기
 *
 * 당근은 셋 중 가장 죽어 있다.
 *  · 라벨을 누르면 숨은 input 은 토글되지만, 눈에 보이는 체크 표시는 그대로다.
 *    표시가 켜지는 조건이 `[data-checked]` 속성인데 그건 React 가 붙이기 때문이다.
 *  · 선택지 목록이 아예 DOM 에 없다. 열 때 만들어지는 구조라서.
 *
 * 근거는 captures/2026-09-08-현장수집/당근부동산/DOM-전수조사.md.
 * 이벤트는 전부 위임(delegation)으로 건다. 관리비처럼 통째로 갈아끼우는 곳이 있어서
 * 요소마다 직접 걸면 교체 후 죽어버린다.
 */
(function () {
  "use strict";
  var T = window.__FLR_TEMPLATES__ || {};
  var body = document.body;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ── 1. 체크 표시 되살리기 ─────────────────────────────────
   * CSS 규칙이 `.seed-checkmark__root[data-checked]{...}` 이므로
   * 속성만 붙이면 스타일은 알아서 따라온다. 아이콘 SVG 는 DOM 에 없어서 넣어 준다.
   */
  function markOf(label) {
    return $('[class*="seed-checkmark__root"],[class*="seed-radiomark__root"],[class*="seed-switchmark__root"]', label);
  }
  function syncOne(input) {
    var label = input.closest("label");
    if (!label) return;
    var mark = markOf(label);
    if (!mark) return;
    var on = !!input.checked;
    var isSwitch = mark.className.indexOf("switchmark") >= 0;
    [label, mark].concat(isSwitch ? $$("[class*=switchmark__thumb]", mark) : [])
      .forEach(function (el) { if (on) el.setAttribute("data-checked", ""); else el.removeAttribute("data-checked"); });
    if (isSwitch) return;                       // 스위치는 안쪽 thumb 를 지우면 안 된다
    var icon = input.type === "radio" ? T.radioIcon : T.checkIcon;
    mark.innerHTML = on ? (icon || "") : "";
  }
  function syncAll(root) {
    $$('input[type=checkbox], input[type=radio]', root || document).forEach(syncOne);
  }
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || (t.type !== "checkbox" && t.type !== "radio")) return;
    if (t.type === "radio" && t.name) {
      $$('input[type=radio][name="' + CSS.escape(t.name) + '"]').forEach(syncOne);
    } else {
      syncOne(t);
    }
  }, true);

  /* ── 2. 선택지 드롭다운 (매물 종류 · 건축물 용도 · 방향) ────
   * 실제 화면은 팝업이 아니라 그 칸 안에서 아래로 펼쳐진다(§3-4).
   * 선택지 버튼의 클래스는 관측된 것 그대로 쓰고, 감싸는 상자만 이쪽에서 만든다.
   */
  var LIST_ATTR = "data-flr-list";
  function closeLists(except) {
    $$("[" + LIST_ATTR + "]").forEach(function (l) { if (l !== except) l.remove(); });
  }
  function displayOf(root) {
    return $('[class*="seed-input-button__placeholder"],[class*="seed-input-button__value"]', root);
  }
  function openList(trigger) {
    var name = trigger.getAttribute("name");
    var items = (T.catalog || {})[name];
    if (!items) return;
    var root = trigger.parentElement;                     // .seed-input-button__root
    var host = root.parentElement;                        // .seed-field__root
    if ($("[" + LIST_ATTR + "]", host)) { closeLists(); return; }
    closeLists();
    var box = document.createElement("div");
    box.setAttribute(LIST_ATTR, name);
    box.style.cssText = "margin-top:6px;border:1px solid var(--seed-color-stroke-neutral-weak,#e5e5e5);" +
      "border-radius:10px;overflow:auto;max-height:320px;background:var(--seed-color-bg-layer-default,#fff);";
    items.forEach(function (t) {
      var w = document.createElement("div");
      w.className = "t4-regular w-full";
      var b = document.createElement("button");
      b.type = "button";
      b.className = T.optionCls || "";
      b.textContent = t;
      b.setAttribute("data-flr-opt", name);
      w.appendChild(b);
      box.appendChild(w);
    });
    host.appendChild(box);
  }
  document.addEventListener("click", function (e) {
    var opt = e.target.closest("[data-flr-opt]");
    if (opt) {
      e.preventDefault();
      var nm = opt.getAttribute("data-flr-opt");
      var trg = $('button[name="' + nm + '"]');
      var root = trg && trg.parentElement;
      var disp = root && displayOf(root);
      if (disp) {
        disp.textContent = opt.textContent;
        disp.className = disp.className.replace(/placeholder/g, "value");
      }
      // 실제 화면은 고른 뒤 aria-label 이 "…변경. 현재: X" 로 바뀐다 (§3-4)
      if (trg) {
        var base = (trg.getAttribute("aria-label") || "").replace(/\s*(선택|변경\. 현재:.*)$/, "");
        trg.setAttribute("aria-label", base + " 변경. 현재: " + opt.textContent);
      }
      closeLists();
      document.dispatchEvent(new CustomEvent("flr:pick", { detail: { name: nm, text: opt.textContent } }));
      return;
    }
    var trigger = e.target.closest('button[name="salesType"],button[name="buildingUsage"],button[name="buildingOrientation"]');
    if (trigger) { e.preventDefault(); openList(trigger); return; }
    if (!e.target.closest("[" + LIST_ATTR + "]")) closeLists();
  }, true);

  /* ── 3. 거래 유형 → 가격 블록 (§6-2) ───────────────────────
   * s2 스냅샷에 5종이 전부 펼쳐져 있어 그대로 떼어 왔다.
   * trades.N 의 N 이 화면 순서인지 선택 순서인지는 원본 캡처로 확정되지 않았다.
   * 그래서 인덱스를 계산하지 않고, 체크된 유형의 블록을 화면 순서대로 보여 준다.
   */
  var TRADES = ["월세", "매매", "전세", "연세", "단기"];
  function labelOf(input) {
    var l = input.closest("label"), s = l && $('[class*="seed-checkbox__label"]', l);
    return s ? s.textContent.trim() : "";
  }
  function priceHost() {
    var any = $('input[name="trades"]');
    if (!any) return null;
    var row = any.closest("label").parentElement.parentElement.parentElement;
    var h = $('[data-flr="prices"]', row.parentElement);
    if (!h) {
      h = document.createElement("div");
      h.setAttribute("data-flr", "prices");
      h.style.cssText = "display:flex;flex-direction:column;gap:24px;margin-top:20px;";
      row.parentElement.appendChild(h);
    }
    return h;
  }
  function renderPrices() {
    var host = priceHost(); if (!host) return;
    var checked = $$('input[name="trades"]').filter(function (i) { return i.checked; })
      .map(labelOf).filter(function (t) { return TRADES.indexOf(t) >= 0; });
    host.innerHTML = "";
    TRADES.forEach(function (t) {
      if (checked.indexOf(t) < 0) return;
      var html = (T.priceBlocks || {})[t];
      if (!html) return;
      var d = document.createElement("div");
      d.innerHTML = html;
      host.appendChild(d);
    });
    syncAll(host);
  }
  document.addEventListener("change", function (e) {
    if (e.target && e.target.name === "trades") renderPrices();
  }, true);

  /* ── 4. 관리비 — 「10만원 미만…」 체크로 갈래가 갈린다 (§6-3) ─
   * s1(항목별 상세) ↔ s2(총 관리비 + 포함 항목) 본문을 통째로 갈아끼운다.
   * 실제로도 그 체크 하나에 관리비 본문이 통째로 다시 그려진다.
   */
  function mgmtBody() {
    var h2 = $$("h2").filter(function (x) { return x.textContent.trim() === "관리비"; })[0];
    if (!h2) return null;
    var sec = h2.parentElement;
    while (sec && sec.querySelectorAll("input").length < 5) sec = sec.parentElement;
    if (!sec) return null;
    var kids = Array.prototype.filter.call(sec.children, function (c) { return c.tagName === "DIV"; });
    return kids[1] || null;
  }
  function isUnderTenMan(input) {
    var l = input.closest("label"), s = l && $('[class*="seed-checkbox__label"]', l);
    return !!s && s.textContent.indexOf("10만원 미만") === 0;
  }
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || t.type !== "checkbox" || !isUnderTenMan(t)) return;
    var body2 = mgmtBody(); if (!body2) return;
    var html = t.checked ? T.mgmtSimple : T.mgmtDetailed;
    if (!html) return;
    var holder = document.createElement("div");
    holder.innerHTML = html;
    var fresh = holder.firstElementChild;
    if (fresh) { body2.replaceWith(fresh); syncAll(fresh); }
  }, true);

  /* ── 5. 재현하지 않은 곳은 눌러도 안내만 ───────────────────── */
  var GUARD = [
    ["주소 검색", 'button[name="address"]',
     "실제 당근은 여기서 모달을 띄우고 주소 검색 → 결과 선택 → 상세주소 입력 3단계를 거칩니다. " +
     "검색 결과에 중개사무소의 최근 취급 주소가 섞여 있어 재현본에는 넣지 않았습니다. (§7)"],
    ["사진", 'input#image-upload', "사진·평면도·동영상 업로드는 서버가 하는 일이라 재현하지 않았습니다."],
    ["등록", null, null]
  ];
  var addr = $('button[name="address"]');
  if (addr) addr.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); notice(GUARD[0][2]); }, true);
  $$("button").forEach(function (b) {
    var t = b.textContent.trim();
    if (t === "매물 등록하기" || t === "임시저장") {
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        alert("재현본입니다. 실제로 등록되지 않습니다.");
      }, true);
    }
    if (t === "기존 매물 불러오기" || t === "간편 매물 등록" || t === "엑셀 매물 등록") {
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        notice("「" + t + "」는 서버에서 데이터를 받아오는 기능이라 재현하지 않았습니다.");
      }, true);
    }
  });

  /* ── 6. 시작 상태 맞추기와 표식 ───────────────────────────── */
  syncAll();                                  // 스냅샷에 이미 checked 인 것들(관리비 기본값 등) 표시
  renderPrices();

  var tag = document.createElement("div");
  tag.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:100000;background:#111827;color:#fff;" +
    "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;padding:8px 12px;" +
    "border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:340px;";
  tag.innerHTML = "<b>재현본</b> — 당근부동산 매물 등록폼 (2026-09-08 스냅샷)<br>" +
    "<span style='opacity:.75'>실제 사이트가 아닙니다. 체크 표시·선택지 목록·가격칸·관리비 갈래만 " +
    "되살렸습니다. 재현하지 않은 것은 README 참조.</span>";
  body.appendChild(tag);

  var toast = null;
  function notice(msg) {
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:100001;max-width:380px;" +
      "background:#1f2937;color:#fff;padding:12px 14px;border-radius:10px;" +
      "font:13px/1.6 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;" +
      "box-shadow:0 10px 26px rgba(0,0,0,.35);";
    toast.textContent = msg;
    body.appendChild(toast);
    setTimeout(function () { if (toast) { toast.remove(); toast = null; } }, 7000);
  }
})();
