# 온기 관리자 + Firebase + Vercel 통합 안내

## 포함된 것
- `public/admin.html`: 관리자 페이지
- `api/admin/*`: Vercel 관리자 API
- `firebase-admin` 의존성 추가
- `.env.example`에 Vercel 환경변수 정리

## 접속 주소
```txt
https://dongne-friend-clean-ly6r.vercel.app/admin.html
```

## 관리자 로그인
```txt
7777
```

## Firestore 컬렉션
앱 본체는 회원 프로필을 `profiles` 컬렉션에 저장합니다.
관리자 유저 목록도 `profiles`를 우선 조회합니다.

사용 컬렉션:
```txt
profiles
chats
reports
posts
moments
```

## Vercel에 반드시 넣을 환경변수
```txt
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
ADMIN_TOKEN
```

관리자에서 실제 DB 조회/정지/삭제까지 하려면 추가:
```txt
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

## 배포
환경변수 입력 후 Vercel에서 Redeploy 하세요.
