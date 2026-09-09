# 다방(다방프로) 매물 등록폼 — DOM 전수조사

`pro.dabangapp.com/form/room` 등록폼을 **DOM 조작 자동화**에 쓸 수 있는 형태로 정리한 문서다.
원본 캡처(18MB)를 다시 열지 않고 이 문서만으로 어댑터를 짤 수 있게 썼다.

> **이 문서는 실물 폼만 보고 독립적으로 작성했다.** 어떤 자동입력 구현도 참조하지 않았다.

---

## 0. 근거와 검증 방법

| 근거 | 무엇 |
|---|---|
| `fieldlog_capture_pro.dabangapp.com_2026-09-08T11-49.json` | 등록폼 레코드(`pages[2]`) 기준 필드 120 · 클릭대상 314 · 의미조작 327 · 원시이벤트 1,311 |
| 상태 `s2` (자동: 정지, 11:49:07Z) | 등록폼 DOM 91,275자 (`truncated: false`) — **이 캡처에 있는 유일한 등록폼 상태 스냅샷** |
| 상태 `s1` (자동: 시작) | `/dashboard` 화면. 등록폼이 아니다 |
| `mutations` 2,500건 (0.56~62.98초) | **이 문서의 조건부 그래프는 대부분 여기서 나왔다.** 필드로그의 요약보다 정확하다 |
| SingleFile (`singlefile/다방_매물등록폼.html`) | `/form/room`, 20:51:09 — 세션 종료 2분 뒤 |
| `pages[0]` | 유튜브 광고 iframe. 폼과 무관 |
| `pages[1]` | **주소 검색 팝업 창** — 카카오 우편번호 교차출처 iframe |

검증 방식:

- 폼 골격은 SingleFile 과 상태 `s2` 를 각각 lxml 로 파싱해 대조했다 (컨트롤 수·클래스 전부 일치).
- **조건부 표시는 `mutations` 의 실제 DOM 변이 타임스탬프로 확정했다.**
  필드로그의 `timeline[].afterAction` 은 *스윕 직전의 마지막 조작*을 가리킬 뿐이라
  실제 원인 조작과 어긋난다(예: `buildingTradeUnitType` 재등장이 `a52` 로 기록됐지만
  실제 원인은 `a47`). **본문의 인과는 `mutations` 기준이고 초 단위 시각을 함께 적었다.**

### 이 문서가 다루지 못하는 것 · 원본 데이터의 함정

1. **빈 폼 상태 스냅샷이 없다.** 「현재 상태 기록」을 누르지 않아 시작 상태가 `/dashboard` 로 잡혔다.
   초기 구조는 SingleFile(작업 후)과 변이 기록을 되짚어 복원한 것이다.
   다만 SingleFile 시점에도 대부분의 칸이 비어 있어(값 `""`) 구조 파악에는 지장이 없었다.
2. **㎡↔평 자동환산 여부는 이 캡처로 알 수 없다.** 전용면적·공급면적 칸은 **클릭만 하고
   한 글자도 타이핑하지 않았다**(`[a57]~[a60]`, `observations` 0건). 미확인이다.
3. **`mutations` 는 62.98초까지만 남았다.** 2,500건 상한에 닿으면 **새 항목을 버린다**
   (`recorder.js:970`). 63초 이후(시설·사진·설명 구간)는 `actions`·상태 DOM으로만 판단했다.
4. **`sideEffects` 1건은 오귀속이다.** 「방 수」 입력 → 「오픈형」 라디오 `false→true` 로 적혀 있으나,
   방 수 입력(`[a62]` 63.7초)과 오픈형 라디오는 별개 조작이다. 믿지 말 것.
5. **`change` 액션의 `after` 는 250ms 뒤 값이다.** 빠르게 연속 클릭하면 이미 다음 상태가 찍힌다
   (예: `[a190]` 개별난방 change 의 after 가 `checked:false` — 그 사이에 중앙난방을 눌렀다).
   **`before`/`after` 쌍이 아니라 조작 순서로 읽어야 한다.**
6. **관리비 「있음」 갈래는 열어 보지 않았다** (`[a124,a125]` 에서 select 를 클릭만 하고 값을 바꾸지 않음).
7. 캡처에 중개사무소명·실제 단지명이 들어 있다. 이 문서에서는 가렸다.

---

## 1. 페이지 기본 성질 — **세 플랫폼 중 가장 까다롭다**

| 항목 | 값 | 근거 |
|---|---|---|
| URL | `https://pro.dabangapp.com/form/room` | `meta.url` |
| 프레임 | 등록폼은 **top 프레임 단일** | 상태 DOM |
| open Shadow DOM | **없음** | `openShadows: []` |
| 레이아웃 | **`<table>` 기반.** `table > tbody > tr > th`(라벨) + `td`(컨트롤) | §2 |
| `<form>` | 있으나 **주소 검색 입력 1개와 검색 버튼 1개만 감싼다.** 나머지 칸은 폼 밖 | 파싱 결과 |
| 스타일 | **styled-components.** 클래스가 전부 해시 (`styled__Input-sc-z0kji1-0 jZhsRO`) | §5 |
| **`name` 속성** | 폼 전체에 **고유 이름 10개뿐**, 총 20개 요소에만 붙어 있다 | §5-1 |
| **`id` 속성** | 폼 전체에 **8개뿐**, 전부 상단 네비/제출 버튼 | §5-2 |
| `data-*` | `data-styled`, `data-styled-version` 2종뿐. **자동화용 훅 0건** | 전수 스캔 |
| 컨트롤 수 | `input` 87 · `select` 12 · `textarea` 2 · `button` 25 (SingleFile 기준) | 파싱 결과 |
| 주소 입력 | **별도 브라우저 창** + 교차출처 iframe(`postcode.map.kakao.com`) | §4 |

> **요약: 다방은 `name`·`id`·`data-*` 어느 것으로도 칸을 지목할 수 없다.**
> 유일하게 믿을 수 있는 것은 **표 구조(`tr` 의 `th > h1` 라벨)** 와 **라벨 텍스트**다.

---

## 2. 구조 — `<table>` 한 행이 곧 한 필드 그룹

```html
<section class="styled__ScrollElement-sc-h5ond6-4 … scroll-element">
  <h1 class="styled__Title-sc-h5ond6-6 …">매물 정보</h1>
  <table class="styled__Table-sc-h5ond6-7 …">
    <tbody>
      <tr>
        <th><h1>매물유형<span>*</span></h1></th>          ← 행 라벨. 필수는 <span>*</span>
        <td>
          <header class="styled__SubHeader-sc-11n8fre-0 …"><h1>대분류</h1></header>
          <button class="styled__Btn-sc-11n8fre-1 gbRpVV"><span>주택 / 빌라</span>…</button>
          …
        </td>
        <td>
          <header …><h1>소분류</h1></header>
          <label class="styled__Label-sc-1dsgd8d-0 …">
            <input class="styled__Radio-sc-1dsgd8d-2 …" name="buildingType" type="radio" value="on">
            <p class="styled__TextContent-sc-1dsgd8d-3 …">빌라/연립/다세대</p>
          </label>
          …
        </td>
      </tr>
      …
    </tbody>
  </table>
</section>
```

**따라서 모든 셀렉터의 출발점은 이것이다.**

```
table tr  중  th h1 의 텍스트(끝의 * 제거)가 "매물유형" 인 것
  → 그 tr 안의 td
  → (필요하면) td header h1 텍스트로 서브그룹 좁히기
  → label 안 <p> 텍스트 또는 <select>/<input> 순서로 컨트롤 지목
```

### 섹션 7개와 상단 네비

| 네비 버튼 `id` | 라벨 | 섹션 제목 | `tr` 수 |
|---|---|---|---:|
| `room_info_btn` | 1 매물 정보 | 매물 정보 | 6 |
| `trade_info_btn` | 2 거래 정보 | 거래 정보 | 6 |
| `additional_info_btn` | 3 추가 정보 | 추가 정보 | 6 |
| `facility_info_btn` | 4 시설 정보 | 시설 정보 | 5 |
| `visual_info_btn` | 5 사진등록 | 사진 등록 | 2 |
| `detail_info_btn` | 6 상세 설명 | 상세 설명 | 3 |
| `product_info_btn` | 7 상품 적용 | 연락처 선택 / 상품 적용 | 1 |
| `submit` | 등록 완료 | — | — |

**이 8개가 폼 전체에서 유일하게 안정적인 `id` 다.** `#submit` 은 ⚠ 절대 누르지 말 것.

---

## 3. 화면 위 → 아래 골격 (대분류 = 「주택 / 빌라」 기준)

`▣` = `tr` 의 `th` 라벨, `·` = `td` 안 서브 라벨(`header h1`).

```
[상단]  다방 매물 등록   [복사하기]
        매물 등록 안내 3줄 (공인중개사법 준수 / 분양·경매 등 등록 불가 / 공공API 참고값)
[네비]  1 매물 정보  2 거래 정보  3 추가 정보  4 시설 정보  5 사진등록  6 상세 설명  7 상품 적용

§ 매물 정보
 ▣ 매물유형 *
     · 대분류   button ×3 — 「주택 / 빌라」 「오피스텔」(원투룸에도 동시노출!) 「아파트(도시형)」
     · 소분류   input[name=buildingType][type=radio][value=on] ×5
                빌라/연립/다세대 · 단독주택 · 다가구주택 · 상가주택 · 기타
                □ 미등기건물에 해당하는 경우 체크   (name 없음)
 ▣ 매물 주소 *
     · 주소 검색  input[name=keyword] placeholder="예) 번동 10-1, 강북구 번동"
                 button[type=submit] 「검색」        ← 카카오 팝업 창을 연다
     · 동 입력    input[name=dong] placeholder="예) 101" + 단위 <p>동</p>   (초기 disabled)
     · 호 입력(선택) input[name=ho]  placeholder="예) 101" + 단위 <p>호</p>   (초기 disabled)
                 □ 등기부등본 상에 ‘동’ 정보가 없을 경우 체크   (초기 disabled)
                 button 「주소가 검색되지 않는다면?」
 ▣ 매물 크기 *
     · 전용면적    input[name=room]  placeholder="평수 입력" inputmode=numeric + <p>평</p>
                 <p>=</p>
                 input[name=room]  placeholder="㎡ 입력"  inputmode=decimal + <p>㎡</p>
     · 공급면적(선택) input[name=supply] 평 / ㎡  (같은 구조)
 ▣ 방 정보 *
     · 방 수      input[type=text][inputmode=numeric] + <p>개</p>      (name 없음)
     · 방 거실 형태 radio 오픈형 / 분리형                                 (name 없음)
     · 방 특징(선택) checkbox 신축 / 큰길가 / 반려동물                      (name 없음)
 ▣ 건축물용도 *   select (옵션 32)  + button 「건축물용도 가이드」          (name 없음)
 ▣ 건축물승인 *   select (옵션 4) + input placeholder="예)20210720" + 달력 아이콘 button

§ 거래 정보
 ▣ 거래 종류 *   radio 매매 / 전세 / 월세  + □ 단기임대                    (name 없음)
 ▣ 가격 정보 *
     · 보증금     input[name=deposit] + <p>만원</p>
     · 월세      input[name=price]   + <p>만원</p>                    ← 월세 선택 시에만
 ▣ 융자금 여부   select (옵션 4) + input placeholder="융자금 입력" + <p>만원</p>
 ▣ LH 전세임대 여부 *  radio[name=isLhLease] 불가능 / 가능
 ▣ 관리비 *
     · 관리비 여부  select (옵션 3: 선택 / 없음 / 있음)
 ▣ 입주 가능 일자 *  radio 즉시 입주 / 일자 선택
                  input placeholder="예)20210720" + 달력 아이콘 button
                  □ 협의 가능할 경우

§ 추가 정보
 ▣ 층 수 *
     · 전체 층 수  select (옵션 51: 선택 + 1~50층)
     · 해당 층 수  select (옵션 5 → 주소 검색 후 동적, §6-5)
     · 저/중/고   select (옵션 4: 선택/저/중/고)
     ·           □ 저/중/고 표기를 원할 경우 선택
 ▣ 방향 기준/방향 *  select (기준: 안방/거실) + select (방향 8종)
 ▣ 욕실 수 *      input + <p>개</p>   그리고 radio 없음 / 있음  ← 같은 tr 안에 섞여 있다
 ▣ 주차 가능 여부 * select (선택/불가능/가능) + input placeholder="총 가능 주차수" + <p>대</p>
 ▣ 복층 여부 *    radio 단층 / 복층  + select 현관 유형(복도식/계단식/복합식)
 ▣ 세대(가구수)   input + <p>세대</p>

§ 시설 정보
 ▣ 난방 시설   radio[name=heatingType] 선택 안함 / 개별난방 / 중앙난방 / 지역난방
 ▣ 냉방 시설   checkbox 벽걸이형 / 스탠드형 / 천장형
 ▣ 생활 시설   checkbox □ 전체 선택 + 침대 책상 옷장 식탁 쇼파 신발장 냉장고 세탁기 건조기
                        샤워부스 욕조 비데 싱크대 식기세척기 가스레인지 인덕션 전자레인지
                        가스오븐 TV 붙박이장   (20종 + 전체 선택)
 ▣ 보안 시설   checkbox □ 전체 선택 + 경비원 비디오폰 인터폰 카드키 CCTV 사설경비 현관보안 방범창
 ▣ 기타 시설   checkbox 화재경보기 / 베란다 / 테라스 / 마당 / 무인택배함

§ 사진 등록   button 「사진 등록 전, 반드시 확인해주세요!」
 ▣ 일반 사진 *  button 「사진 추가」
 ▣ (라벨 없음)  button 「360사진 추가」

§ 상세 설명
 ▣ 제목 *       input placeholder="리스트에 노출되는 문구입니다. 40자 이내로…" + <p>0/40</p>
 ▣ 상세설명 * (1000자 제한)  button 「AI 자동생성 (잔여 N회)」 + textarea + <p>0/1000</p>
 ▣ 비공개 메모   textarea placeholder="해당 내용은 외부에 공개되지 않으며…"

§ 연락처 선택
 ▣ 연락처       select (옵션 2: 선택 / 〈중개사 이름 (대표)〉)

§ 포커스 상품 / 상품 적용  (광고 상품 영역 — 매물 정보가 아니다)
 [등록 완료] button#submit                              ← ⚠ 절대 누르지 말 것
```

---

## 4. 주소 입력 — **별도 창 + 교차출처 iframe** (직방과 같은 방식)

`input[name=keyword]` 에 검색어를 넣고 `button[type=submit]`「검색」을 누르면 별도 창이 뜬다.

```json
"frameContext": { "depth": 0, "ancestorOrigins": [], "windowName": "",
                  "referrer": "https://pro.dabangapp.com/form/room" }
```

그 창의 문서 전체:

```html
<html lang="ko"><head><title>Kakao Postcode Service</title>…</head>
<body><iframe id="__kakao__viewerFrame_1" title="우편번호 검색 프레임"
  src="https://postcode.map.kakao.com/search?origin=https%3A%2F%2Fpro.dabangapp.com&…&fullpath=%2Fdashboard"
  style="width:100%;height:100%;min-width:300px"></iframe></body></html>
```

- 주소 UI는 `pro.dabangapp.com` 문서 안에 **없다.** 메인 페이지 content script로는 접근 불가.
- 주소가 확정되면 폼이 크게 재구성된다 (§6-5).
- 「오피스텔」·「아파트(도시형)」 대분류에서는 이 주소 검색이 **단지명 검색 UI로 통째로 교체된다**(§6-2).

---

## 5. 셀렉터 안정성 — **가장 불리한 플랫폼**

### 5-1. `name` — 고유 이름 10개, 총 20개 요소뿐. 게다가 **중복·가변**

| `name` | 개수 | 실제 대상 |
|---|---:|---|
| `buildingType` | 5 | 소분류 라디오 5개 — **`value` 가 전부 `"on"`** 이라 값으로 구분 불가 |
| `heatingType` | 4 | 난방 라디오 (오피스텔에서는 7개로 늘어남) — 역시 전부 `value="on"` |
| `room` | **2** | 전용면적 **평 칸과 ㎡ 칸이 같은 이름** |
| `supply` | **2** | 공급면적 평/㎡ — 동일 |
| `isLhLease` | 2 | 불가능 / 가능 |
| `keyword` | 1 | 주소 검색어 |
| `dong` | **1 + 대분류에 따라 select 도 `dong`** | 동 입력 input · 단지명 검색의 동/읍/면 select (§6-2) |
| `ho` | 1 | 호 입력 |
| `deposit` | 1 | 보증금 |
| `price` | 1 | 월세 |

> 조건부로만 등장하는 이름: `buildingTradeUnitType`(2) · `city` · `gu` · `complexSpaceSeq` ·
> `shortLeaseMonth` · `shortLeaseMonthNegotiationType` · `isAgreeLhLease` ·
> `takeTenantDeposit` · `takeTenantPrice`

**그리고 `name` 은 같은 요소에서 바뀐다.** 「건물 유형 = 건물 전체」를 고르면 (45.42초):

| 요소 | 이전 `name` | 이후 `name` |
|---|---|---|
| 면적 칸 2개 (평·㎡) | `room` | **`totalFloor`** |
| 면적 칸 2개 (평·㎡) | `supply` | **`land`** |

되돌리면 원래대로 돌아온다 (53.34초, 소분류를 상가주택으로 바꿨을 때).
같은 시점에 「전체 층 수」 라벨이 「지상 총 층수」로 바뀌고 「지하 총 층수」 select 가 새로 생긴다.

⇒ **`input[name=room]` 을 잡아 두고 재사용하면 다른 의미의 칸을 채우게 된다.**

### 5-2. `id` — 8개, 전부 네비/제출

`room_info_btn` `trade_info_btn` `additional_info_btn` `facility_info_btn`
`visual_info_btn` `detail_info_btn` `product_info_btn` `submit`

### 5-3. 클래스 — styled-components 해시

```
class="styled__Input-sc-z0kji1-0 jZhsRO"
       └───────┬───────┘└──┬──┘ └──┬──┘
        컴포넌트명      componentId  생성 클래스
```

- **componentId(`sc-z0kji1`)** 는 babel 플러그인이 파일 경로·컴포넌트명·빌드 시드로 만든다.
  같은 빌드 안에서는 고정이지만 **배포가 바뀌면 바뀔 수 있다.**
- **생성 클래스(`jZhsRO`)** 는 평가된 CSS 해시다. **스타일을 한 줄만 고쳐도 바뀐다.**
- 이번 캡처의 SingleFile 과 상태 `s2` 는 해시가 완전히 같았으나 **둘 다 같은 페이지 로드**라
  **재로드/재배포 안정성은 증명되지 않았다.**

주요 componentId (참고용, 1차 셀렉터로 쓰지 말 것):

| 용도 | 클래스 |
|---|---|
| 텍스트 입력 | `styled__Input-sc-z0kji1-0` |
| 단위 표시 `<p>` | `styled__Unit-sc-z0kji1-6` / 글자수 `styled__CountUnit-sc-z0kji1-5` |
| 셀렉트 | `styled__Select-sc-bc5rkf-0` |
| 라디오 | `styled__Radio-sc-1dsgd8d-2` (라벨 `styled__Label-sc-1dsgd8d-0`, 글 `styled__TextContent-sc-1dsgd8d-3`) |
| 체크박스 | `styled__Checkbox-sc-tgtjdv-1` (라벨 `styled__Label-sc-tgtjdv-0`, 글 `styled__TextContent-sc-tgtjdv-2`) |
| 대분류 버튼 | `styled__Btn-sc-11n8fre-1` (서브헤더 `styled__SubHeader-sc-11n8fre-0`) |
| 표 / 섹션 | `styled__Table-sc-h5ond6-7` / `styled__ScrollElement-sc-h5ond6-4 … scroll-element` / 제목 `styled__Title-sc-h5ond6-6` |
| 행 서브 제목 | `styled__Title-sc-1byef5a-1` |
| 날짜 픽커 | `styled__Picker-sc-usl4dr-0` / 달력 `styled__CalendarWrap-sc-usl4dr-1` |

### 5-4. 그래서 무엇으로 잡나 — **권장 순서**

1. `tr` 의 `th h1` 텍스트 (끝의 `*` 제거) — 가장 안정적
2. `td` 안 `header h1` 서브 라벨
3. `label > p` 의 텍스트 (라디오·체크박스)
4. `<p>` 단위 텍스트(`평` `㎡` `만원` `개` `대` `세대`)로 같은 행 안의 형제 칸 구분
5. `placeholder` (`평수 입력` `㎡ 입력` `총 가능 주차수` `융자금 입력` `예)20210720` …)
6. `<select>` 는 **옵션 집합으로 식별**하는 것도 확실하다 (§7 카탈로그가 전부 서로 다르다)

---

## 6. 조건부 표시 그래프 (시각은 `mutations` 기준)

### 6-1. 소분류(`buildingType`) → 「건물 유형」 행

| 소분류 | 「건물 유형 *」(건물 일부(방 또는 일부) / 건물 전체) | 근거 |
|---|---|---|
| 단독주택 | **표시** | 6.95초 `[a3]` · 38.82초 `[a39]` |
| 다가구주택 | **표시(유지)** | 43.35초 `[a46]` |
| 상가주택 | 숨김 | 9.36초 `[a9]` · 53.34초 `[a53]` |
| 기타 | 숨김 | — |
| 빌라/연립/다세대 | 숨김 | 42.06초 `[a43]` |

### 6-2. 대분류 → 폼 전체가 갈린다 (16.30초, 「오피스텔」 선택 시)

| 영역 | 「주택 / 빌라」 | 「오피스텔」 (그리고 「아파트(도시형)」) |
|---|---|---|
| 소분류 | `buildingType` 라디오 5개 + 미등기건물 체크박스 | **전부 제거.** 라벨만 「오피스텔」 |
| 주소 | 주소 검색 + 동/호 + 등기부등본 체크박스 | **단지명 검색**: `select[name=city]`(17) → `select[name=gu]` → `select[name=dong]` → 단지검색 `input` → 동/호 입력 |
| 주소 안내 | button 「주소가 검색되지 않는다면?」 | 「단지명이 존재하지 않을 경우 고객센터로 문의하세요.(1899-…)」 |
| 매물 크기 | 전용면적 평/㎡ + 공급면적 평/㎡ | **`select[name=complexSpaceSeq]` 「평형」 하나로 교체** + 안내문 |
| 건축물용도 | 옵션 **32개** | 옵션 **4개** — 선택 / 공동주택 / 업무시설 / 숙박시설 |
| 전체 층 수 | 옵션 51 (1~50층) | 옵션 **56** (1~55층) |
| 해당 층 수 | 반지층 · 옥탑 포함 | **반지층·옥탑 제거** |
| 주차 | 총 가능 주차수 1칸 | **「세대당 주차수」 칸 추가** (`대`) |
| 난방 시설 | 4종 | **7종** (개별/중앙/지역 **냉난방** 3종 추가) |
| 세대(가구수) 행 | 있음 | **제거** |

「주택 / 빌라」로 되돌리면 위가 전부 역으로 복구된다 (35.06초 `[a32]`).
「아파트(도시형)」로 바꾸면 시/도 목록이 비워졌다가 다시 채워진다 (19.06초 `[a18]`) — **목록 리셋**.

### 6-3. 미등기건물 체크 → 매매 봉쇄 (37.44초, `[a34/a35]`)

같은 밀리초에 세 가지가 함께 일어났다.

- 이름 없는 `<input>` 하나의 `disabled` 가 토글됐다. **최종 상태에서 「매매」 라디오가 `disabled`** 이므로
  이것이 매매 라디오로 보인다.
- 매매 전용 칸 「현 보증금(만원)」·「현 월세(만원)」·「세안고 매매」가 **제거**됐다
  (필드 이름 `takeTenantDeposit` · `takeTenantPrice`).
- 「LH 전세임대 여부 * 불가능 / 가능」 행이 **추가**됐다.

> ⚠ 중간 인과(미등기건물 → 매매 비활성 → 거래 종류가 전세로 전환 → 전세 전용 행 표시)가
> 이 기록만으로 분리되지 않는다. **관측된 연쇄**로만 적는다.

### 6-4. 거래 종류

| 조작 | 결과 | 근거 |
|---|---|---|
| 「월세」 선택 | `input[name=price]`(월세) + □ 단기임대 체크박스 표시 | `[a95]` |
| 「전세」 선택 | 보증금(`deposit`)만. 월세 칸 없음 | `[a91]` 이후 상태 |
| □ 단기임대 체크 | `select[name=shortLeaseMonth]`(24) + `select[name=shortLeaseMonthNegotiationType]`(3) 표시 | `[a97]` |
| □ 단기임대 해제 | 위 두 select 제거 | `[a105]` |
| `isLhLease` = 가능 | `input[name=isAgreeLhLease]` (필수 동의 체크박스) 표시 | `[a114]` |
| `isLhLease` = 불가능 | 위 체크박스 제거 | `[a123]` |

### 6-5. 건물 유형 = 「건물 전체」 → 매물 단위가 통째로 바뀐다 (45.42초, `[a49/a50]`)

- **제거**: 동 입력 · 호 입력 · 등기부등본 체크박스 / 방 거실 형태(오픈형·분리형) /
  방 특징(신축·큰길가·반려동물) / 해당 층 수 / 저/중/고 / 저중고 표기 체크박스
- **추가**: 「지하 총 층수」 select (0층~)
- **라벨 변경**: 「전체 층 수」 → 「지상 총 층수」
- **`name` 변경**: `room`→`totalFloor`, `supply`→`land` (§5-1)

소분류를 다시 바꾸면(53.34초, 상가주택) 전부 역으로 복구된다.

### 6-6. 주소 검색 결과 → 해당 층 수 옵션 재생성

`select` 「해당 층 수」의 옵션이 상황에 따라 다시 만들어진다.
초기 5개(선택/반지층/옥탑/1층/2층) → 최종 **14개**
(선택 / 반지층 / 옥탑 / 0층 / 1층 … 10층).

⚠ **최종 목록에는 `value="0"` 이 「옥탑」과 「0층」 둘에 중복으로 붙어 있다.**
`value` 로 고르면 어느 쪽이 선택될지 보장되지 않는다. **텍스트로 고를 것.**

### 6-7. 단지명 검색 종속 드롭다운 (오피스텔/아파트)

`select[name=city]` 변경 → `select[name=gu]` 의 `disabled` 해제 + 옵션 채워짐 (24.23~24.30초)
→ `select[name=gu]` 변경 → `select[name=dong]` 해제 + 옵션 채워짐 (26.53~26.60초)
→ `select[name=dong]` 변경 → 단지검색 `input` 해제 (28.75초)

**순서를 지키지 않으면 다음 단계가 `disabled` 라 조작이 무시된다.**

### 6-8. 저/중/고

`select` 「저/중/고」는 초기부터 있고, □ 「저/중/고 표기를 원할 경우 선택」 체크박스와 짝이다
(`[a147]`~`[a156]`). 체크박스가 select 를 활성화하는지 표시 여부만 바꾸는지는 **미확인**.

---

## 7. 선택지 카탈로그 (전수 — `<select>` 에서 그대로 읽음)

| 라벨 (`th h1` 또는 서브 라벨) | `name` | 옵션 (`value` = 표시) |
|---|---|---|
| 건축물용도 | 없음 | `""`=선택 · `DETACHED_HOUSE`=단독주택 · `APARTMENT_HOUSE`=공동주택 · `FIRST_NEARBY_ROAD_FACILITIES`=제1종근린생활시설 · `SECOND_NEARBY_ROAD_FACILITIES`=제2종근린생활시설 · `BUSINESS_FACILITIES`=업무시설 · `ACCOMMODATION`=숙박시설 · `CULTURE_ASSEMBLY_FACILITIES`=문화 및 집회시설 · `RELIGION_FACILITIES`=종교시설 · `SALES_FACILITIES`=판매시설 · `TRANSPORT_FACILITIES`=운수시설 · `MEDICAL_FACILITIES`=의료시설 · `EDUCATION_RESEARCH_FACILITIES`=교육연구시설 · `ELDERLY_EARLY_FACILITIES`=노유자(노인 및 어린이 시설) · `TRAINING_FACILITIES`=수련시설 · `SPORT_FACILITIES`=운동시설 · `RECREATIONAL_FACILITIES`=위락시설 · `FACTORY`=공장 · `STORAGE_FACILITIES`=창고시설 · `DANGEROUS_STORAGE_PROCESSING_FACILITIES`=위험물 저장 및 처리 시설 · `AUTOMOBILE_RELATED_FACILITIES`=자동차 관련 시설 · `ANIMAL_PLANT_RELATED_FACILITIES`=동물 및 식물 관련 시설 · `RECYCLE_RELATED_FACILITIES`=자원순환 관련 시설 · `CORRECTIONAL_MILITARY_FACILITIES`=교정 및 군사 시설 · `BROADCASTING_COMMUNICATION_FACILITIES`=방송통신시설 · `POWER_PLANT_FACILITIES`=발전시설 · `CEMETERY_RELATED_FACILITIES`=묘지 관련 시설 · `TOURIST_BREAK_FACILITIES`=관광 휴게시설 · `FUNERAL_FACILITIES`=장례시설 · `CAMPSITE_FACILITIES`=야영장 시설 · `UNREGISTERED_BUILDING`=미등기건물 · `REST_LAND_FIXTURE`=그 밖에 토지의 정착물 **(32)** |
| 건축물승인 | 없음 | `""`=선택 · `USE_APPROVAL_DATE`=사용승인일 · `USE_INSPECTION_DATE`=사용검사일 · `COMPLETION_CERTIFICATE_DATE`=준공인가일 |
| 융자금 여부 | 없음 | `""`=선택 · `THIRTY_OVER`=시세대비30% 이상 · `THIRTY_UNDER`=시세대비30% 미만 · `NOT_EXIST`=없음 |
| 관리비 여부 | 없음 | `""`=선택 · `false`=없음 · `true`=있음 |
| 전체 층 수 | 없음 | `""`=선택 · `1`=1층 … `50`=50층 **(51 / 오피스텔·아파트에서는 55층까지 56개)** |
| 해당 층 수 | 없음 | `""`=선택 · `-1`=반지층 · `0`=옥탑 · **`0`=0층(중복!)** · `1`=1층 … (동적) |
| 저/중/고 | 없음 | `""`=선택 · `LOW`=저 · `MIDDLE`=중 · `HIGH`=고 |
| 방향 기준 | 없음 | `""`=기준 선택 · `MAIN_ROOM`=안방 · `LIVING_ROOM`=거실 |
| 방향 | 없음 | `""`=방향 선택 · `EAST`=동향 · `WEST`=서향 · `SOUTH`=남향 · `NORTH`=북향 · `NORTH_EAST`=북동향 · `NORTH_WEST`=북서향 · `SOUTH_EAST`=남동향 · `SOUTH_WEST`=남서향 |
| 주차 가능 여부 | 없음 | `""`=선택 · `false`=불가능 · `true`=가능 |
| 현관 유형 | 없음 | `""`=선택 · `AISLE`=복도식 · `STAIR`=계단식 · `MIX`=복합식 |
| 연락처 | 없음 | `""`=선택 · 〈중개사 계정 id〉=〈이름 (대표)〉 |
| 단기임대 개월 | `shortLeaseMonth` | `""`=개월 · `1`=1개월 … `23`=23개월 **(24)** |
| 단기임대 협의 | `shortLeaseMonthNegotiationType` | `""`=협의 가능 여부 · `UNDER`=이내 협의가능 · `OVER`=이상 협의가능 |
| 단지 시/도 | `city` | `""`=시/도 · `11`=서울특별시 · `12`=전남광주통합특별시 · `26`=부산광역시 · `27`=대구광역시 · `28`=인천광역시 · `30`=대전광역시 · `31`=울산광역시 · `36`=세종특별자치시 · `41`=경기도 · `43`=충청북도 · `44`=충청남도 · `47`=경상북도 · `48`=경상남도 · `50`=제주특별자치도 · `51`=강원특별자치도 · `52`=전북특별자치도 **(17)** |
| 단지 시/군/구 | `gu` | 시/도에 따라 동적 (행정코드 5자리) |
| 단지 동/읍/면 | `dong` | 시/군/구에 따라 동적 (행정코드 8자리) |
| 평형 | `complexSpaceSeq` | 단지 선택 후 동적 |

**라디오·체크박스 선택지**

| 그룹 | 항목 |
|---|---|
| 대분류(버튼) | 주택 / 빌라 · 오피스텔 · 아파트(도시형) |
| 소분류 `buildingType` | 빌라/연립/다세대 · 단독주택 · 다가구주택 · 상가주택 · 기타 |
| 건물 유형 `buildingTradeUnitType` | 건물 일부(방 또는 일부) · 건물 전체 |
| 방 거실 형태 | 오픈형 · 분리형 |
| 방 특징(다중) | 신축 · 큰길가 · 반려동물 |
| 거래 종류 | 매매 · 전세 · 월세 (+ □ 단기임대) |
| LH 전세임대 `isLhLease` | 불가능 · 가능 (가능 시 □ `isAgreeLhLease` 필수 동의) |
| 입주 가능 일자 | 즉시 입주 · 일자 선택 (+ □ 협의 가능할 경우) |
| 엘리베이터 | 없음 · 있음 |
| 복층 여부 | 단층 · 복층 |
| 난방 시설 `heatingType` | 선택 안함 · 개별난방 · 중앙난방 · 지역난방 (+ 오피스텔: 개별/중앙/지역 냉난방) |
| 냉방 시설(다중) | 벽걸이형 · 스탠드형 · 천장형 |
| 생활 시설(다중, 20종 + 전체 선택) | 침대 책상 옷장 식탁 쇼파 신발장 냉장고 세탁기 건조기 샤워부스 욕조 비데 싱크대 식기세척기 가스레인지 인덕션 전자레인지 가스오븐 TV 붙박이장 |
| 보안 시설(다중, 8종 + 전체 선택) | 경비원 비디오폰 인터폰 카드키 CCTV 사설경비 현관보안 방범창 |
| 기타 시설(다중) | 화재경보기 · 베란다 · 테라스 · 마당 · 무인택배함 |

> 「전체 선택」 체크박스가 생활 시설·보안 시설 각 그룹의 **맨 앞**에 하나씩 있다.
> 켜면 그 그룹 전부가 켜지고 끄면 전부 꺼진다 (`[a205]~[a210]`, `[a265]~[a270]`).

---

## 8. 컨트롤 조작 방법

### 8-1. 라디오 / 체크박스 — **네이티브 `checked` 가 살아 있다**

```html
<label class="styled__Label-sc-1dsgd8d-0 …">
  <input class="styled__Radio-sc-1dsgd8d-2 …" name="buildingType" type="radio" value="on">
  <p class="styled__TextContent-sc-1dsgd8d-3 …">빌라/연립/다세대</p>
</label>
```

- 세 플랫폼 중 유일하게 **`input.checked` 로 상태를 그대로 읽을 수 있다.**
  라벨 클래스는 선택 여부에 따라 바뀌지 않는다(확인함).
- `value` 는 전부 `"on"` 이라 **값으로 구분 불가.** 형제 `<p>` 텍스트가 유일한 이름이다.
- 실제 사용자 이벤트 순서: `<p>` 클릭 → `<input>` click → `change`. 자동화도 같은 경로가 안전하다.

### 8-2. 셀렉트 — **진짜 `<select>` 다**

Radix 같은 가짜 드롭다운이 아니라 네이티브 `<select>` 라서, `value` 를 설정하고
`change` 이벤트를 `bubbles:true` 로 디스패치하면 된다 (React 제어 컴포넌트이므로
네이티브 setter 를 거칠 것). **세 플랫폼 중 드롭다운 조작이 가장 쉽다.**

다만 `name` 이 대부분 없으므로 **행 라벨이나 옵션 집합으로 찾아야 한다**(§5-4).

### 8-3. 대분류 버튼 — 상태 속성이 없다

```html
<button class="styled__Btn-sc-11n8fre-1 gbRpVV"><span>주택 / 빌라</span><svg/></button>
<button class="styled__Btn-sc-11n8fre-1 fDIeVd"><span>오피스텔</span>…</button>
<button class="styled__Btn-sc-11n8fre-1 fDIeVd"><span>아파트(도시형)</span><svg/></button>
```

`aria-pressed`·`data-state`·`disabled` 어느 것도 없다. **선택된 버튼만 생성 클래스가 다르다**
(선택 `gbRpVV` / 비선택 `fDIeVd` — 이 값 자체는 빌드마다 바뀌는 해시다).
⇒ 실무적으로는 **세 버튼 중 클래스가 혼자 다른 것이 선택된 것**으로 판정할 수 있으나,
클래스 값을 하드코딩하지 말 것. 더 확실한 검증은 **누른 뒤 폼이 §6-2대로 바뀌었는지**를 보는 것이다.

### 8-4. 날짜 — 자체 캘린더 (인페이지)

```html
<div class="styled__Picker-sc-usl4dr-0 …">
  <div class="styled__InputWrap-sc-z0kji1-7 …">
    <input type="text" inputmode="numeric" placeholder="예)20210720" class="styled__Input-sc-z0kji1-0 …" value="">
    <button type="button" class="styled__RightIconBtn-sc-z0kji1-4 …"><svg/></button>   ← 달력 열기
  </div>
</div>
```

아이콘을 누르면 같은 문서 안에 캘린더가 열린다.

```html
<div class="styled__CalendarWrap-sc-usl4dr-1 …">
  <div class="styled__Wrap-sc-1ywqa4g-0 …">
    <button class="styled__TodayBtn-sc-1ywqa4g-1 …">today</button>
    <header class="styled__Header-sc-1ywqa4g-2 …">
      <button><svg/></button>                                   ← 이전 달
      <div class="styled__CurrentDate-sc-1ywqa4g-3 …"><button>2026</button><span>.</span><button>09</button></div>
      <button><svg/></button>                                   ← 다음 달
    </header>
    <ul class="styled__DayGrid-sc-1gf4dou-0 …"><li>일</li>…<li>토</li></ul>
    <ul class="styled__DateGrid-sc-1gf4dou-1 …">
      <li></li><li></li>                                        ← 첫 주 빈칸
      <li><button class="styled__DateBtn-sc-1gf4dou-2 DDhis">1</button></li> …
    </ul>
  </div>
</div>
```

- 연/월은 `div.styled__CurrentDate-…` 안의 두 `<button>` 을 눌러 고른다.
- 날짜 칸은 `ul.styled__DateGrid-… > li > button` — **텍스트가 일 숫자뿐**이고 `name`·`aria-label` 이 없다.
  앞뒤 달 넘침 칸은 아예 빈 `<li>` 라 **표시된 달의 날짜만 버튼으로 존재한다** (직방보다 안전하다).
- **텍스트 입력 칸은 `readonly` 가 아니다** (`inputmode="numeric"`, placeholder `예)20210720`).
  타이핑으로 넣을 수 있을 가능성이 높지만 **이 캡처에서는 시도하지 않았다 — 미검증.**
- 확정된 값 형식은 `2026.11.12` (점 구분).

### 8-5. 사진 — 버튼만 잡혔다

「사진 추가」/「360사진 추가」 버튼을 누르면 `input[type=file]` 이 열린다
(필드로그가 `input/file` 2개를 잡았으나 `everVisible: false`).
드래그 앤 드롭 안내(`To pick up a draggable item, pre…`)가 있는 것으로 보아 순서 변경은 드래그다.
**구체적 마크업은 미확보** — 파일 선택 대화상자가 열려 캡처가 끊겼다.

### 8-6. 숫자 칸은 문자 입력을 거절한다

「방 수」 칸에 `ㄱ` 을 넣었더니 값이 남지 않았다 (`rejected: true`).
`inputmode="numeric"` 인 칸에는 숫자만 넣을 것.

---

## 9. 자동화 구현 체크리스트

1. **셀렉터는 표 구조로만 짠다.** `tr` → `th h1` 텍스트(끝 `*` 제거) → `td` → 라벨 텍스트.
   `name`·`id`·`class` 를 1차 키로 쓰지 말 것.
2. **`name` 을 캐싱하지 말 것.** 같은 요소의 `name` 이 `room ↔ totalFloor`, `supply ↔ land` 로 바뀐다.
   조작 직전에 다시 조회할 것.
3. **면적 칸은 평/㎡ 두 개가 이름이 같다.** 형제 `<p>` 의 단위 텍스트(`평`/`㎡`) 또는
   `placeholder`(`평수 입력`/`㎡ 입력`)로 구분한다.
   ⚠ **㎡↔평 자동환산 여부는 미확인**이다(§0-2). 양쪽을 다 채우면 서로 덮어쓸 위험이 있으므로,
   **먼저 한쪽만 넣고 반대쪽이 자동으로 채워지는지 확인하는 절차를 구현에 넣을 것.**
4. **순서가 강제된다.**
   ① 대분류 → ② 소분류 → ③ (단독/다가구면) 건물 유형 → ④ 주소(팝업 또는 단지명 3단 드롭다운) →
   ⑤ 면적 → ⑥ 거래 종류 → ⑦ 가격 → ⑧ 층 수 → ⑨ 나머지.
   대분류·건물 유형·미등기건물을 나중에 바꾸면 **폼 절반이 다시 그려지며 입력값이 날아간다.**
5. **단지명 3단 드롭다운은 상위를 고르기 전에는 하위가 `disabled`** 다(§6-7).
6. **「해당 층 수」의 `value="0"` 은 「옥탑」과 「0층」에 중복**된다. 텍스트로 고를 것.
7. **라디오·체크박스는 `input.checked` 로 현재 상태를 읽고 나서** 누른다.
   특히 「전체 선택」은 그룹 전체를 뒤집으므로 개별 항목보다 먼저 처리한다.
8. **주소는 DOM 조작으로 못 넣는다.** 별도 창 + 교차출처 iframe(§4).
9. **`button#submit`(등록 완료)를 누르지 말 것.**
10. **광고 상품 영역(포커스 상품 / 상품 적용)은 매물 정보가 아니다.** 건드리지 말 것.
11. 상단 네비 `#room_info_btn` 등은 해당 섹션으로 스크롤시키는 용도라
    **긴 폼에서 요소를 화면에 올릴 때 쓸 수 있다.**

---

## 10. 다시 캡처해야 알 수 있는 것

| 항목 | 왜 지금 모르나 | 어떻게 확인하나 |
|---|---|---|
| **㎡↔평 자동환산** | 면적 칸에 한 글자도 입력하지 않았다 | ㎡ 칸에만 값을 넣고 평 칸이 변하는지, 반대도 확인 |
| **빈 폼 초기 상태** | 시작 상태가 `/dashboard` 로 잡혔다 | 폼을 열자마자 「현재 상태 기록」 |
| 날짜 칸 직접 타이핑 가능 여부 | 캘린더로만 넣었다 | `예)20210720` 칸에 `20260808` 타이핑 |
| 관리비 「있음」 갈래 | select 를 클릭만 하고 바꾸지 않았다 | 「있음」 선택 후 상태 기록 |
| 「아파트(도시형)」 대분류의 정확한 차이 | 「오피스텔」과 같은 방향으로 바뀌는 것만 확인 | 각각 선택 후 상태 기록 |
| 사진 업로드 UI 마크업 | 파일 대화상자가 열려 캡처가 끊겼다 | 업로드 후 상태 기록 |
| 「저/중/고 표기」 체크박스의 역할 | 표시/활성 어느 쪽인지 미확인 | 체크 전후 상태 기록 |
| 스타일 해시(`jZhsRO` 등)의 재로드 안정성 | SingleFile 1개가 같은 로드였다 | **새로고침 후 SingleFile 한 번 더** |
| 63초 이후 세밀한 DOM 변이 | `mutations` 상한 초과 | 시설·사진·설명 구간만 짧게 재수집 |
| 유효성 검사·필수값 처리 | 제출하지 않았다 | — |
