#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""다방 매물 등록폼 재현본 만들기.

다방 스냅샷은 SingleFile 이 두 번 저장되지 않아 공여용 정적 파일이 없다.
대신 **필드로그 기록 안의 DOM 조각**을 공여자로 쓴다.
조작 기록에는 조작 시점의 주변 DOM(`actions[].before/after.targetContext.dom`)과
열려 있던 오버레이(달력 등)가 통째로 들어 있다. 전부 실제로 관측된 마크업이다.

    python3 재현/다방/build.py
"""
import json, os, re, sys
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
CAP  = os.path.normpath(os.path.join(HERE, "..", "..", "captures", "2026-09-08-현장수집", "다방"))
BASE = os.path.join(CAP, "singlefile", "다방_매물등록폼.html")
LOG  = os.path.join(CAP, "fieldlog_capture_pro.dabangapp.com_2026-09-08T11-49.json")
OUT  = os.path.join(HERE, "다방_매물등록폼_재현.html")

for p in (BASE, LOG):
    if not os.path.exists(p):
        sys.exit("원본이 없다: %s\n  captures/ 는 git 추적 대상이 아니다. 원본을 먼저 놓을 것." % p)


def fragments(page):
    """필드로그의 모든 DOM 조각을 (길이, 출처, html) 로 모은다."""
    out = []
    for a in page["actions"]:
        for ph in ("before", "after"):
            ctx = (a.get(ph) or {}).get("targetContext") or {}
            html = (ctx.get("dom") or {}).get("html", "")
            if html:
                out.append((len(html), "%s.%s" % (a["id"], ph), html))
            for ov in ((a.get(ph) or {}).get("overlays") or []):
                oh = (ov.get("dom") or {}).get("html", "")
                if oh:
                    out.append((len(oh), "%s.%s.overlay" % (a["id"], ph), oh))
    return out


def pick(frs, needle):
    """needle 이 든 조각 중 가장 큰 것."""
    hits = [f for f in frs if needle in f[2]]
    return max(hits) if hits else None


def scrub(node):
    for el in node.find_all(["input", "textarea"]):
        if el.get("type") in ("checkbox", "radio"):
            el.attrs.pop("checked", None)
        else:
            el["value"] = ""
        if el.name == "textarea":
            el.string = ""
    for op in node.find_all("option"):
        op.attrs.pop("selected", None)
    return node


def main():
    base = BeautifulSoup(open(BASE, encoding="utf-8").read(), "lxml")
    page = json.load(open(LOG, encoding="utf-8"))["pages"][2]
    frs = fragments(page)
    T, src = {}, {}

    # 달력 — 열려 있던 오버레이에서 통째로
    cal = pick(frs, "DateGrid")
    if cal:
        T["calendar"] = cal[2]; src["calendar"] = cal[1]

    # 단기임대 개월 / 협의 여부 select 두 개
    st = pick(frs, "shortLeaseMonth")
    if st:
        s = BeautifulSoup(st[2], "lxml")
        sels = [x for x in s.find_all("select")
                if x.get("name") in ("shortLeaseMonth", "shortLeaseMonthNegotiationType")]
        if len(sels) == 2:
            T["shortLease"] = "".join(str(scrub(x)) for x in sels)
            src["shortLease"] = st[1]

    # LH 전세임대 필수 동의 체크박스
    lh = pick(frs, "isAgreeLhLease")
    if lh:
        s = BeautifulSoup(lh[2], "lxml")
        lab = s.find("label")
        if lab:
            T["lhAgree"] = str(scrub(lab)); src["lhAgree"] = lh[1]

    missing = [k for k in ("calendar", "shortLease", "lhAgree") if not T.get(k)]
    if missing:
        print("  ! 기록에서 못 찾은 조각: %s  (해당 동작은 재현되지 않는다)" % missing)

    # 개인정보 방어
    joined = "\n".join(T.values())
    for pat, name in ((r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}", "휴대폰"),
                      (r"[가-힣]{2,10}공인중개사", "중개사무소명"),
                      (r"\d{3}-\d{2}-\d{5}", "사업자번호")):
        if re.search(pat, joined):
            sys.exit("공여 조각에 %s 가 섞였다. scrub() 를 고칠 것." % name)

    live = open(os.path.join(HERE, "live.js"), encoding="utf-8").read()
    tag = base.new_tag("script")
    tag.string = ("window.__FLR_TEMPLATES__ = %s;\n" % json.dumps(T, ensure_ascii=False)) + live
    (base.find("body") or base.find("html")).append(tag)

    html = str(base)
    open(OUT, "w", encoding="utf-8").write(html)
    print("만들었다: %s  (%.1fMB)" % (OUT, len(html.encode()) / 1048576))
    for k in T:
        print("  조각 %-11s %6d자   출처 %s" % (k, len(T[k]), src.get(k, "?")))


if __name__ == "__main__":
    main()
