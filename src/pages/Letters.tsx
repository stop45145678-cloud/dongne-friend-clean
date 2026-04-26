import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { getStoredUser } from "../auth";

type Letter = {
  id: string;
  title: string;
  content: string;
  tag: string;
  senderId: number;
  recipientId: number;
  sender?: { nickname: string };
  recipient?: { nickname: string };
  replies: { id: string; senderId: number; content: string; createdAt: string }[];
  myInterest: boolean;
  mutualInterest: boolean;
  canRequestFriend: boolean;
  alreadyFriends: boolean;
  createdAt: string;
};

export default function Letters() {
  const nav = useNavigate();
  const user = getStoredUser();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState("일상");
  const [reply, setReply] = useState<Record<string, string>>({});

  const load = async () => {
    const data = await api<{ letters: Letter[] }>("/letters");
    setLetters(data.letters);
  };

  useEffect(() => {
    if (!user) nav("/");
    else load().catch((e) => alert(e.message));
  }, []);

  const send = async () => {
    try {
      await api("/letters/random", { method: "POST", body: JSON.stringify({ title, content, tag }) });
      setTitle(""); setContent("");
      await load();
      alert("익명 한마디를 보냈어요.");
    } catch (e: any) { alert(e.message); }
  };

  const doReply = async (id: string) => {
    const value = (reply[id] || "").trim();
    if (!value) return;
    await api(`/letters/${id}/reply`, { method: "POST", body: JSON.stringify({ content: value }) });
    setReply((prev) => ({ ...prev, [id]: "" }));
    await load();
  };

  const interest = async (id: string) => {
    await api(`/letters/${id}/interest`, { method: "POST", body: JSON.stringify({}) });
    await load();
  };

  const friend = async (id: string) => {
    const data = await api<{ message: string }>(`/letters/${id}/friend-request`, { method: "POST", body: JSON.stringify({}) });
    alert(data.message);
    await load();
  };

  return (
    <div className="page">
      <div className="row"><button className="secondary" onClick={() => nav("/")}>홈</button><button className="secondary" onClick={load}>새로고침</button></div>
      <h1>익명 한마디 💌</h1>
      <p className="muted">짧은 이야기나 고민을 랜덤으로 보내고, 서로 공감하면 친구로 연결될 수 있습니다.</p>

      <div className="card">
        <h2>익명 한마디 쓰기</h2>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
        <div style={{height: 8}} />
        <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
          {['일상','위로','심심함','고민','랜덤'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <div style={{height: 8}} />
        <textarea className="input textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="오늘 있었던 일, 고민, 취미 이야기처럼 가볍게 적어보세요." />
        <div style={{height: 12}} />
        <button onClick={send}>누군가에게 보내기</button>
      </div>

      <h2>내 한마디함</h2>
      {letters.length === 0 && <div className="card muted">아직 주고받은 한마디가 없습니다.</div>}
      {letters.map((l) => {
        const other = l.senderId === user?.id ? l.recipient : l.sender;
        return <div className="card" key={l.id}>
          <div className="row between"><h3>{l.title}</h3><span className="tag">{l.tag}</span></div>
          <p className="muted">대화 상대: {other?.nickname || '알 수 없음'}</p>
          <p>{l.content}</p>
          <div className="letter-replies">
            {(l.replies || []).map((r) => <p key={r.id} className={r.senderId === user?.id ? 'mine-reply' : ''}><b>{r.senderId === user?.id ? '나' : other?.nickname}</b>: {r.content}</p>)}
          </div>
          <div className="row">
            <input className="input flex-input" value={reply[l.id] || ''} onChange={(e) => setReply((prev) => ({ ...prev, [l.id]: e.target.value }))} placeholder="답장" />
            <button className="secondary" onClick={() => doReply(l.id)}>답장</button>
          </div>
          <div className="row" style={{marginTop: 10}}>
            <button className="secondary" disabled={l.myInterest} onClick={() => interest(l.id)}>{l.myInterest ? '공감 완료' : '공감해요'}</button>
            <button disabled={!l.canRequestFriend} onClick={() => friend(l.id)}>{l.alreadyFriends ? '이미 친구' : l.mutualInterest ? '친구로 연결' : '서로 공감 필요'}</button>
          </div>
        </div>;
      })}
    </div>
  );
}
