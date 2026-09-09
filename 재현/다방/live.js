/* 다방 매물 등록폼 — 정적 스냅샷 되살리기
 *
 * 다방 스냅샷은 직방과 사정이 다르다. script 는 똑같이 0개지만,
 * 다방은 네이티브 <select> · <input type=radio|checkbox> 를 쓰기 때문에
 * **드롭다운·라디오·체크박스는 손대지 않아도 브라우저가 알아서 동작한다.**
 * (select 12 · radio 22 · checkbox 46 · text 17 · textarea 2)
 *
 * 죽어 있는 것은 <button> 25개뿐이다. 여기서는 그중 관측된 동작이 있는 것만 되살린다.
 * 근거는 captures/2026-09-08-현장수집/다방/DOM-전수조사.md.
 */
(function () {
  "use strict";
  var T = window.__FLR_TEMPLATES__ || {};
  var body = document.body;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function labelOf(input) {
    var l = input.closest("label"), p = l && l.querySelector("p");
    return p ? p.textContent.trim() : "";
  }
  function rowOf(el) {                       // 다방은 표 레이아웃이다. tr 이 곧 한 필드 그룹
    var tr = el.closest("tr"), th = tr && tr.querySelector("th h1");
    return { tr: tr, name: th ? th.textContent.replace(/\*$/, "").trim() : "" };
  }
  function rowByName(name) {
    var tr = $$("table tr").find(function (r) {
      var h = r.querySelector("th h1");
      return h && h.textContent.replace(/\*$/, "").trim() === name;
    });
    return tr || null;
  }

  /* ── 1. 대분류 버튼 (주택/빌라 · 오피스텔 · 아파트) ────────
   * 선택 여부를 알려주는 속성이 없다. styled-components 가 만든 클래스가
   * 선택된 것만 다르다. 그 값은 빌드마다 바뀌는 해시라 하드코딩하지 않고,
   * 지금 화면에서 "혼자 다른 클래스를 쓰는 버튼"을 보고 알아낸다. (§8-3)
   */
  var majors = $$("button").filter(function (b) {
    return (b.className || "").indexOf("styled__Btn-sc-") >= 0;
  });
  if (majors.length >= 2) {
    var tally = {};
    majors.forEach(function (b) {
      var k = b.className.split(/\s+/).filter(function (c) { return c.indexOf("styled__") < 0; }).join(" ");
      tally[k] = (tally[k] || 0) + 1;
    });
    var keys = Object.keys(tally);
    var OFF = keys.reduce(function (a, b) { return tally[a] >= tally[b] ? a : b; });  // 많은 쪽이 꺼진 모습
    var ON = keys.filter(function (k) { return k !== OFF; })[0] || OFF;
    var stem = majors[0].className.split(/\s+/).filter(function (c) { return c.indexOf("styled__") === 0; }).join(" ");
    majors.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        majors.forEach(function (m) { m.className = stem + " " + OFF; });
        b.className = stem + " " + ON;
        notice("대분류를 「" + b.textContent.trim().split("\n")[0] + "」로 바꾸면 실제 폼은 소분류·주소·면적 칸이 통째로 교체됩니다. " +
               "그 화면은 스냅샷에 없어 재현하지 않았습니다. (DOM-전수조사.md §6-2)");
      });
    });
  }

  /* ── 2. 달력 ─────────────────────────────────────────────
   * 입력칸 옆 아이콘 버튼을 누르면 열린다. 원본 마크업은 필드로그가
   * 열려 있던 상태로 기록해 둔 것을 그대로 쓴다. 날짜 격자만 다시 그린다. (§8-4)
   */
  var openCal = null;
  function closeCal() { if (openCal) { openCal.remove(); openCal = null; } }
  document.addEventListener("click", function (e) {
    if (openCal && !openCal.contains(e.target) && !e.target.closest("[data-flr=calbtn]")) closeCal();
  }, true);

  function buildCal(input, y, m) {           // m: 0-11
    var wrap = document.createElement("div");
    wrap.innerHTML = T.calendar || "";
    var root = wrap.firstElementChild;
    if (!root) return null;
    var grid = root.querySelector('ul[class*="DateGrid"]');
    var sample = grid && grid.querySelector("button");
    if (!grid || !sample) return null;
    var btnCls = sample.className;

    var cur = root.querySelector('[class*="CurrentDate"]');
    if (cur) {
      var bs = cur.querySelectorAll("button");
      if (bs[0]) bs[0].textContent = y;
      if (bs[1]) bs[1].textContent = ("0" + (m + 1)).slice(-2);
    }
    grid.innerHTML = "";
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    for (var i = 0; i < first; i++) grid.appendChild(document.createElement("li"));
    for (var d = 1; d <= days; d++) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.className = btnCls; b.textContent = d;
      (function (day) {
        b.addEventListener("click", function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          input.value = y + "." + ("0" + (m + 1)).slice(-2) + "." + ("0" + day).slice(-2);
          closeCal();
        });
      })(d);
      li.appendChild(b); grid.appendChild(li);
    }
    var navs = root.querySelectorAll('[class*="Header"] > button');
    if (navs[0]) navs[0].onclick = function (e) { e.preventDefault(); e.stopPropagation(); reopen(input, m ? y : y - 1, m ? m - 1 : 11); };
    if (navs[1]) navs[1].onclick = function (e) { e.preventDefault(); e.stopPropagation(); reopen(input, m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1); };
    var today = root.querySelector('[class*="TodayBtn"]');
    if (today) today.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      var n = new Date();
      input.value = n.getFullYear() + "." + ("0" + (n.getMonth() + 1)).slice(-2) + "." + ("0" + n.getDate()).slice(-2);
      closeCal();
    };
    return root;
  }
  function reopen(input, y, m) {
    var r = input.getBoundingClientRect();
    closeCal();
    var el = buildCal(input, y, m);
    if (!el) return;
    el.style.cssText = "position:absolute;z-index:99999;background:#fff;border:1px solid #e4e4e7;" +
      "border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.16);padding:8px;" +
      "left:" + (r.left + scrollX) + "px;top:" + (r.bottom + scrollY + 6) + "px;";
    body.appendChild(el); openCal = el;
  }
  $$('button[class*="RightIconBtn"]').forEach(function (b) {
    var input = b.parentElement && b.parentElement.querySelector('input[type=text]');
    if (!input) return;
    b.setAttribute("data-flr", "calbtn");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (openCal) { closeCal(); return; }
      var mt = /^(\d{4})\.(\d{2})/.exec(input.value || "");
      var n = new Date();
      reopen(input, mt ? +mt[1] : n.getFullYear(), mt ? +mt[2] - 1 : n.getMonth());
    });
  });

  /* ── 3. 조건부 (전부 DOM-전수조사.md §6 근거) ───────────── */

  // §6-4 단기임대 체크 → 개월 / 협의 여부 select 두 개  [a97 / a105]
  var shortCb = $$('input[type=checkbox]').find(function (i) { return labelOf(i) === "단기임대"; });
  if (shortCb) shortCb.addEventListener("change", function () {
    var row = rowByName("거래 종류"); if (!row) return;
    var old = row.querySelector('[data-flr="shortlease"]');
    if (old) old.remove();
    if (shortCb.checked && T.shortLease) {
      var d = document.createElement("div");
      d.setAttribute("data-flr", "shortlease");
      d.style.cssText = "display:flex;gap:8px;margin-top:10px;";
      d.innerHTML = T.shortLease;
      (shortCb.closest("td") || row.querySelector("td")).appendChild(d);
    }
  });

  // §6-4 LH 전세임대 = 가능 → 필수 동의 체크박스  [a114 / a123]
  $$('input[name=isLhLease]').forEach(function (r) {
    r.addEventListener("change", function () {
      var row = rowByName("LH 전세임대 여부"); if (!row) return;
      var old = row.querySelector('[data-flr="lh"]');
      if (old) old.remove();
      if (labelOf(r) === "가능" && r.checked && T.lhAgree) {
        var d = document.createElement("div");
        d.setAttribute("data-flr", "lh");
        d.style.marginTop = "10px";
        d.innerHTML = T.lhAgree;
        row.querySelector("td").appendChild(d);
      }
    });
  });

  // §6-3 미등기건물 체크 → 매매 거래가 막힌다 (스냅샷도 이 상태로 굳어 있다)
  var unreg = $$('input[type=checkbox]').find(function (i) { return labelOf(i).indexOf("미등기건물") === 0; });
  if (unreg) unreg.addEventListener("change", function () {
    var sale = $$('input[type=radio]').find(function (i) { return labelOf(i) === "매매"; });
    if (!sale) return;
    sale.disabled = unreg.checked;
    var p = sale.closest("label").querySelector("p");
    if (p) p.style.opacity = unreg.checked ? .4 : 1;
    if (unreg.checked && sale.checked) {
      var jeonse = $$('input[type=radio]').find(function (i) { return labelOf(i) === "전세"; });
      if (jeonse) { jeonse.checked = true; jeonse.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });

  // §6-4 거래 종류 → 월세 칸. 전세면 감춘다 (보증금만 남는다)
  $$('input[type=radio]').forEach(function (r) {
    var t = labelOf(r);
    if (t !== "매매" && t !== "전세" && t !== "월세") return;
    r.addEventListener("change", function () {
      if (!r.checked) return;
      var rent = $('input[name=price]');
      var cell = rent && rent.closest("td") ? rent.closest("div") : null;
      if (rent) {
        var box = rent.closest('[class*="Container"]') || rent.parentElement;
        box.style.display = (t === "월세") ? "" : "none";
      }
    });
  });

  /* ── 4. 제출·검색 봉인 ──────────────────────────────────── */
  $$("form").forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); }); });
  var submit = document.getElementById("submit");
  if (submit) submit.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    alert("재현본입니다. 실제로 등록되지 않습니다.");
  });
  $$("button").forEach(function (b) {
    var t = b.textContent.trim();
    if (t === "검색") b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      notice("실제 다방은 여기서 별도 창을 띄우고 그 안의 카카오 우편번호 iframe 으로 주소를 찾습니다. " +
             "다른 출처의 화면이라 재현할 수 없습니다. (DOM-전수조사.md §4)");
    });
    if (t.indexOf("AI 자동생성") === 0 || t === "사진 추가" || t === "360사진 추가")
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        notice("「" + t + "」는 서버가 하는 일이라 재현하지 않았습니다.");
      });
  });

  /* ── 5. 표식과 안내 ─────────────────────────────────────── */
  var tag = document.createElement("div");
  tag.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:100000;background:#111827;color:#fff;" +
    "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;padding:8px 12px;" +
    "border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:340px;";
  tag.innerHTML = "<b>재현본</b> — 다방 매물 등록폼 (2026-09-08 스냅샷)<br>" +
    "<span style='opacity:.75'>실제 사이트가 아닙니다. 드롭다운·라디오·체크박스는 원래 " +
    "네이티브라 그대로 동작하고, 버튼 동작 일부만 되살렸습니다. 재현하지 않은 것은 README 참조.</span>";
  body.appendChild(tag);

  var toast = null;
  function notice(msg) {
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:100001;max-width:360px;" +
      "background:#1f2937;color:#fff;padding:12px 14px;border-radius:10px;" +
      "font:13px/1.6 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;" +
      "box-shadow:0 10px 26px rgba(0,0,0,.35);";
    toast.textContent = msg;
    body.appendChild(toast);
    setTimeout(function () { if (toast) { toast.remove(); toast = null; } }, 6000);
  }
})();
