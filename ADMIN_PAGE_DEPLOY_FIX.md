# 관리자 페이지 404 수정 안내

이번 통합본에는 Vercel에서 `/admin/moderation` 직접 접속 시 404가 뜨지 않도록 `vercel.json` rewrite 설정이 포함되어 있습니다.

## 배포 후 설정

Vercel 프로젝트 Settings → Environment Variables에 아래 값을 추가하세요.

- Key: `ADMIN_TOKEN`
- Value: `7777`
- Environment: `Production`

저장 후 Deployments에서 최신 배포를 Redeploy 해야 적용됩니다.

## 관리자 접속 주소

`https://dongne-friend-clean-ly6r.vercel.app/admin/moderation`

비밀번호/토큰 입력값은 `7777`입니다.
