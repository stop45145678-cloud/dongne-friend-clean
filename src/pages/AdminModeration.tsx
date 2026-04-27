import React, { useState } from "react";
import { API_BASE_URL } from "../api";

type Report = {
  id: string;
  type: "moment" | "comment";
  momentId?: string;
  commentId?: string;
  targetUserId: number;
  reason: string;
  text: string;
  status?: "pending" | "investigating" | "resolved" | "dismissed";
  hiddenByReports?: boolean;
  reporter?: { nickname: string } | null;
  targetUser?: { nickname: string; temp: number; suspended?: boolean; banned?: boolean; suspendedUntil?: string | null; sanctionLevel?: string } | null;
  createdAt: string;
};

type AdminUser = {
  id: number;
  nickname: string;
  temp: number;
  reportCount: number;
  warningCount: number;
  suspended: boolean;
  banned: boolean;
  suspendedUntil?: string | null;
  sanctionLevel?: string;
};

type Summary = {
  pendingReports: number;
  suspendedUsers: number;
  bannedUsers: number;
  users: AdminUser[];
  actions: Array<{ id: string; type: string; userId?: number; reason?: string; createdAt: string }>;
};

async function adminApi<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-admin-token": token, ...((options.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function sanctionLabel(user?: Partial<AdminUser> | null) {
  if (!user) return "정상";
  if (user.banned) return "영구정지";
  if (user.suspended) return user.suspendedUntil ? `일시정지 · ${new Date(user.suspendedUntil).toLocaleDateString()}` : "일시정지";
  if (user.sanctionLevel === "warning") return "경고";
  return "정상";
}

export default function AdminModeration() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || "");
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "restricted">("pending");

  const load = async () => {
    localStorage.setItem("admin_token", token);
    const [reportData, summaryData] = await Promise.all([
      adminApi<{ reports: Report[] }>("/admin/reports", token),
      adminApi<Summary>("/admin/summary", token),
    ]);
    setReports(reportData.reports);
    setSummary(summaryData);
  };

  const updateReport = async (reportId: string, status: "resolved" | "dismissed" | "investigating") => {
    await adminApi(`/admin/reports/${reportId}/status`, token, { method: "POST", body: JSON.stringify({ status }) });
    await load();
  };

  const hideMoment = async (momentId?: string) => {
    if (!momentId) return alert("모멘츠 ID가 없습니다.");
    await adminApi(`/admin/moments/${momentId}/hide`, token, { method: "POST", body: JSON.stringify({ reason: "관리자 검토 후 숨김" }) });
    await load();
  };

  const deleteContent = async (report: Report) => {
    if (!confirm("신고된 콘텐츠를 삭제할까요?")) return;
    if (report.type === "moment" && report.momentId) await adminApi(`/admin/moments/${report.momentId}`, token, { method: "DELETE" });
    if (report.type === "comment" && report.commentId) await adminApi(`/admin/comments/${report.commentId}`, token, { method: "DELETE" });
    await load();
  };

  const sanction = async (userId: number, level: "warning" | "suspend_3d" | "suspend_7d" | "ban") => {
    const label = level === "warning" ? "경고" : level === "suspend_3d" ? "3일 정지" : level === "suspend_7d" ? "7일 정지" : "영구정지";
    if (!confirm(`이 사용자를 ${label} 처리할까요?`)) return;
    await adminApi(`/admin/users/${userId}/sanction`, token, { method: "POST", body: JSON.stringify({ level, reason: "관리자 검토 후 커뮤니티 가이드 위반" }) });
    await load();
  };

  const unsuspend = async (userId: number) => {
    if (!confirm("이 사용자의 제재를 해제할까요?")) return;
    await adminApi(`/admin/users/${userId}/unsuspend`, token, { method: "POST", body: JSON.stringify({ reason: "관리자 재검토 후 해제" }) });
    await load();
  };

  const shownReports = reports.filter((r) => {
    if (filter === "pending") return !r.status || r.status === "pending" || r.status === "investigating";
    if (filter === "restricted") return r.targetUser?.suspended || r.targetUser?.banned;
    return true;
  });

  return (
    <div className="page">
      <div className="row"><button className="secondary" onClick={() => { window.location.href = "/" }}>홈</button></div>
      <h1>운영자 모드</h1>
      <p className="muted">자동 제재 기준: 누적 신고 3회 경고 · 5회 3일 정지 · 8회 7일 정지 · 10회 영구정지</p>
      <div className="card">
        <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" />
        <div style={{ height: 10 }} />
        <button onClick={() => load().catch((e) => alert(e.message))}>관리자 데이터 불러오기</button>
      </div>

      {summary && (
        <div className="grid two">
          <div className="card"><b>대기 신고</b><h2>{summary.pendingReports}</h2></div>
          <div className="card"><b>제재 유저</b><h2>{summary.suspendedUsers + summary.bannedUsers}</h2><p className="muted">일시정지 {summary.suspendedUsers} · 영구정지 {summary.bannedUsers}</p></div>
        </div>
      )}

      {summary && (
        <div className="card">
          <h2>위험 유저 TOP</h2>
          {summary.users.slice(0, 8).map((u) => (
            <div className="row between" key={u.id} style={{ borderTop: "1px solid rgba(255,255,255,.08)", padding: "10px 0" }}>
              <div><b>{u.nickname}</b><p className="muted">신고 {u.reportCount}회 · 경고 {u.warningCount}회 · {sanctionLabel(u)}</p></div>
              <div className="row">
                <button className="secondary" onClick={() => sanction(u.id, "warning")}>경고</button>
                <button className="secondary" onClick={() => sanction(u.id, "suspend_3d")}>3일 정지</button>
                <button className="secondary" onClick={() => sanction(u.id, "suspend_7d")}>7일 정지</button>
                <button className="danger" onClick={() => sanction(u.id, "ban")}>영구정지</button>
                {(u.suspended || u.banned) && <button onClick={() => unsuspend(u.id)}>해제</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button className={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>대기 신고</button>
        <button className={filter === "restricted" ? "primary" : "secondary"} onClick={() => setFilter("restricted")}>제재 대상</button>
        <button className={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>전체</button>
      </div>

      {shownReports.map((r) => (
        <div className="card" key={r.id}>
          <div className="row between">
            <b>{r.type === "moment" ? "모멘츠" : "댓글"} 신고 · {r.reason}</b>
            <span className="muted">{new Date(r.createdAt).toLocaleString()} · {r.status || "pending"}</span>
          </div>
          <p>{r.text || "내용 없음"}</p>
          <p className="muted">신고자: {r.reporter?.nickname || "알 수 없음"} / 대상: {r.targetUser?.nickname || "알 수 없음"} · 온도 {r.targetUser?.temp ?? "-"} · {sanctionLabel(r.targetUser as any)}</p>
          <div className="row">
            <button className="secondary" onClick={() => updateReport(r.id, "investigating").catch((e) => alert(e.message))}>검토중</button>
            <button className="secondary" onClick={() => updateReport(r.id, "resolved").catch((e) => alert(e.message))}>처리완료</button>
            <button className="secondary" onClick={() => updateReport(r.id, "dismissed").catch((e) => alert(e.message))}>기각</button>
            {r.type === "moment" && <button className="secondary" onClick={() => hideMoment(r.momentId).catch((e) => alert(e.message))}>숨김</button>}
            <button className="danger" onClick={() => deleteContent(r).catch((e) => alert(e.message))}>콘텐츠 삭제</button>
            <button className="danger" onClick={() => sanction(r.targetUserId, "suspend_3d").catch((e) => alert(e.message))}>3일 정지</button>
            <button className="danger" onClick={() => sanction(r.targetUserId, "ban").catch((e) => alert(e.message))}>영구정지</button>
          </div>
        </div>
      ))}
    </div>
  );
}
