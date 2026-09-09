/**
 * 필드로그 팝업 — 녹화 플래그, 프레임별 상태 기록, 정지·내보내기를 관리한다.
 * 실제 DOM 기록은 각 탭·각 프레임의 recorder.js 가 담당한다.
 */
const $ = (id) => document.getElementById(id);

// 내려받는 JSON·PNG 를 한곳에 모은다: 다운로드 폴더 안의 fieldlog/
const DOWNLOAD_DIR = "fieldlog";

let msgTimer = null;
let operationBusy = false;

function apiError() {
  const e = chrome.runtime && chrome.runtime.lastError;
  return e ? (e.message || String(e)) : "";
}

function errorText(error) {
  return (error && error.message) || String(error || "알 수 없는 오류");
}

function areaGet(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      area.get(keys, (value) => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve(value || {});
      });
    } catch (error) { reject(error); }
  });
}

function areaSet(area, value) {
  return new Promise((resolve, reject) => {
    try {
      area.set(value, () => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
}

function areaRemove(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      area.remove(keys, () => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
}

const storageGet = (keys) => areaGet(chrome.storage.local, keys);
const storageSet = (value) => areaSet(chrome.storage.local, value);
const storageRemove = (keys) => areaRemove(chrome.storage.local, keys);
const sessionGet = (keys) => areaGet(chrome.storage.session, keys);
const sessionSet = (value) => areaSet(chrome.storage.session, value);

function enableSessionForRecorders() {
  return new Promise((resolve, reject) => {
    if (!chrome.storage.session || typeof chrome.storage.session.setAccessLevel !== "function") {
      reject(new Error("이 크롬은 안전한 세션 저장소를 지원하지 않습니다 (Chrome 130 이상 필요)"));
      return;
    }
    try {
      chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }, () => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
}

function storageKeys() {
  return new Promise((resolve, reject) => {
    if (typeof chrome.storage.local.getKeys !== "function") {
      storageGet(null).then((state) => resolve(Object.keys(state)), reject);
      return;
    }
    try {
      chrome.storage.local.getKeys((keys) => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve(Array.isArray(keys) ? keys : []);
      });
    } catch (error) { reject(error); }
  });
}

function say(text, color) {
  $("msg").textContent = text;
  $("msg").style.color = color || "#6ee7b7";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $("msg").textContent = ""; }, 6500);
}

function pages(state) {
  return Object.keys(state).filter((key) => key.startsWith("p:")).sort().map((key) => {
    const rec = state[key] || {};
    const metaUrl = rec.meta && rec.meta.url;
    const legacyUrl = /^p:https?:/i.test(key) ? key.slice(2) : "(URL 정보 없음)";
    return { key, url: metaUrl || legacyUrl, rec };
  });
}

const summaryKeyForPage = (pageKey) => pageKey.startsWith("p:") ? `i:${pageKey.slice(2)}` : "";

function fieldCount(rec) {
  return Number.isFinite(rec && rec.fieldCount) ? rec.fieldCount : Object.keys((rec && rec.fields) || {}).length;
}

function actionCount(rec) {
  return Number.isFinite(rec && rec.actionCount) ? rec.actionCount : ((rec && rec.actions) || []).length;
}

function screenshots(state) {
  return Object.keys(state).filter((key) => key.startsWith("s:")).sort()
    .map((key) => state[key]).filter((value) => value && typeof value === "object");
}

async function dashboardData() {
  const keys = await storageKeys();
  const pageKeys = keys.filter((key) => key.startsWith("p:")).sort();
  const indexKeys = keys.filter((key) => key.startsWith("i:")).sort();
  const shotKeys = keys.filter((key) => key.startsWith("s:")).sort();
  const indexedPages = new Set(indexKeys.map((key) => `p:${key.slice(2)}`));
  const unindexedPages = pageKeys.filter((key) => !indexedPages.has(key));
  const wanted = ["fl_note", "fl_mask", ...indexKeys, ...shotKeys, ...unindexedPages];
  const state = await storageGet(wanted);
  const pageItems = [];

  for (const key of indexKeys) {
    const summary = state[key];
    if (!summary || typeof summary !== "object") continue;
    const storageKey = summary.storageKey || `p:${key.slice(2)}`;
    if (!pageKeys.includes(storageKey)) continue;
    pageItems.push({
      key: storageKey,
      url: summary.url || "(URL 정보 없음)",
      rec: {
        fieldCount: Number(summary.fieldCount) || 0,
        actionCount: Number(summary.actionCount) || 0,
        stateCount: Number(summary.stateCount) || 0,
        meta: {
          schemaVersion: summary.schemaVersion,
          maskValues: summary.maskValues,
          captureId: summary.captureId,
          frame: summary.frame,
          chromeFrameId: summary.chromeFrameId,
          chromeDocumentId: summary.chromeDocumentId,
        },
      },
    });
  }

  for (const key of unindexedPages) {
    const rec = state[key] || {};
    const metaUrl = rec.meta && rec.meta.url;
    const legacyUrl = /^p:https?:/i.test(key) ? key.slice(2) : "(URL 정보 없음)";
    pageItems.push({ key, url: metaUrl || legacyUrl, rec });
  }

  pageItems.sort((a, b) => a.key.localeCompare(b.key));
  return {
    note: state.fl_note || "",
    mask: state.fl_mask === true,
    pageItems,
    shots: shotKeys.map((key) => state[key]).filter((value) => value && typeof value === "object"),
    keys,
  };
}

function stateCount(rec) {
  if (Number.isFinite(rec && rec.stateCount)) return rec.stateCount;
  if (Array.isArray(rec && rec.states)) return rec.states.length;
  if (rec && rec.states && typeof rec.states === "object") return Object.keys(rec.states).length;
  return 0;
}

function privacySummary(items, screenshotCount = 0) {
  const result = { maskedPages: 0, plainPages: 0, unknownPages: 0, unmaskedScreenshots: screenshotCount };
  for (const item of items) {
    const value = item.rec && item.rec.meta && item.rec.meta.maskValues;
    if (value === true) result.maskedPages++;
    else if (value === false) result.plainPages++;
    else result.unknownPages++;
  }
  return result;
}

function maskSummary(items) {
  const p = privacySummary(items);
  if (p.maskedPages === items.length && items.length) return true;
  if (p.plainPages === items.length && items.length) return false;
  if (p.unknownPages === items.length && items.length) return "unknown";
  return "mixed";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function activeTab() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const error = apiError();
        if (error) return reject(new Error(error));
        const tab = tabs && tabs[0];
        if (!tab || tab.id === undefined) return reject(new Error("활성 탭을 찾지 못했습니다"));
        resolve(tab);
      });
    } catch (error) { reject(error); }
  });
}

function allTabs() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({}, (tabs) => {
        const error = apiError();
        if (error) reject(new Error(error));
        else resolve((tabs || []).filter((tab) => tab && Number.isInteger(tab.id)));
      });
    } catch (error) { reject(error); }
  });
}

// 특정 플랫폼에 묶지 않는다. manifest 의 content_scripts 가 http/https 전체에
// 주입되므로, 팝업도 프로토콜만 보고 "레코더가 들어가 있을 프레임"을 판정한다.
function directlyRecorded(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }
  catch (_) { return false; }
}

// 녹화를 시작한 탭에 실제로 떠 있는 origin 들. 이후 같은 사이트로 이동하거나
// 새 창이 열려도 이 목록에 있으면 레코더가 스스로 이어서 기록한다.
async function originsInTab(tabId) {
  const frames = await framesInTab(tabId);
  const origins = new Set();
  for (const frame of frames) {
    try {
      const parsed = new URL(frame.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") origins.add(parsed.origin);
    } catch (_) { /* about:blank·data: 등은 부모를 따라간다 */ }
  }
  return [...origins];
}

function fallbackUrl(url) {
  return /^(about:(blank|srcdoc)|data:|blob:|filesystem:)/i.test(String(url || ""));
}

function expectedFrameIds(frames) {
  const list = (frames || []).filter((frame) => frame && Number.isInteger(frame.frameId));
  const byId = new Map(list.map((frame) => [frame.frameId, frame]));
  const memo = new Map();
  function eligible(frame, seen = new Set()) {
    if (memo.has(frame.frameId)) return memo.get(frame.frameId);
    if (directlyRecorded(frame.url)) { memo.set(frame.frameId, true); return true; }
    if (!fallbackUrl(frame.url) || frame.parentFrameId == null || frame.parentFrameId < 0 || seen.has(frame.frameId)) {
      memo.set(frame.frameId, false); return false;
    }
    seen.add(frame.frameId);
    const parent = byId.get(frame.parentFrameId);
    const result = !!(parent && eligible(parent, seen));
    memo.set(frame.frameId, result);
    return result;
  }
  return new Set(list.filter((frame) => eligible(frame)).map((frame) => frame.frameId));
}

function framesInTab(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
        const error = apiError();
        if (error) reject(new Error(error));
        else {
          const list = (frames || []).filter((frame) => frame && Number.isInteger(frame.frameId));
          const expected = expectedFrameIds(list);
          resolve(list.map((frame) => Object.assign({}, frame, { expected: expected.has(frame.frameId) })));
        }
      });
    } catch (error) { reject(error); }
  });
}

function messageError(message, kind, receiver, response) {
  const error = new Error(message);
  error.kind = kind;
  error.receiver = !!receiver;
  error.response = response;
  return error;
}

function noReceiverMessage(message) {
  return /receiving end does not exist|could not establish connection/i.test(String(message || ""));
}

function sendFrameMessage(tabId, frame, message, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject,
      messageError(`프레임 ${frame.frameId} 응답 시간 초과`, "timeout", false)), timeoutMs);
    try {
      const documentId = typeof frame.documentId === "string" && frame.documentId ? frame.documentId : undefined;
      const payload = Object.assign({}, message, { frameId: frame.frameId, documentId });
      const options = documentId ? { documentId } : { frameId: frame.frameId };
      chrome.tabs.sendMessage(tabId, payload, options, (response) => {
        const error = apiError();
        if (error) return finish(reject, messageError(
          `프레임 ${frame.frameId}: ${error}`,
          noReceiverMessage(error) ? "no-receiver" : "transport", false));
        if (!response || response.ok !== true) {
          const detail = response && response.error ? response.error : "레코더의 성공 응답이 없습니다";
          return finish(reject, messageError(`프레임 ${frame.frameId}: ${detail}`, "recorder", !!response, response));
        }
        if (!response.captureId || !response.storageKey || response.frameId !== frame.frameId) {
          return finish(reject, messageError(`프레임 ${frame.frameId}: 저장 증명이 불완전합니다`, "invalid-ack", true, response));
        }
        if (documentId && response.documentId !== documentId) {
          return finish(reject, messageError(`프레임 ${frame.frameId}: 문서가 이동했습니다`, "document-mismatch", true, response));
        }
        finish(resolve, Object.assign({
          tabId, frameId: frame.frameId, documentId,
          frameUrl: response.pageUrl || frame.url || "",
        }, response));
      });
    } catch (error) { finish(reject, error); }
  });
}

async function sendFrameWithRetry(tabId, frame, message, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await sendFrameMessage(tabId, frame, message); }
    catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw lastError;
}

async function contactListedFrames(tabId, frames, message) {
  const settled = await Promise.allSettled(frames.map((frame) => sendFrameWithRetry(tabId, frame, message)));
  const ok = [], failed = [], skipped = [];
  settled.forEach((item, index) => {
    const frame = frames[index];
    const response = item.reason && item.reason.response;
    if (item.status === "fulfilled") ok.push(item.value);
    else if (response && response.everRecorded === false) skipped.push({ frameId: frame.frameId, reason: "이 프레임은 녹화한 적이 없습니다" });
    else if (frame.expected || (item.reason && item.reason.receiver)) failed.push(errorText(item.reason));
    else skipped.push({ frameId: frame.frameId, reason: errorText(item.reason) });
  });
  return { total: ok.length + failed.length, ok, failed, skipped };
}

async function messageEveryFrame(tabId, message) {
  const frames = await framesInTab(tabId);
  if (!frames.length) throw new Error("이 탭의 프레임을 찾지 못했습니다. 대상 페이지를 새로고침하세요");
  const result = await contactListedFrames(tabId, frames, message);
  if (!result.ok.length && !result.failed.length) {
    throw new Error("필드로그가 연결된 프레임을 찾지 못했습니다. 대상 페이지를 새로고침하세요");
  }
  if (result.failed.length) {
    const error = new Error(`${result.total}개 대상 프레임 중 ${result.failed.length}개 실패: ${result.failed.slice(0, 2).join(" / ")}`);
    error.frameResults = result;
    throw error;
  }
  return result.ok;
}

// scope "active" = 지금 보고 있는 탭만, "all" = 열려 있는 탭 전체.
// content script 가 모든 http/https 페이지에 들어가므로, 시작은 반드시 활성 탭으로
// 좁힌다. 그러지 않으면 열어둔 다른 탭까지 전부 녹화된다.
// scope: "active" = 지금 보고 있는 탭만 · "all" = 전부 ·
// { origins: [...] } = 그 origin 을 띄운 탭 + 활성 탭.
async function targetTabs(scope) {
  if (scope === "active") return [await activeTab()];
  const tabs = await allTabs();
  if (!scope || scope === "all" || !Array.isArray(scope.origins)) return tabs;
  const wanted = new Set(scope.origins);
  let activeId = null;
  try { activeId = (await activeTab()).id; } catch (_) { /* 활성 탭이 없어도 진행 */ }
  return tabs.filter((tab) => {
    if (activeId !== null && tab.id === activeId) return true;
    try { return wanted.has(new URL(tab.url || "").origin); } catch (_) { return false; }
  });
}

async function messageEveryRecorder(message, scope = "all") {
  let tabs;
  try { tabs = await targetTabs(scope); }
  catch (error) { return { total: 0, ok: [], failed: [`탭 조회 실패: ${errorText(error)}`], skipped: [] }; }

  const known = tabs.filter((tab) => directlyRecorded(tab.url));
  const unknown = tabs.filter((tab) => !directlyRecorded(tab.url));
  const result = { total: 0, ok: [], failed: [], skipped: [] };

  // URL이 알려진 대상 탭만 프레임 목록을 읽는다. documentId로 고정해 탐색 경쟁도 막는다.
  const knownResults = await Promise.all(known.map(async (tab) => {
    try {
      const frames = await framesInTab(tab.id);
      return await contactListedFrames(tab.id, frames, message);
    } catch (error) {
      return { total: 1, ok: [], failed: [`탭 ${tab.id} 프레임 확인 실패: ${errorText(error)}`], skipped: [] };
    }
  }));

  // origin-fallback으로 주입된 blob/data 최상위 문서는 URL만으로 찾을 수 없다.
  // 다른 탭의 URL/하위 프레임은 읽지 않고 frame 0에만 탐색 메시지를 보낸다.
  const discovered = await Promise.all(unknown.map(async (tab) => {
    const top = { frameId: 0, url: tab.url || "", expected: false };
    try { return { tab, top: await sendFrameWithRetry(tab.id, top, message), receiver: true, error: null }; }
    catch (error) { return { tab, top: null, receiver: !!(error && error.receiver), error }; }
  }));

  const discoveredResults = [];
  for (const item of discovered) {
    if (!item.receiver && !item.top) {
      result.skipped.push({ tabId: item.tab.id, frameId: 0, reason: errorText(item.error) });
      continue;
    }
    if (item.top) result.ok.push(item.top);
    else result.failed.push(errorText(item.error));
    try {
      const children = (await framesInTab(item.tab.id)).filter((frame) => frame.frameId !== 0);
      discoveredResults.push(await contactListedFrames(item.tab.id, children, message));
    } catch (error) {
      result.failed.push(`탭 ${item.tab.id} 하위 프레임 확인 실패: ${errorText(error)}`);
    }
  }

  for (const part of [...knownResults, ...discoveredResults]) {
    result.ok.push(...part.ok);
    result.failed.push(...part.failed);
    result.skipped.push(...part.skipped);
  }
  result.total = result.ok.length + result.failed.length;
  return result;
}

function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        const error = apiError();
        if (error) return reject(new Error(error));
        if (!dataUrl) return reject(new Error("캡처 결과가 비어 있습니다"));
        resolve(dataUrl);
      });
    } catch (error) { reject(error); }
  });
}

function downloadFile(options) {
  return new Promise((resolve, reject) => {
    try {
      chrome.downloads.download(options, (id) => {
        const error = apiError();
        if (error) return reject(new Error(error));
        if (id === undefined) return reject(new Error("다운로드가 시작되지 않았습니다"));
        resolve(id);
      });
    } catch (error) { reject(error); }
  });
}

function slugOf(value, fallback) {
  return (value || fallback).replace(/[^\w가-힣.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function newRequestId(prefix = "state") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function render() {
  const [dashboard, control] = await Promise.all([
    dashboardData(),
    sessionGet(["fl_on", "fl_finalizing"]),
  ]);
  const on = control.fl_on === true;
  const finalizing = control.fl_finalizing === true;
  const busy = operationBusy;

  $("state").classList.toggle("on", on);
  $("stateText").textContent = busy ? "처리 중" : (finalizing ? "정지 확인 필요" : (on ? "녹화 중" : "정지"));
  $("go").disabled = on || finalizing || busy;
  $("halt").disabled = (!on && !finalizing) || busy;
  $("halt").textContent = finalizing && !on ? "정지 확인 재시도" : "정지";
  $("note").disabled = busy;
  if (document.activeElement !== $("note")) $("note").value = dashboard.note;
  $("mask").checked = dashboard.mask;
  $("mask").disabled = on || finalizing || busy;
  $("mask").parentElement.classList.toggle("disabled", on || finalizing || busy);
  $("stateName").disabled = !on || finalizing || busy;
  $("screenshot").disabled = !on || finalizing || busy;
  $("captureState").disabled = !on || finalizing || busy;
  $("screenshotLabel").classList.toggle("disabled", !on || finalizing || busy);

  const pageItems = dashboard.pageItems;
  const shots = dashboard.shots;
  let fields = 0, actions = 0, states = 0;
  for (const page of pageItems) {
    fields += fieldCount(page.rec);
    actions += actionCount(page.rec);
    states += stateCount(page.rec);
  }
  $("nPages").textContent = pageItems.length;
  $("nFields").textContent = fields;
  $("nActs").textContent = actions;
  $("nStates").textContent = states;
  $("nScreenshots").textContent = shots.length;
  $("pages").innerHTML = pageItems.map((page) => {
    const count = fieldCount(page.rec);
    const short = String(page.url).replace(/^https?:\/\//, "").slice(0, 54);
    return `<li><span>칸 ${count} · 상태 ${stateCount(page.rec)}</span> · ${escapeHtml(short)}</li>`;
  }).join("");

  const empty = pageItems.length === 0 && shots.length === 0;
  $("save").disabled = empty || on || finalizing || busy;
  $("wipe").disabled = (empty && !dashboard.note) || on || finalizing || busy;
}

function safeRender() {
  render().catch((error) => say(`저장소 읽기 실패: ${errorText(error)}`, "#f87171"));
}

$("go").addEventListener("click", async () => {
  if (operationBusy) return;
  operationBusy = true; safeRender();
  try {
    // 세션 저장소의 fl_on 을 content script(비신뢰 컨텍스트)가 읽어야
    // 시작 뒤 새로 여는 대상 페이지도 자동으로 녹화된다.
    await enableSessionForRecorders();
    const tab = await activeTab();
    const origins = await originsInTab(tab.id);
    if (!origins.length) throw new Error("이 탭은 기록할 수 없습니다 — http/https 페이지를 연 뒤 다시 시작하세요");

    await storageSet({ fl_mask: $("mask").checked, fl_note: $("note").value.trim() });
    await sessionSet({ fl_on: true, fl_finalizing: false, fl_origins: origins, fl_started_at: new Date().toISOString() });
    const result = await messageEveryRecorder({ type: "fieldlog:start", requestId: newRequestId("start") }, "active");
    if (!result.ok.length) {
      await sessionSet({ fl_on: false, fl_finalizing: true, fl_origins: [] });
      const cleanup = await messageEveryRecorder({ type: "fieldlog:stop", requestId: newRequestId("start-rollback") }, "active");
      if (!cleanup.failed.length) await sessionSet({ fl_finalizing: false });
      throw new Error("녹화를 시작한 프레임이 없습니다 — 이 페이지를 새로고침한 뒤 다시 시작하세요");
    }
    // 광고·추적 iframe 처럼 일부 프레임이 응답하지 않아도 본문 기록은 계속한다.
    if (result.failed.length) {
      say(`녹화 시작 — ${result.ok.length}개 프레임 기록 중 · ${result.failed.length}개 프레임은 시작 확인 실패`, "#f59e0b");
    } else {
      say(`녹화 시작 — ${result.ok.length}개 프레임 · 같은 사이트 안에서는 페이지를 옮겨도 이어서 기록됩니다`);
    }
  } catch (error) { say(`녹화 시작 실패: ${errorText(error)}`, "#f87171"); }
  finally { operationBusy = false; safeRender(); }
});

$("halt").addEventListener("click", async () => {
  if (operationBusy) return;
  operationBusy = true; safeRender();
  const requestId = newRequestId("stop");
  try {
    const before = await sessionGet(["fl_origins", "fl_started_at"]);
    const origins = Array.isArray(before.fl_origins) ? before.fl_origins : [];
    const since = typeof before.fl_started_at === "string" ? before.fl_started_at : "";
    await sessionSet({ fl_on: false, fl_finalizing: true, fl_origins: [] });
    const result = await messageEveryRecorder({ type: "fieldlog:stop", requestId }, { origins });
    if (result.failed.length) {
      say(`${result.failed.length}개 프레임의 최종 저장을 확인하지 못했습니다 — 문제 탭을 닫고 정지 확인을 다시 누르세요`, "#f59e0b");
    } else {
      await sessionSet({ fl_finalizing: false });
      const frames = result.total ? ` — ${result.total}개 프레임 확인` : "";
      try {
        const { filename, fallback } = await exportRecords({ since });
        say(fallback
          ? `정지·최종 저장 완료${frames} · JSON 다운로드 API 실패, 브라우저 저장 시도: ${fallback}`
          : `정지 완료${frames} · 다운로드 폴더에 ${filename} 저장됨`,
        fallback ? "#f59e0b" : undefined);
      } catch (error) {
        // 기록이 하나도 없으면 저장할 것도 없다. 그 외 실패는 저장 버튼으로 다시 시도할 수 있다.
        say(`정지·최종 저장 완료${frames} · 자동 JSON 저장 안 됨: ${errorText(error)}`, "#f59e0b");
      }
    }
  } catch (error) {
    say(`정지 완료 확인 실패: ${errorText(error)}`, "#f87171");
  } finally {
    operationBusy = false; safeRender();
  }
});

$("note").addEventListener("change", async () => {
  try { await storageSet({ fl_note: $("note").value.trim() }); }
  catch (error) { say(`메모 저장 실패: ${errorText(error)}`, "#f87171"); }
});

$("mask").addEventListener("change", async () => {
  if ($("mask").disabled) return;
  try { await storageSet({ fl_mask: $("mask").checked }); }
  catch (error) { say(`가리기 설정 저장 실패: ${errorText(error)}`, "#f87171"); }
});

$("captureState").addEventListener("click", async () => {
  if (operationBusy) return;
  const label = $("stateName").value.trim();
  if (!label) return say("현재 상태 이름을 입력하세요", "#f59e0b");

  operationBusy = true; safeRender();
  try {
    const [state, control] = await Promise.all([
      storageGet(["fl_mask", "fl_note"]),
      sessionGet(["fl_on"]),
    ]);
    if (control.fl_on !== true) throw new Error("녹화 중일 때만 상태를 기록할 수 있습니다");
    let saveScreenshot = $("screenshot").checked;
    let screenshotDeclined = false;
    if (saveScreenshot && state.fl_mask === true) {
      const proceed = confirm("입력값 가리기는 DOM 기록에만 적용됩니다. 화면 PNG의 입력값은 가려지지 않습니다. 그래도 PNG를 저장할까요?");
      if (!proceed) { saveScreenshot = false; screenshotDeclined = true; }
    }

    const tab = await activeTab();
    const requestId = newRequestId();
    const frameResults = await messageEveryFrame(tab.id, { type: "fieldlog:capture-state", label, requestId });
    $("stateName").value = "";

    if (!saveScreenshot) {
      say(screenshotDeclined
        ? `DOM 상태 저장 완료 — ${frameResults.length}개 프레임 · PNG는 저장하지 않음`
        : `DOM 상태 저장 완료 — ${frameResults.length}개 프레임`,
      screenshotDeclined ? "#f59e0b" : undefined);
      return;
    }

    let dataUrl;
    try { dataUrl = await captureVisible(tab.windowId); }
    catch (error) {
      say(`DOM 상태 저장 완료 · 화면 PNG 캡처 실패: ${errorText(error)}`, "#f59e0b");
      return;
    }
    const filename = `${DOWNLOAD_DIR}/fieldlog_${slugOf(state.fl_note, "capture")}_${slugOf(label, "state")}_${stamp()}_${requestId.slice(-6)}.png`;
    try { await downloadFile({ url: dataUrl, filename, saveAs: false }); }
    catch (error) {
      say(`DOM 상태 저장 완료 · 화면 PNG 다운로드 실패: ${errorText(error)}`, "#f59e0b");
      return;
    }
    const metadata = {
      requestId, label, capturedAt: new Date().toISOString(),
      pageUrl: tab.url || tab.pendingUrl || "", filename,
      frames: frameResults.map(({ frameId, frameUrl, captureId, stateId }) => ({ frameId, frameUrl, captureId, stateId })),
    };
    try { await storageSet({ [`s:${requestId}`]: metadata }); }
    catch (error) {
      say(`DOM 상태와 PNG 저장 완료 · 연결 메타 저장 실패: ${errorText(error)}`, "#f59e0b");
      return;
    }
    say(`DOM 상태와 화면 PNG 저장 완료 — ${frameResults.length}개 프레임`);
  } catch (error) {
    say(`DOM 상태 기록 실패: ${errorText(error)}`, "#f87171");
  } finally {
    operationBusy = false; safeRender();
  }
});

// 정지 버튼과 저장 버튼이 같은 경로를 쓴다. 반환값의 fallback 이 비어 있지 않으면
// downloads API 가 실패해 앵커 클릭으로 대신 내려받은 것이다.
// 파일 이름에 들어갈 사이트 이름. 최상위 문서(frameId 0)를 우선하고,
// 없으면 칸이 가장 많은 기록의 호스트를 쓴다. iframe 호스트가 이름이 되면 곤란하다.
function hostOf(page) {
  try { return new URL(page.url).hostname || ""; } catch (_) { return ""; }
}

function mainHost(pageItems) {
  const isTop = (page) => {
    const meta = (page.rec && page.rec.meta) || {};
    return meta.chromeFrameId === 0 || meta.frameId === 0;
  };
  const ranked = pageItems.filter(hostOf).sort((a, b) =>
    (isTop(b) - isTop(a)) || (fieldCount(b.rec) - fieldCount(a.rec)));
  return ranked.length ? hostOf(ranked[0]) : "";
}

// since 를 주면 그 시각 이후에 갱신된 기록만 담는다. 정지 버튼은 "이번에 녹화한 것"만
// 파일로 내보내고, JSON 저장 버튼은 저장소에 쌓인 것 전체를 내보낸다.
async function exportRecords({ since = "" } = {}) {
  let objectUrl = "";
  try {
    const state = await storageGet(null);
    let pageItems = pages(state), shots = screenshots(state);
    if (since) {
      pageItems = pageItems.filter((page) => {
        const updated = page.rec && page.rec.meta && page.rec.meta.updatedAt;
        return typeof updated === "string" && updated >= since;
      });
      shots = shots.filter((shot) => typeof shot.capturedAt === "string" && shot.capturedAt >= since);
    }
    if (!pageItems.length && !shots.length) throw new Error("저장할 기록이 없습니다");
    const out = {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      note: state.fl_note || "",
      maskValues: maskSummary(pageItems),
      pageCount: pageItems.length,
      stateCount: pageItems.reduce((sum, page) => sum + stateCount(page.rec), 0),
      screenshotCount: shots.length,
      pages: pageItems.map((page) => Object.assign({ pageUrl: page.url, storageKey: page.key }, page.rec)),
      screenshots: shots,
    };
    const host = mainHost(pageItems);
    const parts = ["fieldlog", slugOf(state.fl_note, "capture")];
    if (host) parts.push(slugOf(host, "site"));
    parts.push(stamp().slice(0, 16));
    const filename = `${DOWNLOAD_DIR}/${parts.join("_")}.json`;
    objectUrl = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    try {
      await downloadFile({ url: objectUrl, filename, saveAs: false });
      return { filename, fallback: "" };
    } catch (error) {
      const a = document.createElement("a");
      a.href = objectUrl; a.download = filename; a.click();
      return { filename, fallback: errorText(error) };
    }
  } finally {
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
  }
}

$("save").addEventListener("click", async () => {
  if (operationBusy) return;
  operationBusy = true; safeRender();
  try {
    const control = await sessionGet(["fl_on"]);
    if (control.fl_on === true) throw new Error("먼저 녹화를 정지해 최종 저장을 끝내세요");
    const { filename, fallback } = await exportRecords();
    if (fallback) say(`JSON 다운로드 API 실패 — 브라우저 저장을 시도했습니다: ${fallback}`, "#f59e0b");
    else say(`저장(쌓인 기록 전체): ${filename}`);
  } catch (error) { say(`JSON 저장 실패: ${errorText(error)}`, "#f87171"); }
  finally { operationBusy = false; safeRender(); }
});

$("wipe").addEventListener("click", async () => {
  if (operationBusy) return;
  operationBusy = true; safeRender();
  try {
    const [state, control] = await Promise.all([storageGet(null), sessionGet(["fl_on"])]);
    if (control.fl_on === true) throw new Error("먼저 녹화를 정지하세요");
    const keys = Object.keys(state).filter((key) => key.startsWith("p:") || key.startsWith("s:"));
    if (!keys.length) return;
    const pageItems = pages(state), shots = screenshots(state);
    const states = pageItems.reduce((sum, page) => sum + stateCount(page.rec), 0);
    if (!confirm(`기록 ${pageItems.length}개 · 상태 ${states}개 · 화면 PNG 메타 ${shots.length}개를 모두 지웁니다. 내려받은 PNG 파일은 지워지지 않습니다. 저장은 하셨나요?`)) return;
    await storageRemove(keys);
    say("DOM 기록과 화면 PNG 메타를 지웠습니다");
  } catch (error) { say(`기록 지우기 실패: ${errorText(error)}`, "#f87171"); }
  finally { operationBusy = false; safeRender(); }
});

chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local" || area === "session") safeRender(); });
safeRender();
setInterval(safeRender, 1500);
