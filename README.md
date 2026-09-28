# 고배송 프론트엔드 리뉴얼 목업

미국(뉴저지·델라웨어) 해외직구 배송대행 서비스 **고배송**의 프론트엔드를 처음부터 다시 설계한 정적 목업입니다.
빌드 단계 없이 HTML·CSS·JS 파일만으로 동작하며, 폼 검증·계산기·상태 전환 등 모든 동작은 브라우저 안에서만 일어납니다.
**서버 전송, 실제 결제, DB 작업은 없습니다.**

## 페이지

| 파일 | 내용 |
|---|---|
| `index.html` | 히어로 항로 애니메이션, 운영 지표, 9단계 이용 흐름(고객/고배송 두 줄), 사서함 발급, 실시간 센터 보드, 요금 미리보기, 파트너스, 공지·상담 창구 |
| `apply.html` | 배송대행 신청 4단계: 상품정보 → 수취인·통관정보 → 옵션 → 확인. 탑승권 단계 표시, 주문 메일 자동입력, 최근 수취인, 자동 임시저장 |
| `mypage.html` | 여정 지도(7단계 스탬프), 결제 대기 알림과 결제 대화상자, 안심뷰 검수 사진, 포인트, 내 미국 주소, 화물 목록 필터 |
| `pricing.html` | 저울 눈금자 견적 계산기, 센터별 무게 요금표, 부피무게 설명, 선택 옵션, 파트너스 |
| `support.html` | 상담 창구 표시판, FAQ 검색·분류 아코디언, 세관신고서 모양 1:1 문의, 공지 목록 |

## 파일 구조

```
gobaesong/
├─ index.html · apply.html · mypage.html · pricing.html · support.html
├─ favicon.svg
├─ assets/
│  ├─ css/
│  │  ├─ tokens.css     디자인 토큰 (색·글꼴·간격·모션)
│  │  ├─ base.css       리셋, 타이포, 헤더·푸터, 공용 컴포넌트
│  │  └─ index.css · apply.css · mypage.css · pricing.css · support.css
│  ├─ js/
│  │  ├─ common.js      메뉴, 시계, 리빌, 카운트업, 바코드, 요금 계산, 폼 검증
│  │  ├─ hours.js       센터 업무시간 계산 (테스트 대상)
│  │  ├─ member.js      상단 바·주소 패널·로그인 상태·가입/로그인 창
│  │  └─ index.js · apply.js · mypage.js · pricing.js · support.js
│  └─ svg/logo-mark.svg
├─ partials/            공통 헤더·푸터 원본
├─ tools/sync_partials.py  partials를 5개 페이지에 주입
├─ design-tokens.md     토큰·컴포넌트 문서
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
npm test        # API 13개 + 업무시간 6개 자동 테스트
```

## 상단 바

- 왼쪽: 뉴저지 센터 업무시간 타이머 (미국 동부 평일 09:00–17:00, 델라웨어 09:00–15:00). 업무 중 → 마감까지, 시작 4시간 전 → 시작까지, 업무 종료, 주말·미국 공휴일 휴무와 한국시각 재개 시각. 규칙은 `assets/js/hours.js`
- 오른쪽: 뉴저지 / 델라웨어 주소 버튼. 칸별 복사, 로그인하면 Full Name 과 Street Address 2 에 개인 사서함 번호가 채워집니다

## 헤더·푸터 수정

공통 헤더·푸터는 `partials/header.html`, `partials/footer.html`이 원본입니다. 수정 후 한 번 실행하세요.

```bash
python tools/sync_partials.py
```

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
