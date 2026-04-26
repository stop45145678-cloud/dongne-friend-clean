import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { getStoredUser } from "../auth";

type MomentMedia = {
  url: string;
  type: "image";
  name?: string;
  storagePath?: string;
};

type MomentComment = { id: string; nickname: string; text: string; createdAt: string; canDelete?: boolean; reportCount?: number; hiddenByReports?: boolean };

type Moment = {
  id: string;
  mood: string;
  text: string;
  media?: MomentMedia[];
  photoUrl?: string;
  musicUrl?: string;
  visibility: "public" | "friends";
  createdAt: string;
  authorId?: number;
  author?: { id: number; nickname: string; temp: number };
  canEdit?: boolean;
  canBlockAuthor?: boolean;
  reportCount?: number;
  hiddenByReports?: boolean;
  likeCount: number;
  liked: boolean;
  comments: MomentComment[];
};

const reportReasons = ["부적절한 내용", "욕설/불쾌함", "광고/도배", "개인정보 노출", "기타"];
const PAGE_SIZE = 10;

function isYouTubeUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

function resizeImageFile(file: File, maxSize = 1200, quality = 0.82): Promise<MomentMedia> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("사진을 압축할 수 없습니다."));
        ctx.drawImage(img, 0, 0, width, height);
        const url = canvas.toDataURL("image/jpeg", quality);
        resolve({ url, type: "image", name: file.name.replace(/\.[^.]+$/, ".jpg") });
      };
      img.onerror = () => reject(new Error("사진을 읽을 수 없습니다."));
      img.src = String(reader.result || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Moments() {
  const nav = useNavigate();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [mood, setMood] = useState("기뻐요");
  const [media, setMedia] = useState<MomentMedia[]>([]);
  const [musicUrl, setMusicUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMood, setEditMood] = useState("좋아요");
  const [editMusicUrl, setEditMusicUrl] = useState("");
  const [editMedia, setEditMedia] = useState<MomentMedia[]>([]);
  const [editVisibility, setEditVisibility] = useState<"public" | "friends">("public");
  const user = getStoredUser();

  const load = async (nextOffset = 0, append = false) => {
    const data = await api<{ moments: Moment[]; hasMore: boolean; nextOffset: number }>(`/moments?limit=${PAGE_SIZE}&offset=${nextOffset}`);
    setMoments((prev) => append ? [...prev, ...data.moments] : data.moments);
    setOffset(data.nextOffset ?? nextOffset + data.moments.length);
    setHasMore(Boolean(data.hasMore));
  };

  useEffect(() => {
    if (!user) nav("/");
    else load().catch((e) => alert(e.message));
  }, []);

  const onPickMedia = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, 5 - media.length);
    const notImage = picked.find((file) => !file.type.startsWith("image/"));
    if (notImage) return alert("지금 모멘츠는 사진만 올릴 수 있어요.");
    const tooBig = picked.find((file) => file.size > 8 * 1024 * 1024);
    if (tooBig) return alert("원본 사진은 파일당 8MB 이하로 올려주세요. 업로드 전에 자동 압축됩니다.");
    const converted = await Promise.all(picked.map((file) => resizeImageFile(file)));
    setMedia((prev) => [...prev, ...converted].slice(0, 5));
  };

  const onPickEditMedia = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, 5 - editMedia.length);
    const notImage = picked.find((file) => !file.type.startsWith("image/"));
    if (notImage) return alert("모멘츠 수정에서도 사진만 추가할 수 있어요.");
    const tooBig = picked.find((file) => file.size > 8 * 1024 * 1024);
    if (tooBig) return alert("원본 사진은 파일당 8MB 이하로 올려주세요. 업로드 전에 자동 압축됩니다.");
    const converted = await Promise.all(picked.map((file) => resizeImageFile(file)));
    setEditMedia((prev) => [...prev, ...converted].slice(0, 5));
  };

  const submit = async () => {
    try {
      if (!isYouTubeUrl(musicUrl)) return alert("음악 링크는 YouTube 링크만 입력할 수 있어요.");
      await api("/moments", { method: "POST", body: JSON.stringify({ text, mood, media, musicUrl, visibility }) });
      setText("");
      setMedia([]);
      setMusicUrl("");
      setVisibility("public");
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const startEdit = (m: Moment) => {
    setEditingId(m.id);
    setEditText(m.text || "");
    setEditMood(m.mood || "좋아요");
    setEditMusicUrl(m.musicUrl || "");
    setEditMedia(m.media?.length ? m.media : (m.photoUrl ? [{ url: m.photoUrl, type: "image", name: "사진" }] : []));
    setEditVisibility(m.visibility || "public");
  };

  const saveEdit = async (id: string) => {
    try {
      if (!isYouTubeUrl(editMusicUrl)) return alert("음악 링크는 YouTube 링크만 입력할 수 있어요.");
      await api(`/moments/${id}`, { method: "PUT", body: JSON.stringify({ text: editText, mood: editMood, musicUrl: editMusicUrl, media: editMedia, visibility: editVisibility }) });
      setEditingId(null);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const deleteMoment = async (id: string) => {
    if (!confirm("이 모멘츠를 삭제할까요? 댓글과 좋아요도 함께 삭제됩니다.")) return;
    await api(`/moments/${id}`, { method: "DELETE" });
    await load();
  };

  const askReason = (target: "모멘츠" | "댓글") => prompt(`${target} 신고 사유를 입력해주세요.\n예: ${reportReasons.join(", ")}`, reportReasons[0]);

  const blockAuthor = async (authorId?: number, nickname?: string) => {
    if (!authorId) return;
    if (!confirm(`${nickname || "이 사용자"}님을 차단할까요? 서로의 모멘츠, 댓글, 지역 추천, 랜덤 연결에서 최대한 제외됩니다.`)) return;
    try {
      await api(`/blocks/${authorId}`, { method: "POST", body: JSON.stringify({}) });
      alert("차단되었습니다.");
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const reportMoment = async (id: string) => {
    const reason = askReason("모멘츠");
    if (!reason?.trim()) return;
    try {
      const res = await api<{ reportCount: number; hiddenByReports: boolean; decreasedTemp: number }>(`/moments/${id}/report`, { method: "POST", body: JSON.stringify({ reason }) });
      alert(res.decreasedTemp > 0 ? "신고가 접수되었고, 누적 신고로 매너 온도가 조정되었습니다." : "신고가 접수되었습니다. 신고 3회부터 자동 숨김, 5회부터 온도 하락이 적용됩니다.");
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const reportComment = async (momentId: string, commentId: string) => {
    const reason = askReason("댓글");
    if (!reason?.trim()) return;
    try {
      await api(`/moments/${momentId}/comments/${commentId}/report`, { method: "POST", body: JSON.stringify({ reason }) });
      alert("댓글 신고가 접수되었습니다. 누적 신고가 많으면 자동 숨김 처리됩니다.");
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const like = async (id: string) => {
    await api(`/moments/${id}/like`, { method: "POST", body: JSON.stringify({}) });
    await load();
  };

  const comment = async (id: string) => {
    const value = (commentText[id] || "").trim();
    if (!value) return;
    await api(`/moments/${id}/comments`, { method: "POST", body: JSON.stringify({ text: value }) });
    setCommentText((prev) => ({ ...prev, [id]: "" }));
    await load();
  };

  const deleteComment = async (momentId: string, commentId: string) => {
    await api(`/moments/${momentId}/comments/${commentId}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="page">
      <div className="row"><button className="secondary" onClick={() => nav("/")}>홈</button><button className="secondary" onClick={() => load()}>새로고침</button></div>
      <h1>모멘츠 📸</h1>
      <p className="muted">사진, YouTube 음악 링크, 짧은 글로 하루를 공유해요. 사진은 업로드 전에 자동 압축되고, 영상은 제외합니다.</p>

      <div className="card">
        <h2>오늘의 기록 남기기</h2>
        <select className="input" value={mood} onChange={(e) => setMood(e.target.value)}>
          {['좋아요','편안해요','기뻐요','우울해요','배고파요','졸려요','놀랐어요','고마워요','미안해요','힘들어요'].map((m) => <option key={m}>{m}</option>)}
        </select>
        <div style={{height: 8}} />
        <textarea className="input textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="오늘 있었던 일이나 기분을 편하게 남겨보세요." />
        <div style={{height: 8}} />
        <label className="upload-box">
          <b>사진 업로드</b>
          <span className="muted">최대 5장 · 원본 8MB 이하 · 자동 1200px 압축</span>
          <input type="file" accept="image/*" multiple onChange={(e) => onPickMedia(e.target.files)} />
        </label>
        {media.length > 0 && (
          <div className="media-preview-grid">
            {media.map((item, index) => (
              <div className="media-preview" key={`${item.name}-${index}`}>
                <img src={item.url} alt={item.name || "preview"} />
                <button className="tiny danger" onClick={() => setMedia((prev) => prev.filter((_, i) => i !== index))}>삭제</button>
              </div>
            ))}
          </div>
        )}
        <div style={{height: 8}} />
        <input className="input" value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="YouTube 음악 링크 선택 입력" />
        <div style={{height: 8}} />
        <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
          <option value="public">전체 공개</option>
          <option value="friends">친구만 공개</option>
        </select>
        <div style={{height: 12}} />
        <button onClick={submit}>기록 올리기</button>
      </div>

      {moments.map((m) => {
        const items = m.media?.length ? m.media : (m.photoUrl ? [{ url: m.photoUrl, type: "image" as const, name: "사진" }] : []);
        const isEditing = editingId === m.id;
        return (
        <div className="card moment-card" key={m.id}>
          <div className="row between">
            <b>{m.author?.nickname || '알 수 없음'} · {m.mood}</b>
            <span className="muted">{m.visibility === 'friends' ? '친구만' : '전체'} · 신고 {m.reportCount || 0}{m.hiddenByReports ? ' · 숨김 검토중' : ''}</span>
          </div>
          {isEditing ? (
            <div className="edit-box">
              <select className="input" value={editMood} onChange={(e) => setEditMood(e.target.value)}>
                {['좋아요','편안해요','기뻐요','우울해요','배고파요','졸려요','놀랐어요','고마워요','미안해요','힘들어요'].map((mood) => <option key={mood}>{mood}</option>)}
              </select>
              <div style={{height: 8}} />
              <textarea className="input textarea small-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div style={{height: 8}} />
              <input className="input" value={editMusicUrl} onChange={(e) => setEditMusicUrl(e.target.value)} placeholder="YouTube 음악 링크" />
              <div style={{height: 8}} />
              <label className="upload-box compact-upload">
                <b>사진 수정</b>
                <span className="muted">최대 5장 · 각 사진 삭제/추가 가능 · 자동 압축</span>
                <input type="file" accept="image/*" multiple onChange={(e) => onPickEditMedia(e.target.files)} />
              </label>
              {editMedia.length > 0 && (
                <div className="media-preview-grid">
                  {editMedia.map((item, index) => (
                    <div className="media-preview" key={`${item.name || 'edit'}-${index}`}>
                      <img src={item.url} alt={item.name || "edit preview"} />
                      <button className="tiny danger" onClick={() => setEditMedia((prev) => prev.filter((_, i) => i !== index))}>사진 삭제</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{height: 8}} />
              <select className="input" value={editVisibility} onChange={(e) => setEditVisibility(e.target.value as any)}>
                <option value="public">전체 공개</option>
                <option value="friends">친구만 공개</option>
              </select>
              <div className="row" style={{marginTop: 10}}>
                <button onClick={() => saveEdit(m.id)}>수정 저장</button>
                <button className="secondary" onClick={() => setEditingId(null)}>취소</button>
              </div>
            </div>
          ) : (
            <>
              {m.text && <p>{m.text}</p>}
              {items.length > 0 && (
                <div className="moment-media-grid">
                  {items.map((item, index) => (
                    <img key={index} className="moment-photo" src={item.url} alt={item.name || "moment"} onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                  ))}
                </div>
              )}
              {m.musicUrl && <p>🎵 <a href={m.musicUrl} target="_blank" rel="noreferrer">YouTube 음악 링크 열기</a></p>}
            </>
          )}
          <div className="row">
            <button className="secondary" onClick={() => like(m.id)}>{m.liked ? '👍 좋아요 취소' : '👍 좋아요'} {m.likeCount}</button>
            {m.canEdit ? <button className="secondary" onClick={() => startEdit(m)}>수정</button> : <button className="secondary" onClick={() => reportMoment(m.id)}>신고</button>}
            {!m.canEdit && m.canBlockAuthor && <button className="danger" onClick={() => blockAuthor(m.author?.id, m.author?.nickname)}>차단</button>}
            {m.canEdit && <button className="danger" onClick={() => deleteMoment(m.id)}>삭제</button>}
          </div>
          <div className="comments">
            {m.comments.map((c) => (
              <div className="comment-row" key={c.id}>
                <p><b>{c.nickname}</b> {c.text} {c.hiddenByReports ? <span className="muted">(숨김 검토중)</span> : null}</p>
                {c.canDelete ? <button className="tiny" onClick={() => deleteComment(m.id, c.id)}>삭제</button> : <button className="tiny" onClick={() => reportComment(m.id, c.id)}>신고</button>}
              </div>
            ))}
          </div>
          <div className="row">
            <input className="input flex-input" value={commentText[m.id] || ''} onChange={(e) => setCommentText((prev) => ({ ...prev, [m.id]: e.target.value }))} placeholder="댓글 작성" />
            <button className="secondary" onClick={() => comment(m.id)}>등록</button>
          </div>
        </div>
      )})}
      {hasMore && <button className="secondary wide" onClick={() => load(offset, true)}>모멘츠 더보기</button>}
    </div>
  );
}
