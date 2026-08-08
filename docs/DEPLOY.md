# DEPLOY — Railway · Cloudflare 설정

`docs/TASKS.md` P0 완료 기준 3·4번을 만족시키기 위한 절차입니다.
`docs/ARCHITECTURE.md` 7장이 무엇을 만들지 정하고, 이 문서는 어떻게 만드는지를 적습니다.

저장소는 이미 준비돼 있습니다 — `loginheaven-jpg/healing` 의 `main`.

---

## 0. 먼저 정하실 것

**어느 Cloudflare 계정을 쓰실지 정해 주십시오.**
지금 이 PC 의 `wrangler` 는 `bizkcoach@gmail.com` 계정으로 로그인돼 있고,
그 토큰에는 **R2 권한이 없습니다.** 이 프로젝트에 쓸 계정이 맞는지 확인이 필요합니다.

---

## 1. Cloudflare R2 — 버킷과 토큰

먼저 R2 를 만듭니다. Railway 변수에 넣을 값이 여기서 나오기 때문입니다.

### 1.1 버킷 만들기

1. Cloudflare 대시보드 → **R2 Object Storage** → **Create bucket**
2. 이름 **`healing-choir`** (`.env.example` 의 `R2_BUCKET` 기본값과 같아야 합니다)
3. 위치는 **Asia-Pacific (APAC)** 을 고르십시오. 사용자가 국내에 있습니다.
4. **공개 접근은 켜지 마십시오.** 페이지 이미지는 서명 URL 로만 내려줍니다.

### 1.2 S3 API 토큰 만들기

1. R2 화면 오른쪽 **Account details** → **API Tokens** 옆 **Manage**
2. **Create API token**
3. 권한 **Object Read & Write**
   - 관리자 권한(Admin Read & Write)을 주지 마십시오. 앱은 객체만 다룹니다.
4. **Specify bucket(s)** → `healing-choir` 만 지정
5. 만들면 아래 두 값이 한 번만 보입니다. **그때 복사해 두십시오.**

| 화면에 나오는 것 | 환경변수 |
| --- | --- |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |
| Use jurisdiction-specific endpoint... 아래의 계정 ID | `R2_ACCOUNT_ID` |

`R2_ENDPOINT` 는 계정 ID 로 조립합니다.

```
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

### 1.3 CORS 정책 — 빼먹으면 업로드가 막힙니다

40MB 악보가 web 서비스를 거치지 않도록 **브라우저가 R2 로 직접 PUT** 합니다
(`docs/ARCHITECTURE.md` 5.3). 그래서 버킷에 CORS 가 필요합니다.

버킷 → **Settings** → **CORS Policy** → **Add CORS policy** 에 아래를 넣습니다.

```json
[
  {
    "AllowedOrigins": ["https://<서비스 도메인>", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

도메인이 정해지기 전이면 `http://localhost:5173` 만 넣고, 정해진 뒤 추가하십시오.

### 1.4 확인

값을 `.env` 에 채우고 실행합니다.

```bash
cp .env.example .env      # R2_* 다섯 개를 채웁니다
pnpm r2:smoke
```

서명 URL 로 올리고 · 내려받아 대조하고 · 지웁니다. 여섯 단계가 모두 통과해야 합니다.
**이것이 P0 완료 기준 4번입니다.**

---

## 2. Railway — 서비스 셋

### 2.1 프로젝트와 GitHub 연결

1. Railway → **New Project** → **Deploy from GitHub repo**
2. 처음이라면 Railway GitHub App 에 `loginheaven-jpg/healing` 접근을 허용합니다.
3. 저장소를 고르면 서비스가 하나 생깁니다. 이것을 **web** 으로 씁니다.

### 2.2 Postgres

**New** → **Database** → **Add PostgreSQL**.
Railway 가 `DATABASE_URL` 을 만들어 줍니다. 다른 서비스에서는 참조로 씁니다.

### 2.3 web 서비스 설정

Settings 에서:

| 항목 | 값 |
| --- | --- |
| Root Directory | `/` (repo 루트 그대로) |
| Config-as-code | `/apps/web/railway.json` |
| Watch Paths | `/apps/web/**`, `/packages/**`, `/package.json`, `/pnpm-lock.yaml` |

> **Root Directory 를 `apps/web` 로 두지 마십시오.** pnpm 워크스페이스라
> 빌드에 저장소 전체(`pnpm-workspace.yaml`, `packages/*`)가 필요합니다.
> Dockerfile 이 루트 기준으로 복사합니다.

> **설정 파일 경로는 Root Directory 를 따르지 않습니다.** 저장소 루트 기준
> 절대 경로(`/apps/web/railway.json`)로 적어야 합니다. Railway 문서의 명시 사항입니다.

빌더 · 헬스체크 · 시작 명령은 `apps/web/railway.json` 에 이미 있습니다. 손댈 필요 없습니다.

**변수** (Variables 탭):

```
DATABASE_URL      = ${{Postgres.DATABASE_URL}}
ACCESS_PASSKEY    = healing
SESSION_SECRET    = <아래 명령으로 생성>
R2_ACCOUNT_ID     = 1.2 에서 받은 값
R2_ACCESS_KEY_ID  = 1.2 에서 받은 값
R2_SECRET_ACCESS_KEY = 1.2 에서 받은 값
R2_BUCKET         = healing-choir
R2_ENDPOINT       = https://<account>.r2.cloudflarestorage.com
PUBLIC_BASE_URL   = https://<2.5에서 정한 도메인>
NODE_ENV          = production
```

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`PORT` 는 넣지 마십시오. Railway 가 주입하고 서버가 그것을 읽습니다.

자원은 **1 vCPU / 1GB** 면 충분합니다.

### 2.4 omr-worker 서비스

**New** → **GitHub Repo** → 같은 저장소를 한 번 더 고릅니다.

| 항목 | 값 |
| --- | --- |
| Root Directory | `/` |
| Config-as-code | `/apps/omr-worker/railway.json` |
| Watch Paths | `/apps/omr-worker/**`, `/packages/**`, `/package.json`, `/pnpm-lock.yaml` |

변수는 `DATABASE_URL` 과 `R2_*` 만 있으면 됩니다. `ACCESS_PASSKEY` · `SESSION_SECRET` 은 필요 없습니다.

**자원은 1 vCPU / 4GB 로 잡으십시오.** 실측에서 Audiveris 가 1.4GB 를 썼고 여유가 필요합니다.
지금 배포되는 것은 빈 워커라 메모리를 쓰지 않지만, P3 전에 설정해 두는 편이 낫습니다.

이 서비스에는 **도메인을 만들지 마십시오.** 바깥에서 부를 일이 없습니다.

### 2.5 도메인

web 서비스 → **Settings** → **Networking** → **Generate Domain**.
`*.up.railway.app` 주소가 나옵니다.

### 2.6 확인

```bash
curl -i https://<도메인>/health
```

`HTTP/2 200` 과 `{"ok":true,"service":"web",...}` 이 나와야 합니다.
**이것이 P0 완료 기준 3번입니다.**

Railway 배포 화면의 헬스체크도 초록이어야 합니다. `railway.json` 이 `/health` 를 보게 해 뒀습니다.

---

## 3. Cloudflare — DNS · 캐시 · WAF

자체 도메인을 쓰실 때만 필요합니다. `*.up.railway.app` 으로 쓰시면 3장을 건너뛰셔도 됩니다.

| 항목 | 설정 |
| --- | --- |
| DNS | Railway 도메인으로 **CNAME**, 프록시(주황 구름) **켬** |
| 캐시 | 정적 자산만. `/api/*` 와 `/health` 는 **Bypass** 규칙 |
| WAF | 기본 규칙 + **속도 제한 분당 60요청** |

Railway 쪽에서도 **Settings → Networking → Custom Domain** 에 같은 도메인을 등록해야
인증서가 발급됩니다.

도메인을 붙이면 **1.3 의 CORS `AllowedOrigins` 와 `PUBLIC_BASE_URL` 을 함께 고치십시오.**

---

## 4. 마친 뒤

`docs/TASKS.md` 의 진행 점검표에서 P0 을 체크하고 P1 로 넘어갑니다.

| P0 완료 기준 | 확인 방법 |
| --- | --- |
| `pnpm build` 통과 | 로컬 |
| `pnpm test` 실행 | 로컬 |
| Railway web `/health` 200 | 2.6 |
| R2 업로드 · 서명 URL 읽기 | 1.4 |

---

## 자주 걸리는 곳

| 증상 | 원인 |
| --- | --- |
| Railway 빌드가 `pnpm-workspace.yaml` 을 못 찾음 | Root Directory 를 `apps/web` 으로 뒀습니다. `/` 여야 합니다 |
| `railway.json` 이 무시됨 | Config-as-code 경로를 저장소 루트 기준 절대 경로로 적어야 합니다 |
| 한 쪽만 고쳤는데 두 서비스가 모두 재배포됨 | Watch Paths 를 지정하지 않았습니다 |
| 브라우저 업로드가 CORS 로 막힘 | 1.3 을 빼먹었습니다. 서명 URL 이 맞아도 브라우저가 막습니다 |
| `pnpm r2:smoke` 가 403 | 토큰 권한이 버킷에 걸려 있지 않거나, 엔드포인트가 계정 ID 와 다릅니다 |
| 헬스체크 실패 | `PORT` 를 직접 넣으셨을 수 있습니다. Railway 가 주입하게 두십시오 |
