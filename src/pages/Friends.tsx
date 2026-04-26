import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { getStoredUser } from "../auth";

type Friend = { id: number; nickname: string; temp: number; weeklyTemp?: number; since?: string; profile?: { region?: string; mbti?: string; socialType?: string; hobbies?: string[]; intro?: string } };

export default function Friends() {
  const nav = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [regionalUsers, setRegionalUsers] = useState<Friend[]>([]);
  const [region, setRegion] = useState("지역 선택 안 함");
  const [message, setMessage] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<Friend[]>([]);

  const load = async () => {
    const [friendRes, regionalRes, blockRes] = await Promise.all([
      api<{ friends: Friend[] }>("/friends"),
      api<{ region: string; users: Friend[]; message?: string }>("/friends/regional"),
      api<{ blocks: Friend[] }>("/blocks")
    ]);
    setFriends(friendRes.friends);
    setRegion(regionalRes.region || "지역 선택 안 함");
    setRegionalUsers(regionalRes.users || []);
    setMessage(regionalRes.message || "");
    setBlockedUsers(blockRes.blocks || []);
  };


  const blockUser = async (id: number, nickname: string) => {
    if (!confirm(`${nickname}님을 차단할까요? 서로의 모멘츠, 댓글, 지역 추천, 랜덤 연결에서 최대한 제외됩니다.`)) return;
    await api(`/blocks/${id}`, { method: "POST", body: JSON.stringify({}) });
    await load();
  };

  const unblockUser = async (id: number) => {
    await api(`/blocks/${id}`, { method: "DELETE" });
    await load();
  };

  useEffect(() => {
    if (!getStoredUser()) {
      alert("닉네임으로 먼저 시작해주세요.");
      nav("/");
      return;
    }
    load().catch((e) => alert(e.message || "친구 목록을 불러오지 못했습니다."));
  }, [nav]);

  return (
    <div className="page">
      <div className="row"><button className="secondary" onClick={() => nav("/")}>홈</button><button className="secondary" onClick={load}>새로고침</button></div>
      <h1>친구/지역 👥</h1>
      <p className="muted">정확한 위치나 지도 없이, 프로필에 저장한 넓은 지역만 사용해서 같은 지역 친구 후보를 보여줍니다.</p>

      <div className="card">
        <h2>내 친구 🤝</h2>
        <p className="muted">5분 대화 후 서로 괜찮았거나, 익명 한마디에서 서로 공감하면 친구로 연결됩니다.</p>
        {friends.length === 0 ? <p className="muted">아직 연결된 친구가 없습니다. 5분 대화나 익명 한마디에서 먼저 가볍게 이야기해보세요.</p> : friends.map((f) => (
          <div className="rank-item rich-item" key={f.id}>
            <span>{f.nickname}</span>
            <div className="row"><span><b>{f.temp}°</b> 매너 온도</span><button className="tiny danger" onClick={() => blockUser(f.id, f.nickname)}>차단</button></div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>같은 지역 친구 보기 🌿</h2>
        <p className="muted">현재 선택 지역: <b>{region}</b> · 서울/부산/경기처럼 넓은 지역만 사용합니다.</p>
        {message && <p className="muted">{message}</p>}
        {regionalUsers.length === 0 ? (
          <p className="muted">아직 같은 지역 친구 후보가 없습니다. 프로필에서 지역을 선택하거나, 조금 더 많은 유저가 들어오면 표시됩니다.</p>
        ) : regionalUsers.map((u) => (
          <div className="rank-item rich-item" key={u.id}>
            <div>
              <b>{u.nickname}</b>
              <p className="muted">{u.profile?.mbti || "MBTI 모름"} · {u.profile?.socialType || "대화 스타일 미입력"}</p>
              {u.profile?.hobbies?.length ? <p className="muted">취미: {u.profile.hobbies.slice(0, 3).join(", ")}</p> : null}
              {u.profile?.intro ? <p className="muted">“{u.profile.intro}”</p> : null}
            </div>
            <div className="row"><span><b>{u.temp}°</b></span><button className="tiny danger" onClick={() => blockUser(u.id, u.nickname)}>차단</button></div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>차단한 사용자 🚫</h2>
        <p className="muted">차단하면 서로의 모멘츠, 댓글, 지역 친구 추천, 랜덤 연결에서 최대한 제외됩니다.</p>
        {blockedUsers.length === 0 ? <p className="muted">차단한 사용자가 없습니다.</p> : blockedUsers.map((u) => (
          <div className="rank-item" key={u.id}>
            <span>{u.nickname}</span>
            <button className="tiny secondary" onClick={() => unblockUser(u.id)}>차단 해제</button>
          </div>
        ))}
      </div>

      <div className="row">
        <button onClick={() => nav("/call")}>5분 대화하기</button>
        <button className="secondary" onClick={() => nav("/letters")}>익명 한마디 보기</button>
        <button className="secondary" onClick={() => nav("/")}>홈으로</button>
      </div>
    </div>
  );
}
