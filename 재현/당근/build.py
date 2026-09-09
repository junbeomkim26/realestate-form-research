#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""당근부동산 매물 등록폼 재현본 만들기.

당근은 셋 중 가장 까다롭다.
 · `<select>` 가 하나도 없다. 선택지는 **열 때 생성되는 `<button>` 그리드**라
   닫힌 스냅샷에는 선택지가 한 개도 없다.
 · 체크 표시는 `[data-checked]` 속성으로 켜지는데 그 속성은 React 가 붙인다.
   스냅샷에서는 라벨을 눌러 숨은 input 이 토글돼도 **눈에 보이는 변화가 없다.**
 · 체크 아이콘 SVG 자체가 DOM 에 없다 (켜질 때 주입된다).

공여자는 **필드로그의 상태 스냅샷 2개**다. 이것은 조각이 아니라 그 시점의 문서 전체다.
 · s1 (시작) — 아무것도 안 고른 상태 + 관리비 "항목별 상세" 갈래
 · s2 (정지) — 거래유형 5개 다 체크된 가격 블록 + 관리비 "간단" 갈래 + 켜진 체크 아이콘

    python3 재현/당근/build.py
"""
import json, os, re, sys
from bs4 import BeautifulSoup

# 실제 주소·단지명을 여기에 적으면 이 스크립트 자체가 개인정보를 담게 된다.
# 특정 값 대신 "도로명+번길/번지" 꼴과 "○○아파트/맨션/빌라" 꼴을 일반 패턴으로 잡는다.
RE_ADDR = r"[가-힣]{2,6}(?:로|길)\s?\d+(?:번길)?\s?\d|[가-힣]{2,8}(?:아파트|맨션|빌라|푸르지오|자이|힐스테이트)"

HERE = os.path.dirname(os.path.abspath(__file__))
CAP  = os.path.normpath(os.path.join(HERE, "..", "..", "captures", "2026-09-08-현장수집", "당근부동산"))
BASE = os.path.join(CAP, "singlefile", "당근_매물등록폼.html")
LOG  = os.path.join(CAP, "fieldlog_capture_realty.daangn.com_2026-09-08T12-26.json")
OUT  = os.path.join(HERE, "당근_매물등록폼_재현.html")

# DOM-전수조사.md §8 의 선택지 카탈로그. 순서는 clickables 의 nth-child 로 확정한 실제 화면 순서다.
CATALOG = {
    "salesType": ["오픈형 원룸", "분리형 원룸", "아파트", "빌라(투룸 이상)", "오피스텔",
                  "단독/전원주택", "상가", "사무실", "건물", "공장/창고", "토지"],
    "buildingUsage": ["공동주택", "단독주택", "제1종 근린생활시설", "제2종 근린생활시설", "업무시설",
                      "숙박시설", "문화 및 집회시설", "종교시설", "판매시설", "운수시설", "의료시설",
                      "교육연구시설", "노유자시설", "수련시설", "운동시설", "위락시설", "공장",
                      "창고시설", "야영장시설", "자원순환 관련 시설", "교정시설", "방송통신시설",
                      "발전시설", "묘지 관련 시설", "관광 휴게시설", "장례식장", "자동차 관련 시설",
                      "위험물 저장 및 처리 시설", "동물 및 식물 관련 시설"],
    "buildingOrientation": ["남향", "동향", "서향", "북향", "남동향", "남서향", "북서향", "북동향"],
}
# 선택지 버튼의 실제 클래스 — a11 의 조작 문맥에서 그대로 관측된 것
OPTION_CLS = "flex w-full items-center px-x3 py-x2 t4-regular text-fg-neutral hover:bg-bg-neutral-weak"

for p in (BASE, LOG):
    if not os.path.exists(p):
        sys.exit("원본이 없다: %s" % p)


def scrub(node):
    for el in node.find_all(["input", "textarea"]):
        if el.get("type") in ("checkbox", "radio"):
            el.attrs.pop("checked", None)
        else:
            el["value"] = ""
        if el.name == "textarea":
            el.string = ""
    for d in node.select("[data-checked]"):
        del d["data-checked"]
    for d in node.select("[class*=seed-checkmark__root], [class*=seed-radiomark__root]"):
        d.clear()
    return node


def main():
    base = BeautifulSoup(open(BASE, encoding="utf-8").read(), "lxml")
    pg = json.load(open(LOG, encoding="utf-8"))["pages"][1]
    S = {s["id"]: BeautifulSoup(s["dom"]["html"], "lxml") for s in pg["states"]}
    s1, s2 = S["s1"], S["s2"]
    T = {}

    # ① 켜진 체크박스 / 라디오의 마크 안쪽 (아이콘 SVG)
    cb = next((i for i in s2.select("input[type=checkbox]") if i.has_attr("checked")), None)
    if cb:
        mark = cb.find_parent("label").select_one('[class*="seed-checkmark__root"]')
        T["checkIcon"] = "".join(str(c) for c in mark.contents) if mark else ""
    # 라디오 아이콘은 원본 스냅샷 안에 이미 있다.
    # 관리비 항목별 「쓴 만큼」이 기본 선택이라 그 7개는 아이콘을 달고 저장됐다.
    rmark = next((m for m in base.select('[class*="seed-radiomark__root"]') if m.find("svg")), None)
    T["radioIcon"] = "".join(str(c) for c in rmark.contents) if rmark else ""

    # ② 거래 유형별 가격 블록 (s2 는 5종이 전부 펼쳐져 있다)
    blocks = {}
    for sp in s2.find_all("span"):
        if "t4-bold" not in " ".join(sp.get("class", [])):
            continue
        t = sp.get_text(strip=True)
        if t in ("월세", "매매", "전세", "연세", "단기") and t not in blocks:
            blk = sp.parent.parent
            if blk.select('input[name^="trades."]'):
                blocks[t] = str(scrub(blk))
    T["priceBlocks"] = blocks

    # ③ 관리비 두 갈래 — 섹션 본문을 통째로
    def mgmt_body(soup):
        h2 = next((x for x in soup.find_all("h2") if x.get_text(strip=True) == "관리비"), None)
        if not h2:
            return ""
        sec = h2.parent
        while sec is not None and len(sec.find_all("input")) < 5:
            sec = sec.parent
        kids = sec.find_all("div", recursive=False) if sec else []
        return str(kids[1]) if len(kids) > 1 else ""
    T["mgmtDetailed"] = mgmt_body(s1)      # 10만원 미만 OFF — 항목별 정액/쓴만큼
    T["mgmtSimple"] = mgmt_body(s2)        # 10만원 미만 ON  — 총 관리비 + 포함 항목

    T["catalog"] = CATALOG
    T["optionCls"] = OPTION_CLS

    missing = [k for k in ("checkIcon", "radioIcon", "mgmtDetailed", "mgmtSimple") if not T.get(k)]
    if missing or len(blocks) != 5:
        print("  ! 못 찾은 조각: %s  가격블록 %d/5" % (missing, len(blocks)))

    # 개인정보 방어
    joined = json.dumps(T, ensure_ascii=False)
    for pat, name in ((r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}", "휴대폰"),
                      (r"[가-힣]{2,10}공인중개사", "중개사무소명"),
                      (RE_ADDR, "실주소·단지명")):
        if re.search(pat, joined):
            sys.exit("공여 조각에 %s 가 섞였다. scrub() 를 고칠 것." % name)

    # ④ 개인정보 가리기 — 재현본은 공유용이라 원본 스냅샷에 남은 사무소 정보를 지운다.
    #    폼 구조와 무관한 값들이라 가려도 재현에 영향이 없다.
    masked = 0
    for chip in base.select('[class*="seed-chip__label"]'):
        chip.string = "최근 주소 %d" % (masked + 1); masked += 1
    for el in base.find_all(string=re.compile(r"01[016789]-\d{3,4}-\d{4}")):
        el.replace_with(re.sub(r"01[016789]-\d{3,4}-\d{4}", "010-****-****", str(el)))
    office = 0
    for el in base.find_all(string=re.compile(r"[가-힣]{2,10}공인중개사")):
        el.replace_with(re.sub(r"[가-힣]{2,10}공인중개사(사무소)?", "○○공인중개사사무소", str(el))); office += 1
    # 텍스트뿐 아니라 alt·title·aria-label 같은 속성에도 사무소명이 박혀 있다
    for el in base.find_all(True):
        for a in ("alt", "title", "aria-label"):
            v = el.get(a)
            if v and re.search(r"[가-힣]{2,10}공인중개사", str(v)):
                el[a] = re.sub(r"[가-힣]{2,10}공인중개사(사무소)?", "○○공인중개사사무소", str(v)); office += 1
    print("  개인정보 가림: 최근주소 칩 %d개 · 사무소명 %d곳 · 전화번호" % (masked, office))

    live = open(os.path.join(HERE, "live.js"), encoding="utf-8").read()
    tag = base.new_tag("script")
    tag.string = ("window.__FLR_TEMPLATES__ = %s;\n" % json.dumps(T, ensure_ascii=False)) + live
    (base.find("body") or base.find("html")).append(tag)

    html = str(base)
    # 010-1234-1234 는 집주인 전화번호 칸의 예시 placeholder 다. 폼의 일부이므로 가리지 않는다.
    leftovers = [n for n in set(re.findall(r"01[016789]-\d{3,4}-\d{4}", html)) if n != "010-1234-1234"]
    if leftovers:
        sys.exit("재현본에 실제 전화번호가 남았다: %s" % leftovers)
    if re.search(RE_ADDR, html):
        sys.exit("재현본에 실주소·단지명·사무소명이 남았다. 가리기를 고칠 것.")
    open(OUT, "w", encoding="utf-8").write(html)
    print("만들었다: %s  (%.1fMB)" % (OUT, len(html.encode()) / 1048576))
    print("  체크아이콘 %d자 · 라디오아이콘 %d자" % (len(T.get("checkIcon", "")), len(T.get("radioIcon", ""))))
    print("  가격블록 %s" % ", ".join("%s %d자" % (k, len(v)) for k, v in blocks.items()))
    print("  관리비 상세 %d자 · 간단 %d자" % (len(T["mgmtDetailed"]), len(T["mgmtSimple"])))
    print("  선택지 카탈로그 %s" % ", ".join("%s %d개" % (k, len(v)) for k, v in CATALOG.items()))


if __name__ == "__main__":
    main()
