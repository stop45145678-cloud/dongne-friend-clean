# 온기 Firebase 연결 방법

## 1) Firebase 프로젝트 생성
Firebase 콘솔에서 프로젝트를 만들고 Web App을 추가합니다.

## 2) Authentication 켜기
Authentication > Sign-in method에서 **Email/Password**를 활성화합니다.

## 3) Firestore Database 생성
Firestore Database를 생성하고, 테스트 후 `firestore.rules` 내용을 배포하세요.

## 4) 환경변수 입력
`.env.example`을 복사해서 `.env`로 만들고 Firebase 설정값을 넣습니다.

```bash
cp .env.example .env
npm install
npm run dev
```

## 5) 실제 포함 기능
- 이메일 회원가입 / 로그인 / 로그아웃
- 최초 로그인 시 프로필 생성
- Firestore `profiles` 실시간 목록
- 닉네임 옆 작은 정령 칭호 뱃지
- 채팅방 생성
- Firestore 실시간 채팅 메시지
- 온도별 칭호 자동 표시

## 6) Firestore 컬렉션 구조

### profiles/{uid}
```json
{
  "uid": "user id",
  "nickname": "지윤",
  "age": 24,
  "area": "서울",
  "intro": "편하게 대화하고 싶어요",
  "gender": "female",
  "warmth": 36.5,
  "createdAt": "serverTimestamp"
}
```

### chats/{chatId}
```json
{
  "memberIds": ["uid1", "uid2"],
  "memberNames": ["지윤", "민수"],
  "updatedAt": "serverTimestamp",
  "lastMessage": "안녕하세요"
}
```

### chats/{chatId}/messages/{messageId}
```json
{
  "senderId": "uid1",
  "text": "안녕하세요",
  "createdAt": "serverTimestamp"
}
```
