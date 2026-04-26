import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";

type Report = {
  id: string;
  type: "moment" | "comment";
  momentId?: string;
  commentId?: string;
  targetUserId: number;
  reason: string;
  text: string;
  hiddenByReports?: boolean;
  reporter?: { nickname: string } | null;
  targetUser?: { nickname: string; temp: number } | null;
  createdAt: string;
};

async function adminApi<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-admin-token": token, ...((options.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function AdminModeration() {
  const nav = useNavigate();
  const [token, setToken] = useState(localStorage.getItem("admin_token") || "");
  const [reports, setReports] = useState<Report[]>([]);

  const load = async () => {
    localStorage.setItem("admin_token", token);
    const data = await adminApi<{ reports: Report[] }>("/admin/reports", token);
    setReports(data.reports);
  };

  const hideMoment = async (momentId?: string) => {
    if (!momentId) return alert("모멘츠 ID가 없습니다.");
    await adminApi(`/admin/moments/${momentId}/hide`, token, { method: "POST", body: JSON.stringify({ reason: "관리자 검토 후 숨김" }) });
    await load();
  };

  const suspend = async (userId: number) => {
    if (!confirm("이 사용자를 이용 제한할까요?")) return;
    await adminApi(`/admin/users/${userId}/suspend`, token, { method: "POST", body: JSON.stringify({ reason: "신고 누적 및 커뮤니티 가이드 위반" }) });
    await load();
  };

  return (
    <div className="page">
      <div className="row"><button className="secondary" onClick={() => nav("/")}>홈</button></div>
      <h1>운영자 신고 관리</h1>
      <p className="muted">서버 환경변수 ADMIN_TOKEN과 같은 값을 입력해야 조회/처리됩니다.</p>
      <div className="card">
        <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" />
        <div style={{ height: 10 }} />
        <button onClick={() => load().catch((e) => alert(e.message))}>신고 목록 불러오기</button>
      </div>
      {reports.map((r) => (
        <div className="card" key={r.id}>
          <div className="row between">
            <b>{r.type === "moment" ? "모멘츠" : "댓글"} 신고 · {r.reason}</b>
            <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <p>{r.text || "내용 없음"}</p>
          <p className="muted">신고자: {r.reporter?.nickname || "알 수 없음"} / 대상: {r.targetUser?.nickname || "알 수 없음"} · 온도 {r.targetUser?.temp ?? "-"}</p>
          <div className="row">
            {r.type === "moment" && <button className="secondary" onClick={() => hideMoment(r.momentId).catch((e) => alert(e.message))}>모멘츠 숨김</button>}
            <button className="danger" onClick={() => suspend(r.targetUserId).catch((e) => alert(e.message))}>사용자 이용 제한</button>
          </div>
        </div>
      ))}
    </div>
  );
}
