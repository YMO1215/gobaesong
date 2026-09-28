# 고배송 프론트엔드 리뉴얼 목업

미국(뉴저지·델라웨어) 해외직구 배송대행 서비스 **고배송**의 프론트엔드를 처음부터 다시 설계한 목업입니다.
정적 HTML·CSS·JS 8페이지에 **회원가입·로그인만 실제로 동작하는 API**(Vercel 함수 + Upstash)를 더했습니다.
신청서·결제·문의·상담은 화면에서만 동작하고 어디로도 전송되지 않습니다.

## 페이지 (지시서 v2 · 8개)

| 파일 | 내용 | 시그니처 |
|---|---|---|
| `index.html` | 히어로, 9단계 흐름, **핫딜 레이더**, 사서함 발급, 센터 현황 보드(샘플 8행), 배송비 **계산기 티저**(→ 상세 요금표), **쇼핑몰 바로가기**, **고객 후기**, 파트너스(01 대량 신청 / 02 엑셀 업로드 / 03 자동결제), 공지 | 항로 궤적 애니메이션 · 레이더 스윕 |
| `guide.html` | 신규 고객용 8단계 이용방법, 단계별 준비물 체크(브라우저 저장), 쇼핑몰 배송지 입력 예시 | 탑승 수속 카운터 |
| `pricing.html` | 저울 견적 계산기, 무게별 요금표, 부피무게, **관부가세 계산기·$200/$150 면세 기준**, 옵션, 파트너스 | 수하물 저울 눈금자 |
| `customs.html` | 개인통관고유부호: 필요한 이유, 준비물, 발급 순서, 2026 변경점, 신청서 입력 위치, 오류·해결표, 형식 검사기 | 여권 정보면 카드 |
| `events.html` | 시즌 프로모션, 배송비 쿠폰(진행중/예정/종료 자동 구분, 받기·코드 복사), 미국 세일 캘린더 | 세일 출발 전광판(D-day) |
| `support.html` | FAQ 17개 검색·분류, 세관신고서 모양 1:1 문의, 공지 | 스플릿플랩 창구판 |
| `apply.html` | 신청 4단계, 주문 메일 자동입력, 임시저장, **핫딜 딥링크 자동 채움**, 제출 시 로그인 | 탑승권 단계 표시 |
| `mypage.html` | 여정 지도, 결제 대기·결제, 안심뷰 사진, 포인트, 내 미국 주소 | 스탬프 여정 지도 |

**공통**: 상단 바(센터 업무시간 타이머 · 뉴저지/델라웨어 주소 복사), 7개 메뉴, 로그인·간편 신청서, 푸터 바코드,
**카카오톡/실시간 채팅 상담 플로팅 버튼**(상담 가능 시간 표시, 모든 페이지).

## 배송비 이벤트(스페셜) 운영

11종(고정가 7 · 일반 요금 할인 3 · 최저가부터 1)의 요금과 조건은 `assets/js/specials.js` **한 파일**에 있고,
요금 페이지 B 구획·계산기, 신청서 3단계, 이벤트 페이지 카드, 메인 "진행 중 배송비 스페셜" 띠가 모두 이 파일을 씁니다.

- 계산: 고정가는 그 금액, 할인은 일반 무게 요금에서 %, "부터"(착한배송)는 금액을 추정하지 않고 "입고 후 확정"
- 조건 판정은 `check()` 한 곳. 탈락하면 일반 요금으로 계산하고 이유와 대안 이벤트를 보여 줍니다
- `end`가 지나면 모든 화면에서 자동으로 "종료", 메인 띠 대표 3건은 `featured` 순서(운영자가 지정)
- 근거는 고배송 신청서 화면의 이벤트 옵션. **운영 투입 전 관리자 기준 요금·종료일과 다시 대조**하고, 실제 청구는 서버 계산을 기준으로 해야 합니다

## 핫딜 운영 (미국 Shopify 쇼핑몰 실제 할인가)

핫딜 레이더는 `assets/js/deals-data.js`를 읽기만 합니다. 이 파일은 `tools/fetch_deals.py`가 만듭니다.

```bash
python tools/fetch_deals.py        # 가게당 할인율 큰 상품 3개, 최대 12개
python tools/sync_partials.py      # 자산 해시 갱신 후 커밋·푸시
```

| 가게 | 읽는 컬렉션 | 비고 |
|---|---|---|
| Patagonia Worn Wear | `mens`, `packs-and-gear` | 중고 1점씩 · 3일 뒤 자동으로 내려감 |
| CNCPTS | `apparel-sale` | |
| Totem Brand Co. | `sale` | |
| ONENESS | `mens-sale` | 공개 JSON 에 정가(`compare_at_price`)가 없어 할인가를 확인할 수 없음 → 자동으로 0건 |

- **미국 가게만** 넣습니다(배대지가 뉴저지·델라웨어라 유럽 가게는 두 번 운송). 가게가 USD 가 아닌 통화로 답하면 건너뜁니다
- 게이트웨이 앱 수집기와 같은 규칙: 공개 `products.json`, 가게당 컬렉션 1회 + 통화 확인용 상품 페이지 1회, `requests`(curl 은 403), **`Accept-Language` 헤더 안 보냄**(Shopify Markets 가 원화로 답함), `sort_by`·`filter`·`+` 금지(robots), 429 면 중단
- 전동 보드·배터리 등 항공 불가 상품은 뺍니다. 무게는 분류별 추정값(`lbEstimated`), 신청서용 상품명은 영문만 남깁니다(È→E, `|`→공백)
- 사이트는 방문할 때마다 크롤링하지 않습니다. 운영 주기(월·목)에 실행하고 결과를 확인해 올립니다
- 필요: `pip install requests`

## 파일 구조

```
gobaesong/
├─ index · guide · pricing · customs · events · support · apply · mypage .html
├─ assets/
│  ├─ css/  tokens.css · base.css(공통·상단 바·상담 버튼) · 페이지별 8개
│  ├─ js/
│  │  ├─ common.js      메뉴, 리빌, 카운트업, 바코드, 요금 계산, 폼 검증
│  │  ├─ hours.js       센터 업무시간 (테스트)
│  │  ├─ duty.js        관부가세 계산 (테스트)
│  │  ├─ member.js      상단 바·주소 패널·로그인
│  │  ├─ chat.js        상담 플로팅 버튼
│  │  ├─ deals-data.js  핫딜 목록 (사람이 편집)
│  │  ├─ specials.js    배송비 이벤트 11종 데이터·판정 (테스트)
│  │  ├─ specials-ui.js 이벤트 카드·결과 공용 마크업
│  │  └─ 페이지별 8개
│  └─ svg/logo-mark.svg
├─ api/ · lib/          회원 API (Vercel 함수)
├─ tests/               node --test (33개)
├─ partials/            공통 헤더·푸터 원본
├─ tools/               sync_partials.py · dev-server.mjs
├─ design-tokens.md
└─ vercel.json
```

## 열어 보기

**가장 간단한 방법** — `index.html`을 브라우저로 엽니다. 모든 기능이 `file://`에서도 동작합니다.

**로컬 서버** (클립보드 복사 등 일부 API가 더 자연스럽게 동작)

```bash
python -m http.server 8000
# http://localhost:8000
```

**Vercel 배포**

1. Vercel에서 *Add New → Project* 로 이 GitHub 저장소를 가져옵니다.
2. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 둡니다(루트를 그대로 서빙).
3. Deploy. `vercel.json`의 `cleanUrls` 설정으로 `/apply`, `/pricing` 같은 주소도 동작합니다.

> 모든 페이지에 `<meta name="robots" content="noindex">`가 들어 있어 검색엔진에 노출되지 않습니다. 실제 서비스로 전환할 때 지우세요.

## 회원 기능 (실제 계정)

가입·로그인은 진짜로 동작합니다. 정적 페이지 옆에 Vercel 서버리스 함수가 있습니다.

| API | 하는 일 |
|---|---|
| `POST /api/auth/signup` | 아이디·비밀번호·영문 이름·이메일·센터로 가입, 개인 사서함 `GB-000001`부터 순서대로 발급, 바로 로그인 |
| `POST /api/auth/login` · `POST /api/auth/logout` | 로그인(5번 틀리면 10분 잠금) · 로그아웃 |
| `GET /api/auth/me` · `GET /api/auth/check-id?id=` | 로그인 상태 · 아이디 중복 확인 |
| `GET /api/health` | 저장소 연결 상태 (환경변수 **이름만** 표시, 값은 안 보임) |

- 비밀번호는 scrypt 해시로만 저장, 로그인 상태는 서명된 HttpOnly 쿠키(30일)
- 저장소: 배포에서는 **Upstash Redis**(`KV_REST_API_URL`/`KV_REST_API_TOKEN`, 접두어가 붙어도 인식), 로컬에서는 `.data/dev-store.json`
- 세션 서명 키는 `AUTH_SECRET` 환경변수가 있으면 그것을, 없으면 Upstash 토큰에서 만듭니다

**Vercel 연결**: 프로젝트 → Storage → Upstash for Redis → Connect Project 에서 **Production 을 체크**하고 연결 → Deployments 에서 Redeploy.
연결 확인: `https://<도메인>/api/health` 가 `{"ok":true,"store":"upstash"}` 이면 정상입니다.

**로컬 실행·테스트**

```bash
npm run dev     # http://127.0.0.1:3000 — 정적 페이지 + /api, 계정은 .data/ 에 저장
npm test        # API 13 · 업무시간 6 · 관부가세 5 · 배송비 이벤트 9 = 33개
```

## 상단 바

- 왼쪽: 뉴저지 센터 업무시간 타이머 (미국 동부 평일 09:00–17:00, 델라웨어 09:00–15:00). 업무 중 → 마감까지, 시작 4시간 전 → 시작까지, 업무 종료, 주말·미국 공휴일 휴무와 한국시각 재개 시각. 규칙은 `assets/js/hours.js`
- 오른쪽: 뉴저지 / 델라웨어 주소 버튼. 칸별 복사, 로그인하면 Full Name 과 Street Address 2 에 개인 사서함 번호가 채워집니다

## 헤더·푸터 수정

공통 헤더·푸터는 `partials/header.html`, `partials/footer.html`이 원본입니다. 수정 후 한 번 실행하세요.

```bash
python tools/sync_partials.py
```

**`assets/` 의 CSS·JS·이미지를 고친 뒤에도 꼭 실행하세요.** 모든 파일 주소에 `?v=내용해시`를 다시 붙여, 방문자 브라우저가 새 HTML에 예전 CSS를 붙여 보여 주는 일을 막습니다.

각 페이지의 `<!-- HEADER:START -->` … `<!-- HEADER:END -->` 사이가 교체되고, 현재 페이지 메뉴에 `aria-current="page"`가 붙습니다.

## 더미 데이터 규칙

- 사서함 `GB-000000` 형식, 신청번호 `GB-000417-03` 형식
- 트래킹 `1Z999AA10123456784` (UPS 테스트 번호 형식)
- 상태값: 입고완료 → 검수중 → 결제대기 → 출고 → 통관중 → 배송중 → 완료
- 요금: 뉴저지 첫 1lb $8.90 + 1lb당 $2.30, 델라웨어 $9.40 + $2.40, 파트너스 7% 할인, 부피무게 ÷166, 환율 ₩1,390/$ 가정 (`assets/js/common.js`의 `RATES`)
- 주소·전화·사업자번호는 모두 `000` 으로 채운 가짜 값입니다.

## 브라우저 저장

사서함 발급 결과, 신청서 임시저장, 결제 완료 표시는 `localStorage`(`gb.*` 키)에 저장되어 페이지를 옮겨 다녀도 이어집니다.
처음 상태로 돌리려면 개발자 도구에서 `gb.`로 시작하는 키를 지우거나 신청서의 **새로 쓰기**를 누르세요.

## 접근성

- 본문 대비 4.5:1 이상 (값은 `design-tokens.md` 참고), 모든 입력에 라벨, 오류 메시지는 `aria-describedby`로 연결
- 키보드 포커스 3px 오렌지 윤곽선, 본문 바로가기 링크
- 시맨틱 태그(`header` `nav` `main` `section` `aside` `footer` `dl` `table`), 장식 SVG는 `aria-hidden`, 의미 있는 그림은 `role="img"` + 이름
- `prefers-reduced-motion` 이면 모든 애니메이션을 끄고 최종 상태를 표시
