# 온기 ONGI - Firebase 작동 통합본

이 버전은 기존 온기 앱 시안에 Firebase를 연결한 실행형 버전입니다.

## 포함 기능
- 만 19세 이상 전용 입장 게이트
- 가입 전 성인 확인 체크박스
- 프로필 나이 19세 미만 저장 차단
- Firestore 보안 규칙의 성인 프로필 조건
- Firebase 이메일 회원가입 / 로그인 / 로그아웃
- 최초 로그인 시 프로필 생성
- Firestore `profiles` 실시간 유저 목록
- 온도별 정령 칭호 자동 계산
- 닉네임 옆 작은 정령 뱃지 표시
- 프로필 상세 온기/정령 표시
- Firestore 실시간 1:1 채팅
- 온기 칭호 정령 도감 이미지 포함

## 실행 방법

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에는 Firebase 콘솔의 웹 앱 설정값을 넣어야 합니다.

## Firebase에서 켜야 하는 것
1. Authentication > Email/Password 활성화
2. Firestore Database 생성
3. `firestore.rules` 내용을 Firestore Rules에 붙여넣고 배포

## 주의
- Firebase 설정값이 없으면 로그인/채팅은 작동하지 않습니다.
- 실제 출시 전에는 신고/차단, 프로필 사진 업로드, 운영자 관리, 개인정보처리방침 도메인 연결이 추가로 필요합니다.
- 19세 이상 게이트는 기본 차단 장치입니다. 실제 성인 인증이 필요한 수준으로 운영하려면 휴대폰 본인인증 또는 실명 인증 연동을 추가하세요.
