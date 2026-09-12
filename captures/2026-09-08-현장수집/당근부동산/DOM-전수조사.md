# 당근부동산 매물 등록폼 — DOM 전수조사

`realty.daangn.com/ceo/articles/new` 의 등록폼을 **DOM 조작 자동화**에 쓸 수 있는 형태로
전수 정리한 문서다. 이 문서 하나만 보고 어댑터를 짤 수 있게 쓰는 것이 목표이고,
원본 캡처(수십 MB)를 다시 열 필요가 없어야 한다.

> **이 문서는 실물 폼만 보고 독립적으로 작성했다.** 어떤 자동입력 구현도 참조하지 않았다.

> **2026-09-09 통합.** 먼저 쓴 `분석.md` 를 이 문서에 합치고 삭제했다. 합치면서 세 곳을
> 바로잡았다 — ① 선택지 목록 순서(§8), ② `aria-label` 의 셀렉터 적합성(§5-6),
> ③ 사용승인일 값 변화의 원인(§9). 자세한 내용은 각 절의 각주에 적었다.

---

## 0. 근거와 검증 방법

| 근거 | 파일 | 무엇을 확인했나 |
|---|---|---|
| 필드로그 schema v2 기록 | `fieldlog_capture_realty.daangn.com_2026-09-08T12-26.json` | 필드 124 · 클릭대상 226 · 의미조작 301 · 원시이벤트 1,326 · 상태 2 |
| 상태 DOM `s1` (자동: 시작) | 위 파일 `pages[1].states[0]` | 아무것도 고르지 않은 **초기 상태** 전체 DOM 166,257자 (`truncated: false`) |
| 상태 DOM `s2` (자동: 정지) | 위 파일 `pages[1].states[1]` | 작업을 마친 **최종 상태** 전체 DOM 180,588자 (`truncated: false`) |
| SingleFile **A** | `singlefile/당근_매물등록폼.html` | 페이지 로드 #1 (`_t=1788870075377`, 21:21:24) — 필드로그 세션과 같은 로드 |
| SingleFile **B** | `singlefile/당근_매물등록폼_재로드본.html` | 페이지 로드 **#2** (`_t=1788870385774`, 21:27:04) — 재로드 후 id 비교용 |

검증 방식:

- 폼 골격·속성은 **상태 DOM에서 직접 파싱**했다 (BeautifulSoup/lxml).
  필드로그가 요약해 준 `labels`·`판정` 은 참고만 하고, 태그·속성은 원본 HTML에서 다시 읽었다.
- 조건부 표시(무엇을 누르면 무엇이 생기나)는 **`actions` + `timeline` 의 인과 기록**으로 확정했다.
  본문에 `[a17]` 처럼 조작 id를 붙여 두었으니 원본에서 되짚을 수 있다.
- 셀렉터 안정성은 **서로 다른 두 번의 페이지 로드**(SingleFile A/B)에서 같은 컨트롤을
  문서 순서로 정렬해 1:1 대조했다.

### 필드로그와 SingleFile 은 대체재가 아니라 보완재다 (정량 근거)

같은 폼을 두 방식으로 담아 비교한 결과다. **“화면이 아니라 소스로 판단해야 한다”**는 원칙의 정량적 근거이기도 하다.

| | 개수 |
|---|---:|
| SingleFile A(초기 화면)에 있는 `name` 종류 | **38** |
| 필드로그 `fields` 의 `name` 종류 | **60** |
| SingleFile 에만 있고 필드로그 `fields` 에 없는 것 | 4 — `address` `salesType` `buildingUsage` `buildingOrientation` (전부 `<button>` 이라 필드로그는 `clickables` 에 담았다. **누락이 아니다**) |
| 필드로그에만 있는 것 | **26** |

그 26종은 **전부 조작해야 나타나는 칸**이고, 그 안에 **가격 칸 12개가 통째로 들어간다**:
`trades.0.price/monthlyPay/adjustable/description` · `trades.1.price` · `trades.2.price` ·
`trades.3.price/monthlyPay/adjustable` · `trades.4.price/monthlyPay/description`.
나머지 14종은 주소 다이얼로그 5 · 관리비 4 · 권리금 2 · 주차 2 · `isHideAddress` 1 이다.

⇒ **초기 화면 HTML 한 장으로 어댑터를 설계했다면 가격을 통째로 빠뜨렸을 것이다.**
닫힌 초기 화면에는 `<button>` 이 12개뿐이고 **선택지 버튼은 0개**다.
매물 종류 11 · 건축물 용도 29 · 방향 8은 **목록을 열 때 생성된다.**

반대로 SingleFile 에만 있는 강점도 뚜렷하다. **두 번 저장해야만 셀렉터 안정성을 판정할 수 있다**(§5-1).
필드로그는 한 세션 = 한 페이지 로드라 이 판정이 원리적으로 불가능하다.

| | 필드로그 | SingleFile |
|---|---|---|
| 조작해야 나오는 칸 | ✅ 전부 | ❌ 26종 누락 |
| 조건부 관계·순서·지연 | ✅ | ❌ |
| 자동환산·부수효과 | ✅ | ❌ |
| 선택지 목록 | ✅ (열었을 때) | ❌ (닫혀 있으면 없음) |
| **셀렉터 재로드 안정성** | ❌ 한 세션으로는 불가 | ✅ **두 번 저장하면 즉시 판정** |

### 폼이 얼마나 유동적인가 (수치)

| 항목 | 값 |
|---|---:|
| 전체 칸 | 124 |
| **한 번 이상 DOM 에서 사라진 칸** | **80 (65%)** |
| 조작 301건 중 **칸을 추가/제거한 것** | **24건** — `a2 a5 a6 a7 a9 a11 a17 a21 a50 a58 a73 a76 a97 a101 a124 a127 a181 a183 a239 a245 a256 a265 a271 a277` |
| 조작 → 칸이 나타날 때까지 걸린 시간 | 최소 0.24초 · **중앙 0.47초** · 최대 4.65초 |

⇒ **자동화는 “값을 넣었다”가 아니라 “다음 칸이 나타났다”를 기다려야 한다.**
고정 대기를 쓴다면 0.5초로는 부족하다. 최대 4.65초가 관측됐다(주소 다이얼로그 구간).

### 이 문서가 다루지 못하는 것

- **매물 종류 11종 중 실제로 눌러 본 것은 4종**이다 — 오픈형 원룸 `[a11,a27]`,
  공장/창고 `[a17]`, 아파트 `[a21,a29]`, 분리형 원룸 `[a24,a31]`.
  나머지 7종(빌라·오피스텔·단독/전원주택·상가·사무실·건물·토지)에서 어떤 칸이
  나타나고 사라지는지는 **미확인**이다. §7 에 확인된 것만 적었다.
- `mutations` 는 **처음 2,500건(0.9초~44.4초)만 남고 그 뒤가 전부 잘렸다.**
  레코더의 `pushMutation` 은 상한에 닿으면 **새 항목을 버린다**(`recorder.js:970`).
  44초 이후 구간은 `actions`·`timeline`·상태 DOM으로만 판단했다.
  (회분 README의 "오래된 것부터 밀려났다" 는 서술은 `mutations` 에 대해서는 사실과 반대다.
  `interactionEvents` 만 `shift()` 로 오래된 것을 버린다 — `recorder.js:896`.)
- `fields[].transitions` 는 **재등장을 놓치는 경우가 있다.** 예: 전입신고 불가능 체크박스는
  `added`/`removed` 만 기록됐지만 `lastSeen` 은 세션 끝(275.7초)이고 최종 상태 DOM에도 있다.
  전이 로그보다 **상태 DOM과 `lastSeen` 이 신뢰도가 높다.**
- SingleFile 은 저장 시 DOM을 고쳐 쓴다(`sf-hidden` 클래스, `hidden` 속성, 스타일·이미지 인라인화,
  속성 따옴표 제거). **구조 판단의 1차 근거는 필드로그 상태 DOM이고, SingleFile 은 재로드 대조 전용이다.**
- **SingleFile 은 JavaScript 를 제거한다.** 저장본 683,805자 중 `<script>` 는 1개(854자)뿐이고
  외부 `src` 는 0개다. 따라서 **저장본의 "선택지 0개" 는 「DOM 에 없다」는 뜻이지 「번들에 없다」는 뜻이 아니다.**
  매물 종류 11 · 건축물 용도 29 · 방향 8이 (ㄱ) 처음부터 번들에 있었고 열 때 그리기만 한 것인지,
  (ㄴ) 여는 순간 서버에서 받아온 것인지는 **두 근거 모두로 판정할 수 없다** — 필드로그는 네트워크를
  기록하지 않고, 해당 시점(방향 클릭 `t=129,364ms`)의 `mutations` 는 상한 초과로 버려졌다.
  판정하려면 네트워크 기록(HAR)이 필요하다(§11).
- 캡처에 중개사무소명·실제 취급 주소·연락처가 들어 있다. 이 문서에서는 전부 가렸다.

---

## 1. 페이지 기본 성질

| 항목 | 값 | 근거 |
|---|---|---|
| URL | `https://realty.daangn.com/ceo/articles/new?from=ceo_home&_t=<epoch ms>` | `meta.url` |
| 프레임 | **top 프레임 단일.** iframe 없음 | `meta.frame="(top)"`, `pageCount` 중 등록폼 레코드 1건 |
| open Shadow DOM | **없음** (`openShadows: []`) | 상태 s1·s2 |
| `<form>` 요소 | **없음.** 폼 전체가 `<div>` 트리 | s1 DOM 파싱: `form` 0개 |
| `<select>` 요소 | **없음.** 드롭다운은 전부 버튼/라디오/체크박스 | s1 DOM 파싱: `select` 0개 |
| 프레임워크 | React (id가 `_r_XX_` 형태의 `useId`) | §5 |
| 디자인 시스템 | 당근 **seed** (`seed-text-input__`, `seed-checkbox__`, `seed-radio__`, `seed-input-button__`, `seed-segmented-control__`, `seed-switch__`, `seed-content-dialog__`) | 클래스 전수 |
| 자동화용 훅 | **거의 없음.** `data-testid` 0건, `data-log-id` 는 페이지 전체에 **1건**(`address-info-field`) | SingleFile A 전수 스캔 |
| 초기 상태 컨트롤 수 | `input` 77 · `textarea` 2 · `button` 21 | s1 DOM |

---

## 2. 화면 위 → 아래 골격 (초기 상태 `s1`)

아무것도 선택하지 않은 상태에서 화면에 실제로 보이는 순서다.
`§` 은 `<h2>` 섹션 제목, `·` 은 행 제목(`span.t4-bold`).

```
[상단바]  로고 / 사이드내비(중개소 홈·부동산 홈·살아본후기·채팅·공지사항·중개소 정보·
          직원 관리·매물 간편 승인 관리·당근 계정 관리·문의하기·로그아웃) / [매물 등록]
─────────────────────────────────────────────────────────────────────
h1  매물 등록
    [기존 매물 불러오기]  [간편 매물 등록]  [엑셀 매물 등록]
                          └ input[type=file][accept=".xlsx,.xls,.csv,.xlsm,.xlsb"][multiple] (class="hidden")

§ 기본 정보
  · 주소          button[name=address]  + 최근주소 칩 N개
  · 매물 종류      button[name=salesType]
  · 건축물 용도    button[name=buildingUsage]
  · 전용면적       input[name=area](㎡)          + input[name=_r_56_](평)     ← 평 칸 name 불안정
  · 공급면적       input[name=supplyArea](㎡)     + input[name=_r_5a_](평)     ← 평 칸 name 불안정

§ 가격        (안내문: "여러 유형을 선택할 수 있어요. 1번째로 선택한 유형이 강조되어 노출돼요.")
  · 거래 유형      input[name=trades] × 5  (월세 / 매매 / 전세 / 연세 / 단기)
                  (주의문: "거래 유형이 2개 이상이면 모두 선택해 주세요…")
                  ▸ 체크하면 아래에 유형별 가격 블록이 생긴다 → §6.2

§ 매물 정보
  · 사용승인일     input[name=buildingApprovalDate] (placeholder YYYY-MM-DD)
                  + 숨은 input[type=date][max=오늘][tabindex=-1]
  · 방/욕실        [방] input[name=roomCnt]개  [욕실] input[name=bathroomCnt]개
  · 층 정보        [전체] input[name=topFloor]층  [해당] input[name=floor]층
                  □ 지하(name 없음)  □ 반지하(name 없음)
  · 방향          button[name=buildingOrientation]
  · 대출          radiogroup: input[name=requiredOptions] DONT_KNOW/YES/NO
  · 반려동물       radiogroup: input[name=requiredOptions] DONT_KNOW/YES/NO
  · 주차          radiogroup: input[name=requiredOptions] YES/NO
  · 위반건축물     □ 해당(name 없음)

§ 시설 정보
  · 매물 특징      input[name=options] × 3  (복층 / 옥탑 / 엘리베이터)
  · 가전/가구      input[name=options] × 7  (세탁기 / 냉장고 / 에어컨 / 전자렌지 / 가스렌지 / 인덕션 / 침대)

§ 관리비
  · 부과 방식      segmented radiogroup[aria-label="관리비 부과 방식"]:
                  input[name=_r_5q_] FIXED(정액 관리비, 기본 checked) / ETC(기타 부과) / UNAVAILABLE(확인 불가)
                  ← name 불안정
                  □ 10만원 미만 혹은 의뢰인이 세부 내역 미제공 (name 없음)
  · 부과 기준      radiogroup: input[name=manageCostCalculationPeriod]
                  LAST_MONTH / AVG_3_MONTHS / AVG_1_YEAR / ETC
  · 공용          input[name=includeManageCostOptionV3_COMMON_fixedCost] 만원
  · 전기료 / 수도료 / 가스비 / 난방비 / 인터넷비 / TV     ← 6행이 같은 모양
       radiogroup[aria-label="<항목명>"]: input[name=includeManageCostOptionV3_<KEY>] USED(쓴 만큼,기본)/FIXED(정액)
       + input[name=includeManageCostOptionV3_<KEY>_fixedCost] 만원 (초기 disabled)
  · 기타          radiogroup[aria-label="기타"]: NONE(없음,기본)/USED/FIXED  ← 이 행만 선택지 3개
       + input[name=includeManageCostOptionV3_ETC_fixedCost] 만원 (초기 disabled)

§ 상세 정보
  · 입주가능일     input[name=moveInDate] (placeholder YYYY-MM-DD)
                  + 숨은 input[type=date][min=오늘][tabindex=-1]
                  □ 즉시 입주 가능 (name 없음)
  · 상세 설명      textarea[name=content] maxlength=1000
  · 매물 한줄 설명  input[name=addressInfo] maxlength=40  [data-log-id="address-info-field"]
  · 사진          input#image-upload[type=file][multiple][accept="image/png,image/jpeg,image/gif,image/webp"]
                  (드롭존 div#PlaceHolder)
  · 평면도        input#floor-plan-upload[type=file][accept="image/png,image/jpeg,image/gif,image/webp"]
  · 동영상        input#video[type=file][accept="video/*"]
  · 집주인 전화번호 input[name=lessorPhoneNumber] (주소에 따라 disabled)

§ 중개소 설정
  · 중개소 비밀메모 textarea[name=memoContent] maxlength=800
  · 전화문의 받기   [번호 수정하기] + label[name=isContactTargetEnabled] > input[role=switch] (기본 checked)

  안내문: "매물 등록 시에 공인중개사법 및 하위 법령 …"
  [임시저장]  [매물 등록하기]                        ← ⚠ 절대 누르지 말 것

[플로팅]  CS 문의 버튼 / 닫기 버튼
```

### 섹션 컨테이너의 위치

행 하나는 이 모양이다. 행 제목으로 블록을 찾는 셀렉터를 짤 때 근거가 된다.

```html
<div class="flex items-start gap-x3">
  <div class="… w-[110px] shrink-0 …"><span class="t4-bold text-fg-neutral">대출</span>…</div>
  <div class="flex flex-1 flex-col gap-x2">
      … 컨트롤들 …
  </div>
</div>
```

---

## 3. 컨트롤 유형별 실제 마크업과 조작 방법

당근은 seed 디자인 시스템의 **5가지 패턴**만 쓴다. 이것만 처리하면 폼 전체를 다룰 수 있다.

### 3-1. 텍스트/숫자 입력 — `seed-text-input`

```html
<div class="seed-field__root flex-1">
  <div class="seed-text-input__root … " data-empty="">
    <input class="seed-text-input__value …" id="field:_r_54_:input" name="area"
           type="number" inputmode="decimal" min="0" placeholder="0" value="">
    <span class="seed-text-input__suffixText …">m²</span>
  </div>
</div>
```

- 단위는 `<input>` 이 아니라 **형제 `span.seed-text-input__suffixText`** 에 있다 (`m²`, `평`, `개`, `층`, `만원`).
  같은 행에 ㎡/평이 나란히 오는 칸은 이 suffix로만 구분된다.
- React **controlled input** 이다. `el.value = "10"` 만으로는 상태가 안 바뀐다.
  네이티브 value setter를 호출하고 `input` 이벤트를 `bubbles:true` 로 디스패치해야 한다.
- 글자수 카운터가 있는 칸은 `span.seed-field__characterCount` / `span.seed-field__maxCharacterCount` 로 확인 가능.

### 3-2. 체크박스 — `seed-checkbox`

```html
<label class="seed-checkbox__root …">
  <div aria-hidden="true" class="seed-checkmark__root …"></div>
  <span class="seed-checkbox__label …">월세</span>
  <input type="checkbox" name="trades" value="on" role="checkbox"
         style="border:0;clip:rect(0,0,0,0);height:1px;width:1px;position:absolute;…">
</label>
```

- **`<input>` 은 1×1px로 시각적으로 숨겨져 있고 `<label>` 안에 들어 있다.** 좌표 클릭은 label에 맞는다.
- **표시 이름은 `<input>` 에 없다.** 형제 `span.seed-checkbox__label` 의 텍스트가 유일한 이름이다.
- `value` 는 전부 `"on"` 이라 값으로 구분할 수 없다. **라벨 텍스트로만 구분된다.**
- 실사용자 이벤트 순서(관측): `label`/`span` 클릭 → `input` 에 click 전달 → `change`.
  자동화도 같은 경로가 가장 안전하다 (`inputEl.click()` 또는 label 클릭).
  `el.checked = true` 직접 대입은 React `onChange` 를 발생시키지 않는다.
- **이미 켜져 있으면 다시 클릭하면 꺼진다.** 반드시 `checked` 를 먼저 읽고 목표 상태와 비교할 것.
  (`[a88]`→`[a89]` 에서 실제로 껐다 켜는 왕복이 기록돼 있다.)

### 3-3. 라디오 — `seed-radio`

```html
<div class="seed-field__root" role="radiogroup">
 <div class="seed-radio-group"><div class="grid grid-cols-4 …">
  <div class="t4-regular w-full">
   <label class="seed-radio__root …">
     <div aria-hidden="true" class="seed-radiomark__root …"></div>
     <span class="seed-radio__label …">확인 필요</span>
     <input type="radio" name="requiredOptions" value="DONT_KNOW" style="…1px 숨김…">
   </label>
  </div> …
 </div></div>
</div>
```

- 체크박스와 같은 구조. 차이는 `value` 가 **의미 있는 상수**라는 것 (§8 카탈로그).
- 그룹 컨테이너는 `div[role=radiogroup]`. `aria-label` 이 있는 그룹과 없는 그룹이 섞여 있다.

### 3-4. 선택 버튼 — `seed-input-button` (드롭다운 4곳)

```html
<div class="seed-field__root">
 <div class="seed-input-button__root …">
   <button type="button" name="salesType" aria-label="매물 종류 선택"
           class="seed-input-button__button …"></button>          ← 버튼 자체는 텍스트가 비어 있다
   <div aria-hidden="true" class="seed-input-button__placeholder …">매물 종류 선택</div>
   <svg class="seed-input-button__suffixIcon …">…</svg>
 </div>
</div>
```

**중요한 성질 3가지:**

1. `<button>` 의 텍스트는 **항상 빈 문자열**이다. 표시 값은 형제 `div` 에 있다.
   - 미선택: `div.seed-input-button__placeholder` (예: "매물 종류 선택", "용도 선택", "방향 선택", "주소를 입력하세요")
   - 선택됨: `div.seed-input-button__value` (예: "원룸", "공동주택", "북동향")
2. `aria-label` 이 상태에 따라 바뀐다.
   `"매물 종류 선택"` → `"매물 종류 변경. 현재: 원룸"` / `"건축물 용도 변경. 현재: 공동주택"` / `"방향 변경. 현재: 북동향"`.
   **`aria-label` 로 셀렉터를 짜면 선택 후 끊어진다. `name` 을 쓸 것.**
3. **표시 값이 고른 항목 이름과 다를 수 있다.** 마지막에 고른 것은 `분리형 원룸` `[a31]` 인데
   최종 상태의 표시 값은 `"원룸"` 이다 (s2 확인). **표시 값으로 선택 결과를 검증하지 말 것.**

**선택지는 모달이 아니라 인라인으로 펼쳐진다.** `visibleOverlays()` 가 `[role=dialog]`/`[role=listbox]`/`[role=menu]`
를 훑는데 매물 종류·건축물 용도·방향은 **오버레이가 0건**이었다 `[a10,a14,a173]`.
클릭 이벤트의 `composedPath` 로 확인한 실제 구조:

```
div (매물 종류 행의 seed-field 컨테이너)
└ div
  └ div  "매물 종류 선택 오픈형 원룸 분리형 원룸 …"   ← 버튼 + 목록을 함께 감싼다
    └ div  "오픈형 원룸 분리형 원룸 …"                ← 목록
      └ div.t4-regular.w-full                        ← 항목 래퍼
        └ button.flex.w-full.items-center.px-x3.py-x2.t4-regular…  "오픈형 원룸"
```

항목 `<button>` 에는 `role`·`data-value`·`id` 가 **하나도 없다. 텍스트가 유일한 식별자다.**

### 3-5. 스위치 — `seed-switch`

```html
<label class="seed-switch__root seed-switch__root--size_32" name="isContactTargetEnabled" data-checked="">
  <div aria-hidden="true" class="seed-switchmark__root …"><div class="seed-switchmark__thumb …"></div></div>
  <input type="checkbox" role="switch" value="on" checked style="…1px 숨김…">
</label>
```

- **`name` 이 `<input>` 이 아니라 `<label>` 에 붙어 있다.** `input[name=isContactTargetEnabled]` 는 **없다.**
  올바른 셀렉터: `label[name="isContactTargetEnabled"] input[role="switch"]`
- 기본값 `checked`. 전화문의 받기.

### 3-6. 날짜 — 인페이지 달력이 **없다**

```html
<div class="relative">
  <div class="seed-field__root w-full">
    <div class="seed-text-input__root …">
      <input id="field:_r_5c_:input" name="buildingApprovalDate" placeholder="YYYY-MM-DD" value="">
      <svg …>  ← 달력 아이콘
    </div>
  </div>
  <input type="date" class="pointer-events-none !absolute top-0 h-full opacity-0"
         tabindex="-1" max="2026-09-08" value="">
</div>
```

- 달력 아이콘을 눌러도 **DOM 오버레이가 생기지 않는다** `[a129,a130,a270]` — 브라우저 **네이티브 date picker** 다.
  즉 **클릭해서 날짜를 고르는 자동화는 불가능하다.**
- 대신 두 경로가 확인됐다.
  1. 보이는 텍스트 칸에 `YYYY-MM-DD` 를 **직접 타이핑** → 그대로 들어간다 `[a134: '' → '2012-10-07']`.
     타이핑 도중 자동 서식이 붙는다: `1999` → `1999-08` → `1999-08-15` (observations 기록).
  2. 숨은 `input[type=date]` 의 값을 바꾸면 보이는 칸이 따라온다 (부수효과로 기록됨, §9).
- 제약: 사용승인일은 `max=오늘`, 입주가능일은 `min=오늘`.

---

## 4. 파일 업로드

| 칸 | 셀렉터 | accept | multiple | 드롭존 |
|---|---|---|---|---|
| 사진 | `input#image-upload` | `image/png,image/jpeg,image/gif,image/webp` | O | `div#PlaceHolder` ("이미지/폴더를 드래그하거나 클릭해 업로드하기") |
| 평면도 | `input#floor-plan-upload` | 동일 | X | "평면도를 여기에 드래그하거나 클릭해서 추가할 수 있어요" |
| 동영상 | `input#video` | `video/*` | X | "동영상을 드래그하거나 클릭해 업로드하기" |
| 엑셀 매물 등록 | `input[type=file][accept=".xlsx,…"]` (id 없음, `class="hidden"`) | 스프레드시트 | O | 상단 [엑셀 매물 등록] 버튼 |

- **이 3개의 `id` 는 React `useId` 가 아니라 고정 문자열이다.** 재로드 후에도 그대로였다 (§5).
  폼 전체에서 재로드에 견디는 유일한 `id` 다.

---

## 5. 셀렉터 안정성 — 재로드 2회 대조 결과

SingleFile A(로드 #1)와 B(로드 #2)의 컨트롤을 문서 순서로 정렬해 1:1 비교했다.
A 97개 · B 102개(B는 조작이 끝난 뒤라 조건부 칸이 더 있음), 앞의 97개가 정렬됐다.

### 5-1. 재로드마다 100% 바뀌는 것 — `id`

| 칸 | 로드 #1 | 로드 #2 |
|---|---|---|
| `area` | `field:_r_54_:input` | `field:_r_cu_:input` |
| `supplyArea` | `field:_r_58_:input` | `field:_r_d2_:input` |
| `buildingApprovalDate` | `field:_r_5c_:input` | `field:_r_d6_:input` |
| `roomCnt` | `field:_r_5e_:input` | `field:_r_d8_:input` |
| `bathroomCnt` | `field:_r_5g_:input` | `field:_r_da_:input` |
| `topFloor` | `field:_r_5i_:input` | `field:_r_dc_:input` |
| `floor` | `field:_r_5k_:input` | `field:_r_de_:input` |
| `moveInDate` | `field:_r_6j_:input` | `field:_r_ed_:input` |
| `content` | `field:_r_6l_:input` | `field:_r_ef_:input` |
| `addressInfo` | `field:_r_6n_:input` | `field:_r_eh_:input` |
| `lessorPhoneNumber` | `field:_r_6p_:input` | `field:_r_ej_:input` |
| `memoContent` | `field:_r_6r_:input` | `field:_r_el_:input` |
| 관리비 `*_fixedCost` 8칸 | `_r_5s_ _r_5v_ _r_62_ _r_65_ _r_68_ _r_6b_ _r_6e_ _r_6h_` | `_r_dm_ _r_dp_ _r_ds_ _r_dv_ _r_e2_ _r_e5_ _r_e8_ _r_eb_` |

**`field:_r_*:input` 형태의 id는 하나도 살아남지 못했다. 절대 쓰지 말 것.**

### 5-2. 세션 **안에서도** 바뀌는 id

거래 유형을 바꾸면 가격 블록이 리마운트되면서 같은 `name` 의 id가 갈아치워진다.

| `name` | 처음 `path` 의 id | 마지막 `lastPath` 의 id |
|---|---|---|
| `trades.0.price` | `field:_r_7f_:input` | `field:_r_85_:input` |
| `trades.0.monthlyPay` | `field:_r_7h_:input` | `field:_r_87_:input` |

### 5-3. `name` 이 곧 React id인 칸 — **`name` 도 불안정**

| 칸 | 로드 #1 `name` | 로드 #2 `name` |
|---|---|---|
| 전용면적 **평** | `_r_56_` | `_r_d0_` |
| 공급면적 **평** | `_r_5a_` | `_r_d4_` |
| 관리비 부과 방식 라디오 | `_r_5q_` | `_r_dk_` |
| 주소 다이얼로그 검색칸 | `_r_6u_` | (재로드 미확인, 같은 형태) |
| 주소 다이얼로그 상세주소칸 | `_r_77_` | (동일) |

**판별식: `name` 이 `/^_r_[0-9a-z]+_$/` 에 걸리면 그 값은 매번 바뀐다. 절대 하드코딩하지 말 것.**
이 5칸은 §10 의 우회 방법을 써야 한다.

### 5-4. 재로드에 안정적인 것

- **의미 있는 `name`** — 아래 §5-5 표의 이름 전부가 두 로드에서 동일했다.
- **고정 `id` 3개** — `image-upload`, `floor-plan-upload`, `video`.
- **`value` 상수** — 라디오의 `DONT_KNOW`/`YES`/`NO`/`FIXED`/`USED`/… (§8).
- **라벨 텍스트** — `span.seed-checkbox__label` / `span.seed-radio__label` / 행 제목 `span.t4-bold`.
- **seed 클래스** — `seed-text-input__value` 등. 다만 페이지 전체에서 반복되므로 단독으로는 못 쓴다.
- ⚠ **`placeholder` 는 안정적이지 않다.** `addressInfo` 의 placeholder 가
  매물 종류에 따라 `"예) 강남 출퇴근 직장인 추천"` ↔ `"예) 깔끔한 신축 풀옵션 원룸"` 로 바뀌었다 (s1 vs s2).

### 5-5. `name` 중복도 (초기 상태 기준) — **유일성이 없는 이름 주의**

| `name` | 개수 | 구분 방법 |
|---|---:|---|
| `options` | 10 | 라벨 텍스트 (복층/옥탑/엘리베이터/세탁기/냉장고/에어컨/전자렌지/가스렌지/인덕션/침대) |
| `requiredOptions` | **8** | **행 제목(대출 3개 / 반려동물 3개 / 주차 2개)으로 블록을 먼저 좁혀야 함** |
| `trades` | 5 | 라벨 텍스트 (월세/매매/전세/연세/단기) |
| `manageCostCalculationPeriod` | 4 | `value` |
| `_r_5q_` (부과 방식) | 3 | `value` |
| `includeManageCostOptionV3_ETC` | 3 | `value` |
| `includeManageCostOptionV3_{ELECTRIC,WATERWORKS,GAS,BOILER,INTERNET,TV}` | 각 2 | `value` |
| 그 외 전부 | 1 | `name` 만으로 유일 |

`requiredOptions` 8개가 가장 위험하다. `input[name=requiredOptions][value=YES]` 는 **3개를 잡는다.**
반드시 이렇게 좁힐 것:

```
행제목 span.t4-bold("대출"|"반려동물"|"주차")
  → closest("div.flex.items-start.gap-x3")   (= 행 컨테이너)
  → querySelector('[role=radiogroup] input[name="requiredOptions"][value="YES"]')
```

---

### 5-6. `aria-label` — 라디오 묶음에만 안정적이다 ⚠

> **정정.** 먼저 쓴 `분석.md` 는 `[aria-label="매물 종류 선택"]` 같은 셀렉터를
> “트리거 버튼의 안정적 셀렉터 ★”로 권했다. **네 개의 트리거 버튼에 대해서는 틀렸다.**

폼에 있는 `aria-label` 은 두 종류이고 성질이 정반대다.

| 붙은 곳 | `aria-label` | 안정성 |
|---|---|---|
| `div[role=radiogroup]` | `관리비 부과 방식` `전기료` `수도료` `가스비` `난방비` `인터넷비` `TV` `기타` | ✅ **고정.** 상태와 무관 |
| `button[name=…]` (선택 버튼 4개) | `주소 검색` `매물 종류 선택` `건축물 용도 선택` `방향 선택` | ❌ **선택하면 바뀐다** |

선택 후 실측값(상태 `s2`):

```
매물 종류 선택      →  매물 종류 변경. 현재: 원룸
건축물 용도 선택    →  건축물 용도 변경. 현재: 공동주택
방향 선택          →  방향 변경. 현재: 북동향
```

⇒ 트리거 버튼은 **`aria-label` 이 아니라 `name` 으로 지목한다.**
`button[name="address"]` · `button[name="salesType"]` · `button[name="buildingUsage"]` ·
`button[name="buildingOrientation"]` 네 개는 **SingleFile 두 로드에 모두 그대로 있었다**(§5-1 대조).
`name` 은 여기서도 최우선 셀렉터다.

관리비 항목별 라디오 묶음은 반대로 `aria-label` 이 가장 좋은 앵커다.
`name` 이 `includeManageCostOptionV3_ELECTRIC` 처럼 이미 유일하지만,
행 전체(라디오 2개 + 금액 칸)를 한 번에 잡으려면
`div[role="radiogroup"][aria-label="전기료"]` 가 가장 간결하다.

## 6. 조건부 표시 그래프 (무엇을 누르면 무엇이 생기나)

각 항목의 `[aNN]` 은 원본 `actions` 의 조작 id다.

### 6-1. 주소 (§7 별도)

주소를 확정하기 전에는 `lessorPhoneNumber` 가 `disabled` + `aria-disabled=true` 이고
안내문이 `"집주인 정보를 불러올 수 없는 주소예요…"` 다.
주소 확정 뒤 s2에서는 **disabled 가 풀리고** 안내문이 `"집주인 인증 용도로만 사용하니…"` 로 바뀌었다.

### 6-2. 거래 유형 → 가격 블록 (**가장 까다로운 부분**)

체크한 유형마다 `trades.<N>.*` 필드 묶음이 생긴다.

| 유형 | 생기는 칸 |
|---|---|
| 월세 | `trades.N.price`(보증금) · `trades.N.monthlyPay`(월세) · `trades.N.adjustable`(보증금 조정 가능) |
| 매매 | `trades.N.price`(가격) |
| 전세 | `trades.N.price`(보증금) |
| 연세 | `trades.N.price`(보증금) · `trades.N.monthlyPay`(연세) · `trades.N.adjustable` |
| 단기 | `trades.N.price`(보증금) · `trades.N.monthlyPay`(월세) · `trades.N.description`(조건, maxlength=100) |

그리고 `trades.N.adjustable` 을 **체크하면** `trades.N.description`
(placeholder `"보증금 조정시 금액을 설명해주세요."`, maxlength=**50**) 이 추가로 생긴다 `[a96→a97]`.
`trades.4.description`(단기 조건)과는 **다른 칸**이다 — maxlength 도 50 vs 100 으로 다르다.

**`N` 은 고정 번호가 아니다.** 관측된 사실:

| 체크한 상태 | 생긴 이름 | 근거 |
|---|---|---|
| 매매만 | `trades.0.price` | `[a58]` |
| 전세만 | `trades.0.price` | `[a67]` |
| 연세만 | `trades.0.price/monthlyPay/adjustable/description` | `[a76,a97]` |
| 단기만 | `trades.0.price` | `[a104]` |
| 5개 모두 (월세→매매→전세→연세→단기 순으로 체크) | `trades.0`=월세, `.1`=매매, `.2`=전세, `.3`=연세, `.4`=단기 | `[a114~a127]` |

> **미확정:** 이 캡처에서는 **DOM 순서와 클릭 순서가 항상 같았다.**
> 따라서 `N` 이 *DOM 고정 순서(월세0 매매1 전세2 연세3 단기4)* 의 부분열 인덱스인지,
> *체크한 순서* 인지 **구분할 수 없다.** 화면 안내문("1번째로 선택한 유형이 강조되어 노출돼요")은
> 선택 순서가 의미를 갖는다는 뜻이므로 **후자일 가능성을 배제할 수 없다.**
>
> **그러므로 `N` 을 계산해서 셀렉터에 박지 말 것.** 안전한 방법:
> 체크한 뒤 가격 블록의 **제목(`span.t4-bold` = 월세/매매/전세/연세/단기)** 으로 블록을 찾고,
> 그 안의 `input[name^="trades."][name$=".price"]` 를 잡는다.
> (s2 DOM에서 각 가격 블록이 자기 유형 이름을 제목으로 달고 있는 것을 확인했다.)

거래 유형을 **해제하면 그 블록의 입력값은 그대로 사라진다** `[a101]`.
그리고 다시 체크하면 리마운트되면서 `id` 가 새로 발급된다(§5-2). **입력 → 검증은 반드시 같은 사이클 안에서.**

### 6-3. 관리비 — 3갈래 × 1스위치

`부과 방식` 라디오(`name=_r_5q_`, 불안정)와 `10만원 미만…` 체크박스가 독립적으로 화면을 갈아치운다.

```
부과 방식 = FIXED (정액 관리비, 기본)
├─ □ 10만원 미만 혹은 의뢰인이 세부 내역 미제공  = OFF  ← 초기 상태 s1
│    · 부과 기준 (manageCostCalculationPeriod ×4)
│    · 공용 (includeManageCostOptionV3_COMMON_fixedCost)
│    · 전기료/수도료/가스비/난방비/인터넷비/TV  각 USED|FIXED + *_fixedCost
│    · 기타  NONE|USED|FIXED + includeManageCostOptionV3_ETC_fixedCost
│
└─ □ 10만원 미만… = ON                          [a239]  ← 최종 상태 s2
     · 부과 기준 (그대로 유지)
     · 총 관리비  input[name=totalManageCost]         ← 새로 생김
     · 관리비에 포함  input[name=includeManageCostOptionV3] × 8 (체크박스)
          공용 / 전기료 / 수도료 / 가스비 / 난방비 / 인터넷비 / TV / 기타
     ⇒ 위 갈래의 *_fixedCost 8칸과 항목별 USED/FIXED 라디오 14개가 전부 DOM에서 제거된다

부과 방식 = ETC (기타 부과)                      [a245]
     · manageCostEtcChargeBasis 라디오 6개 추가
     · "10만원 미만…" 체크박스가 DOM에서 제거된다
     · (관측 시점에 totalManageCost / includeManageCostOptionV3 는 남아 있었다)

부과 방식 = UNAVAILABLE (확인 불가)              [a256]
     · manageCostUnavailableReason 라디오 3개 추가
     · manageCostCalculationPeriod 4개 · totalManageCost · includeManageCostOptionV3 8개가 전부 제거된다

부과 방식 = FIXED 로 되돌리면                     [a265]
     · manageCostUnavailableReason 3개가 제거된다
```

> ⚠ `[a245]` 는 `[a239]`(10만원 미만 ON) 상태에서 눌렀고, `[a256]` 은 그 다음이다.
> 따라서 **"10만원 미만 OFF + 부과 방식 ETC"** 조합은 이 캡처에 없다. 조합별 최종형은 부분 미확인.

`*_fixedCost` 8칸은 **초기 `disabled` + `data-disabled` + `aria-disabled="true"`** 다.
같은 행의 라디오를 `FIXED(정액)` 로 바꿔야 풀린다(구조상 명확하나, 실제 해제 순간은 이 캡처에 없다 — **미검증**).

### 6-4. 매물 종류 → 조건부 칸

| 고른 값 | 나타남 | 사라짐 | 근거 |
|---|---|---|---|
| 오픈형 원룸 | `저/중/고로 표시` 체크박스(층 정보 행) · `전입신고 불가능 / 해당` 체크박스 | — | `[a11]` |
| 공장/창고 | `isHideAddress` · `premiumMoney`(권리금) · `premiumMoneyDescription`(권리금 설명(선택)) · `권리금 없음` · `협의 가능` · `건물 전체` · 대출/반려동물/주차 라디오 재구성 | `전입신고 불가능 / 해당` | `[a17]` |
| 아파트 | — | `premiumMoney` · `premiumMoneyDescription` · `권리금 없음` · `협의 가능` | `[a21]` |
| 분리형 원룸 | (최종 상태 s2 기준) `저/중/고로 표시` · `전입신고 불가능` 모두 존재 | — | s2 DOM |

- `저/중/고로 표시` 는 s2에서 **`disabled`** 였다 (층 정보를 특정 방식으로 채웠을 때만 풀리는 듯 — 조건 미확인).
- 층 정보 행의 `저/중/고로 표시` 와 공장/창고의 `건물 전체` 는 **DOM 경로가 같다.**
  필드로그가 두 라벨을 한 레코드에 합쳐 기록했다(`labels: ['저/중/고로 표시','건물 전체']`).
  ⇒ **경로 기반 식별은 매물 종류가 바뀌면 다른 컨트롤을 가리킬 수 있다.**
- 나머지 7종(빌라·오피스텔·단독/전원주택·상가·사무실·건물·토지)은 **미확인**.

### 6-5. 주차 = 가능 → 주차 대수 2칸

`주차` 행에서 `YES` 를 고르면 생긴다 `[a181]`. `NO` 로 바꾸면 제거된다 `[a183]`.

- `input[name=availableTotalParkingSpots]` (단위 `대`)
- `input[name=availableParkingSpotsV2]` (단위 `대`)

### 6-6. 입주가능일

- 숨은 `input[type=date]` 에 날짜가 들어가면 `입주일 협의 가능` 체크박스가 생긴다 `[a271]`.
  체크박스를 해제/변경하면 사라진다 `[a277]`.
- `즉시 입주 가능` 체크박스를 켜면 `moveInDate` 가 **오늘 날짜로 자동 채워진다**
  (부수효과 기록: `'' → '2026-09-08'`).

---

## 7. 주소 입력 — 유일한 진짜 모달

`button[name="address"]` 을 누르면 **`[role=dialog]` 오버레이**가 뜬다 `[a2]`.
위치는 `body > div:nth-child(15) > div:nth-child(2)` (포털). 컨테이너 클래스 `seed-content-dialog__content`.

### 3단계 절차 (관측된 그대로)

**① 검색 화면**

```html
<div role="dialog" aria-labelledby="_r_6t_-title" tabindex="-1" class="seed-content-dialog__content …">
  <h2 id="_r_6t_-title" class="seed-content-dialog__title …">매물 주소</h2>
  <button aria-label="닫기" class="absolute right-x5 top-x5 …"></button>
  <input id="field:_r_6u_:input" name="_r_6u_" placeholder="예) 한누리대로 411, 상암동 1595"
         class="seed-text-input__value … --size_large">
  <div class="t4-bold text-fg-neutral">빠른 단지 선택</div>
  <button type="button" class="… rounded …">〈최근 주소 칩 — 계정별 개인정보〉</button> × N
  <h3 class="t5-bold">이렇게 검색해 보세요</h3>  …
</div>
```

- 검색칸의 `name`/`id` 는 **둘 다 React id** 라 불안정하다.
  안정 셀렉터: `[role="dialog"] input[placeholder^="예) 한누리대로"]`
  (다이얼로그 안의 유일한 텍스트 입력이기도 하다).
- 「빠른 단지 선택」칩은 **그 계정이 최근에 다룬 주소 이력**이다. 자동화에서 건드릴 대상이 아니고,
  캡처 반출 시 가려야 할 개인정보다.

**② 검색 결과 목록** — 타이핑하면 같은 다이얼로그 안에 결과가 채워진다 `[a4]`.

```
div.flex.h-full.flex-col.overflow-auto
└ 결과행 × 20
   ├ div.t4-bold                     우편번호 (예: 37662)
   ├ span.seed-badge__label "도로명" + div.t4-regular  도로명 주소
   ├ span.seed-badge__label "지번"   + div.t4-regular  지번 주소
   └ button.seed-action-button…       "선택"
```

- 검색어와 일치하는 부분이 `<span class="text-fg-informative">` 로 감싸져 있다.
  `textContent` 로 읽으면 붙어 나오지만, **정규식으로 원문 비교할 때는 태그가 끼어 있음을 기억할 것.**
- 결과 `<button>` 20개가 전부 텍스트 `"선택"` 이다. **텍스트로는 구분 불가 — 행 컨테이너로 좁혀야 한다.**
- 관측된 결과 개수는 20개. 페이징 UI는 이 캡처에 없다.

**③ 상세 주소 입력** — 「선택」을 누르면 화면이 바뀐다 `[a5]`.

```html
<div role="dialog" aria-labelledby="_r_72_-title" …>
  <h2 …>매물 주소</h2>
  <div class="t5-bold">주소</div>  <button …>수정하기</button>
  <div>경상북도 … (동)</div>
  <span class="seed-badge__label">지번</span> <div>… 1356-6</div>
  <div class="t5-bold">상세 주소</div>
  <span class="t2-regular …">호수는 게시글에 표시되지 않아요</span>
  <input id="field:_r_77_:input" name="_r_77_" placeholder="예시) A-1101 또는 A동 1101호">
  <button class="seed-action-button…--variant_brandSolid…">입력하기</button>
</div>
```

- 상세 주소 입력 후 **「입력하기」** 를 눌러야 확정된다 `[a9]`.
- 확정 후 본문의 주소 행은 버튼이 사라지고
  `div.t4-regular.flex-1.rounded-r1_5.bg-bg-neutral-weak…` 안에 전체 주소 텍스트 +
  `button "수정하기"` 로 바뀐다 (s2 확인).
  ⇒ **주소를 다시 고치려면 `button[name=address]` 이 아니라 「수정하기」를 눌러야 한다.**
- 아파트 등 단지를 고르면 중간에 `button "직접 입력"` 이 끼는 경로도 관측됐다 `[a7]`.

---

## 8. 선택지 카탈로그 (전수)

> **순서 정정.** 먼저 쓴 `분석.md` 의 매물 종류·건축물 용도·방향 목록은 **화면 순서가 아니었다**
> (임의로 재배열돼 있었다). 아래 순서는 두 가지 독립 근거로 확정한 것이다 —
> ① 필드로그 스윕이 문서 순서(`querySelectorAll`)로 기록한 `timeline[].added` 배열,
> ② `clickables` 에 남은 각 버튼의 `div:nth-child(N)` 위치. 둘이 완전히 일치했다.
> **순서에 의존하지 말고 텍스트로 고르는 것이 원칙이지만**(§8-2 참조), 화면을 재현하거나
> 사람이 검수할 때는 실제 순서가 필요하다.

### 8-1. 매물 종류 `button[name=salesType]` — 11개 (DOM 순서)

```
오픈형 원룸 / 분리형 원룸 / 아파트 / 빌라(투룸 이상) / 오피스텔 /
단독/전원주택 / 상가 / 사무실 / 건물 / 공장/창고 / 토지
```

### 8-2. 건축물 용도 `button[name=buildingUsage]` — 29개

첫 개봉 시(매물 종류 미선택) 순서 `[a14]`:

```
공동주택 / 단독주택 / 제1종 근린생활시설 / 제2종 근린생활시설 / 업무시설 / 숙박시설 /
문화 및 집회시설 / 종교시설 / 판매시설 / 운수시설 / 의료시설 / 교육연구시설 / 노유자시설 /
수련시설 / 운동시설 / 위락시설 / 공장 / 창고시설 / 야영장시설 / 자원순환 관련 시설 /
교정시설 / 방송통신시설 / 발전시설 / 묘지 관련 시설 / 관광 휴게시설 / 장례식장 /
자동차 관련 시설 / 위험물 저장 및 처리 시설 / 동물 및 식물 관련 시설
```

> ⚠ **이 순서는 매물 종류에 따라 바뀐다.** 「공장/창고」를 고른 뒤 다시 열었더니 `[a18]`
> `판매시설` 이 1번, `공동주택` 이 2번, `종교시설` 이 9→10번으로 이동했다
> (clickables 의 DOM 경로 `div:nth-child(N)` 비교로 확인).
> **인덱스로 고르지 말고 반드시 텍스트로 고를 것.**

### 8-3. 방향 `button[name=buildingOrientation]` — 8개

```
남향 / 동향 / 서향 / 북향 / 남동향 / 남서향 / 북서향 / 북동향
```

(표시 값은 그대로 `"북동향"` 으로 들어갔다.)

### 8-4. 라디오 `value` 전수

| `name` | `value` (라벨) | 기본 |
|---|---|---|
| `requiredOptions` — 대출 | `DONT_KNOW`(확인 필요) `YES`(가능) `NO`(불가능) | 없음 |
| `requiredOptions` — 반려동물 | `DONT_KNOW` `YES` `NO` | 없음 |
| `requiredOptions` — 주차 | `YES`(가능) `NO`(불가능) — **2개뿐** | 없음 |
| `_r_5q_` 관리비 부과 방식 | `FIXED`(정액 관리비) `ETC`(기타 부과) `UNAVAILABLE`(확인 불가) | **`FIXED`** |
| `manageCostCalculationPeriod` | `LAST_MONTH`(직전 월) `AVG_3_MONTHS`(최근 3개월 평균) `AVG_1_YEAR`(최근 1년 평균) `ETC`(기타 (직접입력)) | 없음 |
| `includeManageCostOptionV3_ELECTRIC` 외 5개(`WATERWORKS` `GAS` `BOILER` `INTERNET` `TV`) | `USED`(쓴 만큼) `FIXED`(정액) | **`USED`** |
| `includeManageCostOptionV3_ETC` | `NONE`(없음) `USED`(쓴 만큼) `FIXED`(정액) | **`NONE`** |
| `manageCostEtcChargeBasis` (DOM 순서) | `BY_INDIVIDUAL_METER`(세대별 사용량에 따라 부과) · `BY_REGULATIONS`(관리규약에 따라 부과) · `COMMON_BY_AREA_OR_UNITS_AND_USAGE_BY_METER`(공용관리비는 면적/세대별로 부과하고 사용료는 사용량에 따른 부과) · `ESTIMATED_BY_AGENT_DUE_TO_NO_OWNER_INFO`(중개의뢰인 관리비 미제시) · `ETC`(기타 (직접입력)) · `SHARED_BY_UNITS`(전체 사용량을 세대수로 나누어 부과) | 없음 |
| `manageCostUnavailableReason` (DOM 순서) | `SINGLE_HOUSE`(건축법 시행령 별표 1의 제1호 가목의 단독주택) · `STORE_NOT_OFFICETEL`(오피스텔 제외 상가 건물에 해당하는 경우) · `UNREGISTERED_OR_NEW`(미등기건물, 신축건물 등 관리비 내역이 확인불가한 경우) | 없음 |

> 위 두 그룹의 `value` 는 필드로그의 `runtime.value` 에서 **잘리지 않은 전체 문자열**을 읽은 것이고,
> DOM 순서는 `clickables` 에 기록된 각 `<label>` 의 `div:nth-child(N)` 위치로 확인했다
> (`manageCostEtcChargeBasis` 는 1~6, `manageCostUnavailableReason` 은 1~3).
> 이 두 그룹은 상태 스냅샷이 없는 조건부 화면이라 상태 DOM으로는 대조할 수 없다.

### 8-5. 체크박스 라벨 전수

| `name` | 라벨 (DOM 순서) |
|---|---|
| `trades` | 월세 / 매매 / 전세 / 연세 / 단기 |
| `options` | 복층 / 옥탑 / 엘리베이터 · 세탁기 / 냉장고 / 에어컨 / 전자렌지 / 가스렌지 / 인덕션 / 침대 |
| `includeManageCostOptionV3` | 공용 / 전기료 / 수도료 / 가스비 / 난방비 / 인터넷비 / TV / 기타 |
| `isHideAddress` | 주소는 읍/면/동까지만 표시 지도에서도 가까이 확대하면 매물이 표시되지 않아요. |
| (name 없음) | 지하 / 반지하 / 저/중/고로 표시 / 해당(위반건축물) / 해당(전입신고 불가능) / 10만원 미만 혹은 의뢰인이 세부 내역 미제공 / 즉시 입주 가능 / 입주일 협의 가능 / 권리금 없음 / 협의 가능 / 건물 전체 |
| `trades.N.adjustable` | 보증금 조정 가능 |

> `name` 없는 체크박스가 **11종**이다. 이들은 **라벨 텍스트 + 상위 행 제목**으로만 잡을 수 있다.
> 특히 `해당` 은 위반건축물·전입신고 불가능 두 곳에 있으므로 **행 제목으로 반드시 좁혀야 한다.**

---

## 9. 자동 변환·부수효과 (한 칸을 채우면 다른 칸이 바뀐다)

| 채운 칸 | 자동으로 바뀌는 칸 | 관측값 |
|---|---|---|
| 전용면적 **평** (`_r_56_`) | 전용면적 **㎡** (`area`) | `102.47` → `1028.09` |
| 전용면적 **㎡** (`area`) | 전용면적 **평** (`_r_56_`) | `0.3` → `3` |
| 공급면적 **평** (`_r_5a_`) | 공급면적 **㎡** (`supplyArea`) | `102.47` → `1028.09` |
| 숨은 `input[type=date]` (사용승인일) | `buildingApprovalDate` | `2012-10-24` → `2012-10-04` |
| 숨은 `input[type=date]` (입주가능일) | `moveInDate` | `1999-08-15` → `2026-09-12` |
| `즉시 입주 가능` 체크박스 | `moveInDate` | `''` → `2026-09-08` (오늘) |

> **정정.** 먼저 쓴 `분석.md` 는 `buildingApprovalDate` 의 `2012-10-24 → 2012-10-04` 를
> “날짜 자동 보정”으로 읽었다. **아니다.** 이것은 **숨은 `input[type=date]` 를 네이티브
> 날짜 선택기로 조작한 결과가 보이는 칸에 반영된 것**이다(부수효과의 출처 필드가 숨은 date 칸이다).
> 보이는 칸이 스스로 값을 고친 사례는 확인되지 않았다 — `reformatted`·`rejected` 모두 0건이다.
> 다만 **타이핑 중 하이픈이 자동으로 붙는 것은 사실**이다(아래 자동 서식 표).

**㎡ ↔ 평은 양방향 자동환산이다.** 어느 한쪽만 채우면 되고, **양쪽을 다 채우면 서로 덮어써서 값이 깨진다.**
(실제로 캡처에서 `area` 10 → 평 3 → 다시 평 311 입력 → `area` 1028.09 로 튀는 왕복이 남아 있다.)
⇒ **자동화는 ㎡ 칸 한쪽만 채우고 평 칸은 건드리지 말 것.**

### 입력 중 자동 서식 (관측된 `observations`)

| 칸 | 넣은값 → 남은값 |
|---|---|
| `moveInDate` | `1999` → `1999-08`, `19990` → `1999-08` (하이픈 자동 삽입, 자릿수 초과분 무시) |
| `buildingApprovalDate` | `2012-10-0` 유지 → `2012-10-07` |
| 숫자 칸 전반 | 자릿수가 그대로 누적 (`1`→`11`, `31`→`311`) — 기존 값을 **지우고** 넣어야 함 |

`rejected`·`reformatted` 로 잡힌 칸은 **0건**이다. 즉 **값을 거절하거나 몰래 고치는 칸은 확인되지 않았다.**

---

## 10. 자동화 구현 체크리스트

1. **`id` 로 찾지 말 것.** `field:_r_*:input` 은 재로드마다 100% 바뀐다.
   쓸 수 있는 `id` 는 `image-upload`, `floor-plan-upload`, `video` 3개뿐.
2. **`name` 이 `_r_XXX_` 패턴이면 그것도 id다.** 해당 5칸의 대안:
   - 전용면적/공급면적 **평** → 애초에 채우지 말 것 (㎡만 채우면 자동환산).
     굳이 필요하면 `input[name=area]` 의 상위 `div.flex.items-center.gap-x2` 안에서
     suffix 가 `평` 인 두 번째 `input`.
   - 관리비 부과 방식 → `div[role=radiogroup][aria-label="관리비 부과 방식"] input[value="FIXED"|"ETC"|"UNAVAILABLE"]`
   - 주소 다이얼로그 두 칸 → `[role=dialog] input[placeholder^="예) 한누리대로"]`,
     `[role=dialog] input[placeholder^="예시) A-1101"]`
3. **중복 `name` 은 행 제목으로 좁힐 것.** 특히 `requiredOptions`(8개).
4. **체크박스/라디오는 1×1px 숨김 요소다.** 좌표 클릭 금지. `label` 또는 `input.click()`.
   `checked` 직접 대입 금지(React onChange 미발생). **누르기 전에 현재 `checked` 확인 필수.**
5. **텍스트 입력은 네이티브 setter + `input` 이벤트**로. `.value=` 만으로는 React 상태가 안 바뀐다.
   기존 값이 있으면 **먼저 비우고** 넣을 것(자릿수 누적).
6. **드롭다운 4개는 2단계다.** `button[name=…]` 클릭 → 같은 필드 컨테이너 안에 인라인으로 펼쳐진
   목록에서 **텍스트가 정확히 일치하는 `button`** 클릭. 오버레이/포털이 아니다.
   순서는 매물 종류에 따라 바뀌므로 인덱스 금지.
7. **선택 결과를 표시 값으로 검증하지 말 것.** `분리형 원룸` → 표시 `"원룸"`.
   `aria-label` 도 `"…선택"` → `"…변경. 현재: X"` 로 바뀐다.
8. **순서가 강제된다.** 주소 → 매물 종류 → (조건부 칸 생성) → 나머지.
   거래 유형을 나중에 바꾸면 가격 블록이 통째로 리마운트되며 **입력값이 날아간다.**
   권장 순서: ① 주소 확정 → ② 매물 종류 → ③ 건축물 용도 → ④ 거래 유형 전부 체크 →
   ⑤ 가격 입력 → ⑥ 나머지 → ⑦ 파일.
9. **날짜는 텍스트 칸에 `YYYY-MM-DD` 타이핑.** 인페이지 달력이 없어 클릭 자동화가 불가능하다.
10. **`disabled` 칸을 확인할 것.** 관리비 `*_fixedCost` 8칸과 `저/중/고로 표시` 는 초기 disabled,
    `lessorPhoneNumber` 는 주소 확정 전 disabled.
11. **`[임시저장]` / `[매물 등록하기]` 는 `name`·`id`·`type` 이 전부 없다.** 텍스트로만 잡힌다.
    자동화에서 **누르지 말 것**(실매물 등록).
12. **iframe·Shadow DOM 고려 불필요.** 전부 top 프레임 라이트 DOM이다.

---

## 11. 다시 캡처해야 알 수 있는 것

| 항목 | 왜 지금 모르나 |
|---|---|
| 매물 종류 7종(빌라·오피스텔·단독/전원주택·상가·사무실·건물·토지)의 조건부 칸 | 눌러 보지 않음 |
| `trades.N` 의 N 이 DOM 순서인지 선택 순서인지 | 두 가설이 구분되는 조작(예: 단기 → 월세 순으로 체크)이 없었음 |
| `*_fixedCost` 가 풀리는 순간 | `FIXED(정액)` 라디오를 실제로 고른 기록이 없음 |
| `저/중/고로 표시` 가 enable 되는 조건 | s2에서 계속 disabled |
| 「10만원 미만 OFF + 부과 방식 ETC」 조합의 최종 화면 | 조합이 캡처되지 않음 |
| 건축물 용도 목록의 매물 종류별 정확한 순서 | 2개 조합만 관측 |
| 매물 종류별 시설 옵션(`options`)이 어떻게 바뀌는지 | `[a17]` 에서 5개가 교체된 것만 잡혔고 무엇이 무엇으로 바뀌었는지는 `mutations` 유실 구간과 겹쳐 복원 못 함 |
| 주소 검색 결과 「선택」 버튼 20개가 각각 무엇을 여는지 | 하나만 눌러 봤다 |
| 파일 업로드 3종의 실제 동작 | 클릭만 하고 업로드하지 않았다 |
| 유효성 검사·에러 메시지 | 등록 버튼을 누르지 않았으므로 전무 |
| 44초 이후의 세밀한 DOM 변이 | `mutations` 상한 초과로 이후가 전부 버려짐 |
| **선택지 목록의 출처 — 번들인가 서버 응답인가** | 필드로그는 네트워크를 기록하지 않고, SingleFile 은 JS 를 지운다. **개발자도구 Network 탭을 「보존」으로 켜고 목록을 열어 HAR 로 남기면 판정된다** (§0) |
| 목록이 열리기까지 걸리는 시간 | 버튼 클릭(`t=129,364`) 다음 이벤트가 항목 클릭(`t=131,984`)이라 그 사이가 비어 있다. 해당 구간 `mutations` 도 유실. **더 짧은 세션으로 재수집하면 잡힌다** |
