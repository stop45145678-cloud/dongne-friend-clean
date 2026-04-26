import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type User = { id: number; nickname: string; temp: number; weeklyTemp: number };

export default function Ranking() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api<User[]>("/ranking").then(setUsers).catch((e) => alert(e.message));
  }, []);

  return (
    <div className="page">
      <h1>매너 온도 랭킹 🌡️</h1>
      <p className="muted">대화 후 받은 친절 평가를 기준으로 보여주는 참고용 순위입니다.</p>
      <div className="card">
        {users.map((u, idx) => (
          <div className="rank-item" key={u.id}>
            <span>{idx + 1}. {u.nickname}</span>
            <span><b>{u.temp}°</b> / 이번 주 +{u.weeklyTemp}°</span>
          </div>
        ))}
      </div>
      <button className="secondary" onClick={() => nav("/")}>홈으로</button>
    </div>
  );
}
