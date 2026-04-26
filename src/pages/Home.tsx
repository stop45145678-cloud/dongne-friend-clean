import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CurrentUser, FriendProfile, deleteMyAccount, getStoredUser, loginWithNickname, logout, updateMyProfile } from "../auth";
import { api } from "../api";

const mbtiOptions = ["모름", "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP", "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"];
const socialTypeOptions = ["천천히 친해지는 편", "먼저 말을 거는 편", "답장은 느려도 진심인 편", "가볍게 자주 대화하는 편", "깊은 이야기를 좋아하는 편"];
const personalityOptions = ["차분함", "활발함", "다정함", "유머러스함", "솔직함", "긍정적", "신중함", "공감형", "계획형", "즉흥형"];
const tasteOptions = ["카페", "산책", "영화", "음악", "게임", "맛집", "운동", "독서", "사진", "여행", "반려동물", "전시"];
const hobbyOptions = ["동네 산책", "맛집 탐방", "카페 가기", "콘텐츠 보기", "운동/헬스", "러닝", "게임", "음악 듣기", "사진 찍기", "책 읽기", "요리", "수다"];
const regionOptions = ["지역 선택 안 함", "서울", "부산", "인천", "대구", "대전", "광주", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const profileVisibilityOptions = [
  { value: "public", label: "전체 공개", desc: "같은 지역 친구 보기와 프로필에서 소개가 보여요." },
  { value: "friends", label: "친구에게만 공개", desc: "친구에게만 내 소개를 보여줘요." },
  { value: "private", label: "비공개", desc: "내 프로필 소개를 숨겨요." }
];

function toggleItem(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value].slice(0, 5);
}

function ChipGroup({ title, values, selected, onToggle }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="profile-section">
      <p><b>{title}</b> <span className="muted">최대 5개</span></p>
      <div className="chip-row">
        {values.map((value) => (
          <button key={value} type="button" className={`chip ${selected.includes(value) ? "selected" : ""}`} onClick={() => onToggle(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileForm({ mbti, setMbti, socialType, setSocialType, personalities, setPersonalities, tastes, setTastes, hobbies, setHobbies, intro, setIntro, region, setRegion, profileVisibility, setProfileVisibility }: any) {
  return (
    <>
      <select className="input" value={mbti} onChange={(e) => setMbti(e.target.value)}>
        {mbtiOptions.map((item) => <option key={item}>{item}</option>)}
      </select>
      <div style={{ height: 10 }} />
      <select className="input" value={socialType} onChange={(e) => setSocialType(e.target.value)}>
        {socialTypeOptions.map((item) => <option key={item}>{item}</option>)}
      </select>
      <div style={{ height: 10 }} />
      <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
        {regionOptions.map((item) => <option key={item}>{item}</option>)}
      </select>
      <p className="muted small-note">정확한 위치나 지도는 사용하지 않고, 서울/부산/경기처럼 넓은 지역만 친구 찾기에 사용됩니다.</p>
      <select className="input" value={profileVisibility} onChange={(e) => setProfileVisibility(e.target.value)}>
        {profileVisibilityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <p className="muted small-note">{profileVisibilityOptions.find((item) => item.value === profileVisibility)?.desc}</p>
      <ChipGroup title="성격" values={personalityOptions} selected={personalities} onToggle={(v) => setPersonalities((prev: string[]) => toggleItem(prev, v))} />
      <ChipGroup title="취향" values={tasteOptions} selected={tastes} onToggle={(v) => setTastes((prev: string[]) => toggleItem(prev, v))} />
      <ChipGroup title="취미" values={hobbyOptions} selected={hobbies} onToggle={(v) => setHobbies((prev: string[]) => toggleItem(prev, v))} />
      <textarea className="input textarea small-textarea" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="한줄 소개 예: 퇴근 후 산책하거나 카페 가는 친구 좋아해요." />
    </>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [nickname, setNickname] = useState("");
  const [mbti, setMbti] = useState("모름");
  const [socialType, setSocialType] = useState("천천히 친해지는 편");
  const [personalities, setPersonalities] = useState<string[]>(["다정함"]);
  const [tastes, setTastes] = useState<string[]>(["카페"]);
  const [hobbies, setHobbies] = useState<string[]>(["동네 산책"]);
  const [intro, setIntro] = useState("");
  const [region, setRegion] = useState("지역 선택 안 함");
  const [profileVisibility, setProfileVisibility] = useState<"public" | "friends" | "private">("public");
  const [myMoments, setMyMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    if (stored?.profile) fillProfile(stored.profile);
    if (stored) loadMyMoments().catch(() => {});
  }, []);

  const loadMyMoments = async () => {
    const data = await api<{ moments: any[] }>("/moments?mine=true&limit=20&offset=0");
    setMyMoments(data.moments || []);
  };

  const fillProfile = (profile: FriendProfile) => {
    setMbti(profile.mbti || "모름");
    setSocialType(profile.socialType || "천천히 친해지는 편");
    setPersonalities(profile.personalities || ["다정함"]);
    setTastes(profile.tastes || ["카페"]);
    setHobbies(profile.hobbies || ["동네 산책"]);
    setIntro(profile.intro || "");
    setRegion(profile.region || "지역 선택 안 함");
    setProfileVisibility((profile.profileVisibility as any) || "public");
  };

  const currentProfile = (): FriendProfile => ({ mbti, socialType, personalities, tastes, hobbies, intro: intro.trim(), region, profileVisibility });

  const handleLogin = async () => {
    if (!nickname.trim()) return alert("닉네임을 입력해주세요.");
    setLoading(true);
    try {
      const nextUser = await loginWithNickname(nickname.trim(), currentProfile());
      setUser(nextUser);
      await loadMyMoments().catch(() => {});
    } catch (e: any) {
      alert(e.message || "시작하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const startProfileEdit = () => {
    if (user?.profile) fillProfile(user.profile);
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      const nextUser = await updateMyProfile(currentProfile());
      setUser(nextUser);
      setEditingProfile(false);
      alert("프로필이 수정되었습니다.");
    } catch (e: any) {
      alert(e.message || "프로필을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const first = window.confirm("회원 탈퇴를 진행할까요? 프로필, 모멘츠, 댓글, 좋아요, 친구/편지/차단/신고 기록이 모두 즉시 삭제됩니다.");
    if (!first) return;
    const finalText = window.prompt("마지막 확인입니다. 탈퇴하려면 아래에 탈퇴 라고 입력해주세요.");
    if (finalText !== "탈퇴") return alert("입력이 일치하지 않아 탈퇴를 취소했습니다.");
    setDeletingAccount(true);
    try {
      await deleteMyAccount();
      setUser(null);
      setEditingProfile(false);
      alert("회원 탈퇴가 완료되었습니다. 모든 개인 데이터가 즉시 삭제되었습니다.");
    } catch (e: any) {
      alert(e.message || "회원 탈퇴를 처리하지 못했습니다.");
    } finally {
      setDeletingAccount(false);
    }
  };

  const profileProps = { mbti, setMbti, socialType, setSocialType, personalities, setPersonalities, tastes, setTastes, hobbies, setHobbies, intro, setIntro, region, setRegion, profileVisibility, setProfileVisibility };

  return (
    <div className="page">
      <h1>동네친구 🌿</h1>
      <p className="muted">하루를 나누고, 부담 없이 이야기하고, 서로 괜찮았던 사람과 친구로 연결되는 일상 친구 찾기 앱입니다.</p>

      {!user ? (
        <div className="card hero-card">
          <h2>친구 프로필 만들기</h2>
          <p className="muted">나의 성격, 취향, 취미, 넓은 지역을 가볍게 남겨요. 정확한 위치 없이 친구 추천과 대화 시작에 사용됩니다.</p>
          <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임 예: 산책하는고양이" />
          <div style={{ height: 10 }} />
          <ProfileForm {...profileProps} />
          <div style={{ height: 12 }} />
          <button onClick={handleLogin} disabled={loading}>{loading ? "시작 중..." : "친구 찾기 시작"}</button>
        </div>
      ) : (
        <>
          <div className="card hero-card">
            <h2>{user.nickname}님, 오늘도 편하게 머물러요</h2>
            <p>대화 매너 온도 <span className="temp">{user.temp}°</span></p>
            <p className="muted">온도는 좋은 평가로 올라가고, 신고 누적이나 낮은 대화 평가처럼 명확한 사유가 있을 때만 내려갑니다.</p>
            <div className="profile-summary">
              <span className="tag">{user.profile?.region || "지역 선택 안 함"}</span>
              <span className="tag">MBTI {user.profile?.mbti || "모름"}</span>
              <span className="tag">{user.profile?.socialType || "천천히 친해지는 편"}</span>
              {(user.profile?.personalities || []).slice(0, 3).map((item) => <span className="tag" key={item}>{item}</span>)}
            </div>
            {user.profile?.intro && <p className="muted">“{user.profile.intro}”</p>}
            <p>보유 코인 <b>{user.coins ?? 0} 🪙</b></p>
            <p>내 초대 코드 <b>{user.inviteCode || "-"}</b></p>
            <p className="muted">프로필 공개 범위: <b>{profileVisibilityOptions.find((item) => item.value === user.profile?.profileVisibility)?.label || "전체 공개"}</b></p>
            <button className="secondary" onClick={startProfileEdit}>프로필 수정</button>
          </div>

          <div className="card">
            <div className="row between">
              <h2>내 모멘츠 기록 📚</h2>
              <button className="secondary" onClick={() => nav("/moments")}>관리하기</button>
            </div>
            <p className="muted">내가 올린 모멘츠를 한곳에서 확인해요. 수정/삭제는 모멘츠 화면에서 바로 할 수 있어요.</p>
            {myMoments.length === 0 ? (
              <p className="muted">아직 작성한 모멘츠가 없습니다.</p>
            ) : (
              <div className="my-moments-list">
                {myMoments.slice(0, 5).map((m) => {
                  const photoCount = (m.media || []).length || (m.photoUrl ? 1 : 0);
                  return (
                    <div className="mini-moment" key={m.id}>
                      <div>
                        <b>{m.mood || "오늘"}</b> <span className="muted">{m.visibility === "friends" ? "친구만" : "전체"}</span>
                        <p>{m.text || (photoCount ? `사진 ${photoCount}장` : "음악 링크")}</p>
                        <small className="muted">좋아요 {m.likeCount || 0} · 댓글 {(m.comments || []).length}</small>
                      </div>
                      {photoCount > 0 && <span className="tag">사진 {photoCount}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {editingProfile && (
            <div className="card">
              <h2>프로필 수정</h2>
              <p className="muted">MBTI, 넓은 지역, 성격, 취향, 취미, 대화 스타일은 언제든 바꿀 수 있어요.</p>
              <ProfileForm {...profileProps} />
              <div className="row" style={{ marginTop: 12 }}>
                <button onClick={saveProfile} disabled={loading}>{loading ? "저장 중..." : "저장"}</button>
                <button className="secondary" onClick={() => setEditingProfile(false)}>취소</button>
              </div>
            </div>
          )}


          <div className="card danger-zone">
            <h2>계정 관리</h2>
            <p className="muted">회원 탈퇴 시 프로필, 모멘츠, 댓글, 좋아요, 친구/편지/차단/신고 기록이 즉시 삭제되며 복구할 수 없습니다.</p>
            <div className="row">
              <button className="danger-button" onClick={handleDeleteAccount} disabled={deletingAccount}>
                {deletingAccount ? "탈퇴 처리 중..." : "회원 탈퇴"}
              </button>
              <button className="secondary" onClick={() => nav("/delete-account")}>웹 삭제 요청 페이지</button>
            </div>
          </div>

          <div className="home-grid">
            <button className="home-tile primary-tile" onClick={() => nav("/moments")}>
              <span>📸</span><b>1. 모멘츠</b><small>오늘 있었던 일과 기분을 편하게 공유해요</small>
            </button>
            <button className="home-tile" onClick={() => nav("/call")}>
              <span>☕</span><b>2. 5분 대화</b><small>부담 없이 짧게 이야기하고 괜찮으면 이어가요</small>
            </button>
            <button className="home-tile" onClick={() => nav("/letters")}>
              <span>💌</span><b>3. 익명 한마디</b><small>누군가에게 짧은 이야기를 보내고 공감으로 연결돼요</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/friends")}>
              <span>👥</span><b>친구/지역</b><small>내 친구와 같은 지역 친구 후보 보기</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/shop")}>
              <span>🧸</span><b>표현 상점</b><small>대화를 부드럽게 만드는 이모티콘</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/missions")}>
              <span>🎯</span><b>활동/초대</b><small>가벼운 활동 보상 확인</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/ranking")}>
              <span>🌡️</span><b>매너 온도</b><small>이번 주 대화 매너 순위</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/community")}>
              <span>🛡️</span><b>안전 가이드</b><small>신고·차단·커뮤니티 기준 확인</small>
            </button>
            <button className="home-tile secondary-tile" onClick={() => nav("/privacy")}>
              <span>📄</span><b>약관/개인정보</b><small>개인정보처리방침과 이용약관</small>
            </button>
            <button className="home-tile danger-tile" onClick={() => { logout(); setUser(null); }}>
              <span>🚪</span><b>로그아웃</b><small>다음에 또 이야기해요</small>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
