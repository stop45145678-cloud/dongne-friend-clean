import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CurrentUser } from "../auth";

type EmoticonItem = { id: string; label: string; image: string };
type ChatMessage = { id: string; senderId: number; senderNickname: string; type: "text" | "emoticon"; content: string; createdAt: string };

type Props = {
  callId: string;
  me: CurrentUser;
  disabled?: boolean;
};

export default function ChatBox({ callId, me, disabled }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [ownedEmoticons, setOwnedEmoticons] = useState<EmoticonItem[]>([]);

  const emoticonMap = useMemo(() => {
    return Object.fromEntries(ownedEmoticons.map((item) => [item.id, item]));
  }, [ownedEmoticons]);

  const loadMessages = async () => {
    const res = await api<{ messages: ChatMessage[] }>(`/calls/${callId}/messages`);
    setMessages(res.messages);
  };

  const loadShopInfo = async () => {
    const res = await api<{ ownedEmoticons: EmoticonItem[] }>("/shop/me");
    setOwnedEmoticons(res.ownedEmoticons);
  };

  useEffect(() => {
    loadMessages().catch(() => {});
    loadShopInfo().catch(() => {});
    const timer = window.setInterval(() => loadMessages().catch(() => {}), 2500);
    return () => window.clearInterval(timer);
  }, [callId]);

  const send = async (type: "text" | "emoticon", content: string) => {
    if (!content.trim()) return;
    await api(`/calls/${callId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type, content }),
    });
    setText("");
    await loadMessages();
  };

  const renderMessageContent = (m: ChatMessage) => {
    if (m.type !== "emoticon") return <div>{m.content}</div>;
    const item = emoticonMap[m.content];
    if (!item) return <div className="big-emoticon">🖼️</div>;
    return <img className="chat-sticker" src={item.image} alt={item.label} title={item.label} />;
  };

  return (
    <div className="chat-box">
      <h3>대화창</h3>
      <div className="chat-log">
        {messages.length === 0 && <p className="muted">아직 메시지가 없습니다.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.senderId === me.id ? "mine" : "theirs"} ${m.type === "emoticon" ? "sticker-bubble" : ""}`}>
            <small>{m.senderNickname}</small>
            {renderMessageContent(m)}
          </div>
        ))}
      </div>
      <div className="emoticon-row sticker-picker">
        {ownedEmoticons.length === 0 ? (
          <span className="muted">표현 상점에서 이모티콘 세트를 받으면 여기에 표시됩니다.</span>
        ) : ownedEmoticons.map((item) => (
          <button key={item.id} className="sticker-button" disabled={disabled} onClick={() => send("emoticon", item.id)} title={item.label}>
            <img src={item.image} alt={item.label} />
          </button>
        ))}
      </div>
      <div className="row">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="가볍게 답장하기" disabled={disabled} />
        <button disabled={disabled || !text.trim()} onClick={() => send("text", text)}>전송</button>
      </div>
    </div>
  );
}
