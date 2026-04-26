# Supabase DB + Storage 연결 방법

## 1) Supabase 프로젝트 만들기
Supabase에서 새 프로젝트를 만들고 `Project Settings > API`에서 아래 값을 확인하세요.

- Project URL
- service_role key

`service_role key`는 서버 전용입니다. 프론트엔드 코드나 앱에 넣으면 안 됩니다.

## 2) DB 테이블 + Storage 버킷 만들기
Supabase SQL Editor에서 `supabase.schema.sql` 내용을 실행하세요.

생성되는 항목:

- `public.app_state`: 앱 데이터 저장용 JSONB 테이블
- `moment-photos`: 모멘츠 사진 저장용 public Storage bucket

## 3) 환경변수 설정
`.env.example`을 참고해서 서버 실행 환경에 아래 값을 넣으세요.

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STATE_TABLE=app_state
SUPABASE_STORAGE_BUCKET=moment-photos
```

## 4) 실행

```bash
npm install
npm run server
```

프론트엔드는 사진을 1200px 기준으로 자동 압축한 뒤 서버의 `/uploads/moments`로 전송합니다. 서버는 사진 파일을 Supabase Storage에 업로드하고, 모멘츠 DB에는 `url`과 `storagePath`만 저장합니다.

## 이번 전환 범위

- 사진 base64를 DB에 저장하지 않도록 변경
- 모멘츠 사진은 Supabase Storage에 저장
- 모멘츠 작성/수정 시 새 사진은 Storage 업로드 후 URL 저장
- 모멘츠 수정에서 삭제된 사진은 Storage에서도 삭제
- 모멘츠 삭제 시 연결된 사진도 Storage에서 삭제

## 참고

현재 데이터 본문은 기존 앱 로직을 안전하게 유지하기 위해 `app_state` JSONB 방식으로 저장합니다. 유저가 늘어나면 아래처럼 정규화 테이블로 분리하는 것이 좋습니다.

- users
- profiles
- moments
- moment_media
- moment_likes
- moment_comments
- reports
- friends
- letters
- temperature_events


## 이번 정책/안전 업데이트

추가된 항목:

- 앱 내 개인정보처리방침 페이지: `/privacy`
- 이용약관 페이지: `/terms`
- 커뮤니티 가이드 페이지: `/community`
- 웹 계정 삭제 요청 페이지: `/delete-account`
- 삭제 요청 접수 API: `POST /account-deletion-requests`
- 사용자 차단 API: `GET /blocks`, `POST /blocks/:userId`, `DELETE /blocks/:userId`

차단 적용 범위:

- 서로의 모멘츠/댓글 노출 최소화
- 같은 지역 친구 추천 제외
- 5분 랜덤 대화 후보 제외
- 익명 한마디 랜덤 수신 후보 제외
- 차단 시 기존 친구 연결 제거

출시 전 확인 필요:

- 개인정보처리방침의 사업자명, 연락처, 보관 기간, 위탁/국외 이전 여부를 실제 운영 정보로 교체하세요.
- Google Play Console의 데이터 보안 항목과 계정 삭제 URL에 `/delete-account` 공개 URL을 입력하세요.
- 관리자 신고/삭제요청 관리 화면은 운영자용으로 별도 추가하는 것을 권장합니다.
