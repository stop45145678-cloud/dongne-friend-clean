# 동네친구 관리자 페이지 완성 패키지

이 ZIP 안의 파일을 기존 프로젝트에 그대로 덮어씌우면 됩니다.

## 들어있는 기능

- 관리자 로그인
- 유저 목록 보기
- 신고 목록 보기
- 유저 정지
- 유저 정지 해제
- 게시글 삭제 처리

## 넣을 위치

압축을 풀면 아래 구조가 나옵니다.

```txt
public/admin.html
api/admin/_firebaseAdmin.js
api/admin/users.js
api/admin/reports.js
api/admin/ban-user.js
api/admin/unban-user.js
api/admin/delete-post.js
```

기존 프로젝트 루트에 그대로 넣으세요.

## Vercel 환경변수

필수:

```txt
ADMIN_TOKEN=7777
```

Firebase 실제 DB 연결하려면 추가:

```txt
FIREBASE_PROJECT_ID=너의 Firebase project id
FIREBASE_CLIENT_EMAIL=Firebase service account client_email
FIREBASE_PRIVATE_KEY=Firebase service account private_key
```

주의:
- FIREBASE_PRIVATE_KEY는 줄바꿈이 들어가면 오류가 날 수 있습니다.
- Vercel에 넣을 때는 `-----BEGIN PRIVATE KEY-----\n...` 형태로 들어가도 코드에서 자동 처리합니다.

## package.json 확인

기존 package.json dependencies에 이게 없으면 추가하세요.

```json
"firebase-admin": "latest"
```

이미 있으면 안 건드려도 됩니다.

## 접속 주소

```txt
https://dongne-friend-clean-ly6r.vercel.app/admin.html
```

관리자 토큰:

```txt
7777
```

## DB 컬렉션 이름

이 코드는 기본적으로 아래 컬렉션을 사용합니다.

```txt
users
reports
posts
```

만약 네 앱에서 컬렉션 이름이 다르면 `api/admin/*.js` 안의 컬렉션 이름을 바꾸면 됩니다.

예:
```js
db.collection("users")
db.collection("reports")
db.collection("posts")
```
