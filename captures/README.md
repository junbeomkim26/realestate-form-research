# captures/ — 현장 수집 결과

`tools/필드로그`로 수거한 `schemaVersion: 2` JSON과, 선택해서 함께 찍은 PNG를 여기에 넣는다.

수집 한 회분을 `<날짜>-현장수집/<플랫폼>/` 로 묶고, 그 안에 필드로그 JSON 과 (SingleFile 등으로
따로 저장한 페이지 스냅샷이 있으면) `singlefile/` 을 둔다. **데이터 파일은 git 이 추적하지
않는다** — 회분마다 `README.md` 를 써서 목록·품질·개인정보 메모를 남기고 그것만 추적한다.

| 회분 | 내용 |
|---|---|
| [`2026-09-08-현장수집/`](2026-09-08-현장수집/README.md) | 직방·다방·당근 등록폼 확보 + 참고 2곳 + 연습 1건 |

플랫폼별로 파고든 결과는 그 폴더 안에 **`DOM-전수조사.md`** 로 남긴다. 데이터는 git 이 추적하지
않으므로, **이 문서들이 실물에 대한 유일한 공유 근거**다.

| 분석 | 상태 |
|---|---|
| [`…/당근부동산/DOM-전수조사.md`](2026-09-08-현장수집/당근부동산/DOM-전수조사.md) | **전수조사 완료** — DOM 조작 자동화용 기준 문서 |
| [`…/직방/DOM-전수조사.md`](2026-09-08-현장수집/직방/DOM-전수조사.md) | **전수조사 완료** — 〃 |
| [`…/다방/DOM-전수조사.md`](2026-09-08-현장수집/다방/DOM-전수조사.md) | **전수조사 완료** — 〃 |

`DOM-전수조사.md` 세 편은 **캡처를 다시 열지 않고 어댑터를 짤 수 있게** 만든 기준 문서다.
폼 골격(위→아래), 컨트롤 마크업과 조작 방법, 셀렉터 안정성 등급, 조건부 표시 그래프,
선택지 카탈로그, 자동화 체크리스트, 그리고 **재수집해야 알 수 있는 것**까지 담았다.

## 넣기 전에

- 파일에는 중개사 계정·매물 상세·소유자명·연락처가 담길 수 있으므로 직접 열어 검수한다.
- `입력값 가리기`는 입력/민감 문자열을 가리지만 정적 선택지 값·문구, `checked`,
  `selectedIndex`, URL, 페이지 제목, 본문, 현장 메모, 상태 이름은 남을 수 있다.
- PNG에는 가리기가 전혀 적용되지 않는다. JSON과 별도로 반드시 확인한다.
- `*Dropped`나 `truncated` 표시가 있으면 필요한 구간을 더 짧은 세션으로 다시 수집한다.
- 반출·보관 경로는 사무실이 동의한 방법으로만 쓴다.

## schema v2 최상위 구조

```json
{
  "schemaVersion": 2,
  "capturedAt": "2026-09-08T09:00:00.000Z",
  "note": "직방-원룸-1차",
  "maskValues": "mixed",
  "pageCount": 3,
  "stateCount": 12,
  "screenshotCount": 1,
  "pages": [],
  "screenshots": []
}
```

- `maskValues` — 모든 페이지 레코드가 가림이면 `true`, 모두 비가림이면 `false`, 둘이 섞이면
  `"mixed"`다. `mixed` 파일은 페이지별 `meta.maskValues`도 반드시 확인한다.
- `pageCount` — 고유 URL 수가 아니라 **문서·프레임 레코드 수**다. 같은 URL의 두 탭이나 iframe도
  각각 센다.
- `stateCount` — 모든 `pages[].states`의 합계다.
- `screenshots` — PNG 본문이 아니라 요청 ID·상태 이름·시각·페이지 URL·파일명 같은 연결
  메타데이터다. PNG는 별도 다운로드 파일이다.

콘솔의 `끝()`도 페이지 한 건과 빈 `screenshots`를 이와 같은 최상위 봉투에 넣어 저장한다.

## `pages[]` 한 건의 구조

```json
{
  "pageUrl": "https://ceo.zigbang.com/ads/oneroom/ad-item/new",
  "meta": {
    "schemaVersion": 2,
    "captureId": "문서-프레임별-불투명-ID",
    "storageKey": "p:<captureId>:masked",
    "url": "https://ceo.zigbang.com/ads/oneroom/ad-item/new",
    "frame": "(top)",
    "frameContext": {},
    "chromeFrameId": 0,
    "maskValues": true,
    "limits": {},
    "sessions": 1
  },
  "fields": {},
  "clickables": {},
  "actions": [],
  "timeline": [],
  "interactionEvents": [],
  "interactionEventsDropped": 0,
  "mutations": [],
  "mutationsDropped": 0,
  "states": [],
  "statesDropped": 0
}
```

- `captureId` — URL 대신 브라우저 문서·프레임을 구별하는 불투명 ID다. 같은 URL 탭/iframe끼리
  덮어쓰지 않게 한다.
- `storageKey` — `captureId`에 `plain` 또는 `masked`를 붙인다. 마스크 모드가 다른 기록은
  합치지 않는다.
- `meta.frameContext` / `chromeFrameId` — top/iframe 연결과 상태 요청이 실제 어느 프레임에서
  확인됐는지 대조하는 정보다. 각 `states[].frameContext`에도 해당 시점 정보가 있다.
- `fields` — 필드별 구조·라벨·후보 셀렉터·옵션·실행 중 상태·판정과 부수효과다.
- `clickables` — 버튼·라벨·ARIA 컨트롤 등 조작 후보의 구조다.
- `actions` — 클릭/값 변경을 의미 단위로 묶고 대상 주변 DOM의 전후 상태를 연결한다.
- `interactionEvents` — 포인터·포커스·키보드·입력·change·한글 조합 원시 이벤트 순서다.
- `mutations` — 노드 추가/삭제와 속성·표시 상태 변화다.
- `timeline` — 조작 뒤 새로 생기거나 바뀐 필드와 이름 붙은 상태를 시간순으로 잇는다.
- `states` — 시작·정지 및 **현재 상태 기록** 시점의 정리된 DOM, 필드 runtime, 열린 오버레이,
  활성 요소, iframe 문맥, open Shadow DOM이다.

레코드별 상한은 최근 원시 이벤트 4,000개, DOM 변이 2,500개, 상태 120개다. 상태 DOM은
500,000자, 각 open Shadow DOM은 160,000자까지다. `interactionEventsDropped`,
`mutationsDropped`, `statesDropped`와 잘림 표시를 보고 수집 누락 여부를 판단한다.

## 수집 파일 복사

정지할 때마다 `~/Downloads/fieldlog/` 에 그 세션분 JSON 이 자동으로 떨어진다. 회분 폴더를
만들고 플랫폼별로 나눠 넣는다.

```bash
SET=/Users/park/Documents/한방/captures/$(date +%Y-%m-%d)-현장수집
mkdir -p "$SET/직방"
cp ~/Downloads/fieldlog/fieldlog_capture_ceo.zigbang.com_*.json "$SET/직방/"
```

PNG를 복사했다면 최상위 `screenshots`의 `filename`, `requestId`, `label`과 맞는지 확인한다.

## 수집 후

수집한 실제 DOM 과 **자동입력 코드가 참조하는 셀렉터**를 대조하면 두 가지가 나온다.

1. **끊어진 셀렉터** — 코드가 찾는데 실물에는 없는 것 → 지금 조용히 실패 중인 항목
2. **미입력 칸** — 실물에는 있는데 코드가 건드리지 않는 것

대조 도구는 아직 없다.
