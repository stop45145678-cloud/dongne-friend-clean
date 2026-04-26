import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { CurrentUser, getStoredUser, saveUser } from "../auth";

type Mission = {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCoins: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
};

type MissionResponse = {
  user: CurrentUser;
  missions: Mission[];
  invite: { inviteCode: string; invitedCount: number; rewardCoins: number };
};

export default function Missions() {
  const nav = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [invite, setInvite] = useState<MissionResponse["invite"] | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const stored = getStoredUser();
    if (!stored) {
      alert("닉네임으로 먼저 시작해주세요.");
      nav("/");
      return;
    }
    const res = await api<MissionResponse>("/missions");
    setUser(res.user);
    setMissions(res.missions);
    setInvite(res.invite);
    saveUser(res.user);
  };

  useEffect(() => {
    load().catch((e) => alert(e.message || "미션 정보를 불러오지 못했습니다."));
  }, []);

  const claim = async (missionId: string) => {
    setLoading(true);
    try {
      const res = await api<{ success: boolean; user: CurrentUser; missions: Mission[]; rewardCoins: number }>("/missions/claim", {
        method: "POST",
        body: JSON.stringify({ missionId }),
      });
      setUser(res.user);
      setMissions(res.missions);
      saveUser(res.user);
      alert(`${res.rewardCoins}코인 보상을 받았어요!`);
    } catch (e: any) {
      alert(e.message || "보상 받기 실패");
    } finally {
      setLoading(false);
    }
  };

  const applyInvite = async () => {
    if (!inviteCode.trim()) return alert("초대 코드를 입력해주세요.");
    setLoading(true);
    try {
      const res = await api<{ success: boolean; invitedUser: CurrentUser; message: string }>("/invite/apply", {
        method: "POST",
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      setUser(res.invitedUser);
      saveUser(res.invitedUser);
      setInviteCode("");
      alert(res.message || "초대 보상을 받았어요!");
      await load();
    } catch (e: any) {
      alert(e.message || "초대 코드 적용 실패");
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = async () => {
    if (!invite?.inviteCode) return;
    await navigator.clipboard.writeText(invite.inviteCode);
    alert("초대 코드가 복사됐어요.");
  };

  return (
    <div className="page">
      <h1>활동 & 친구 초대 🎁</h1>
      <p className="muted">매일 5분 대화와 매너 평가 미션을 완료하면 코인을 받을 수 있어요.</p>

      <div className="card">
        <h2>{user?.nickname}님</h2>
        <p>보유 코인 <b>{user?.coins ?? 0} 🪙</b></p>
      </div>

      <div className="card">
        <h2>오늘의 미션</h2>
        {missions.map((m) => (
          <div className="mission-item" key={m.id}>
            <div>
              <b>{m.title}</b>
              <p className="muted">{m.description}</p>
              <div className="progress-bar"><span style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} /></div>
              <small>{m.progress}/{m.target} 완료 · 보상 {m.rewardCoins} 🪙</small>
            </div>
            <button disabled={loading || !m.claimable} onClick={() => claim(m.id)}>
              {m.claimed ? "받음" : m.claimable ? "보상 받기" : "진행 중"}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>친구 초대</h2>
        <p className="muted">친구가 내 초대 코드를 입력하면 나와 친구 모두 {invite?.rewardCoins ?? 10}코인을 받아요.</p>
        <div className="invite-code">{invite?.inviteCode || "-"}</div>
        <p>초대한 친구 <b>{invite?.invitedCount ?? 0}명</b></p>
        <div className="row">
          <button onClick={copyInvite}>내 코드 복사</button>
          <button className="secondary" onClick={() => nav("/shop")}>상점 가기</button>
        </div>
        <hr />
        <p className="muted">친구에게 받은 초대 코드가 있다면 한 번만 입력할 수 있어요.</p>
        <div className="row">
          <input className="input flex-input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="초대 코드 입력" />
          <button disabled={loading} onClick={applyInvite}>코드 적용</button>
        </div>
      </div>

      <div className="row">
        <button className="secondary" onClick={() => nav("/")}>홈</button>
        <button onClick={() => nav("/call")}>5분 대화하기</button>
      </div>
    </div>
  );
}
