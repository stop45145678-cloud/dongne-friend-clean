import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import RatingModal from "../components/RatingModal";
import ChatBox from "../components/ChatBox";
import { api } from "../api";
import { CurrentUser, getStoredUser } from "../auth";

type CallStatus = "idle" | "matching" | "ringing" | "rejected" | "connected" | "ended" | "opponentLeft";
type Opponent = { id: number; nickname: string; temp: number };
type MatchResponse = { callId: string; me: CurrentUser; opponent: Opponent; status: "matched"; mode: "fake" | "webrtc-ready" };
type EndResponse = { success: boolean; durationSeconds: number; canRate: boolean };

const CALL_LIMIT_SECONDS = 300;
const MIN_CALL_SECONDS_FOR_RATING = Number(import.meta.env.VITE_MIN_CALL_SECONDS_FOR_RATING || 30);

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function Call() {
  const nav = useNavigate();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [timeLeft, setTimeLeft] = useState(CALL_LIMIT_SECONDS);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [canRate, setCanRate] = useState(false);
  const [callMode, setCallMode] = useState<"fake" | "webrtc-ready">("fake");
  const [message, setMessage] = useState("5분 대화를 시작해보세요.");
  const opponentDisconnectTimer = useRef<number | null>(null);
  const callStartedAt = useRef<number | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      alert("닉네임으로 먼저 시작해주세요.");
      nav("/");
      return;
    }
    setMe(user);
  }, [nav]);

  const clearOpponentDisconnectTimer = () => {
    if (opponentDisconnectTimer.current) {
      window.clearTimeout(opponentDisconnectTimer.current);
      opponentDisconnectTimer.current = null;
    }
  };

  const finishCallUi = (result: EndResponse, nextStatus: CallStatus, nextMessage: string) => {
    clearOpponentDisconnectTimer();
    setStatus(nextStatus);
    setDurationSeconds(result.durationSeconds || 0);
    setCanRate(result.canRate);
    setMessage(result.canRate ? nextMessage : `대화가 ${result.durationSeconds || 0}초로 종료되었습니다. 최소 ${MIN_CALL_SECONDS_FOR_RATING}초 이상 대화해야 매너 평가를 남길 수 있어요.`);
    setShowRating(result.canRate);
  };

  const startMatching = async () => {
    if (!me) return;
    clearOpponentDisconnectTimer();
    setStatus("matching");
    setShowRating(false);
    setCanRate(false);
    setDurationSeconds(0);
    setOpponent(null);
    setCallId(null);
    setTimeLeft(CALL_LIMIT_SECONDS);
    setMessage("편하게 이야기할 친구를 찾는 중입니다...");

    try {
      const match = await api<MatchResponse>("/match/random", { method: "POST" });
      setOpponent(match.opponent);
      setCallId(match.callId);
      setCallMode(match.mode);
      setStatus("ringing");
      setMessage(`${match.opponent.nickname}님과 연결되었습니다. 대화를 시작할지 선택하세요.`);
    } catch (e: any) {
      setStatus("idle");
      setMessage(e.message || "연결 실패");
    }
  };

  const acceptCall = async () => {
    if (!callId) return;
    await api(`/calls/${callId}/accept`, { method: "POST" });
    callStartedAt.current = Date.now();
    setStatus("connected");
    setMessage(callMode === "fake" ? "상대와 연결되었습니다. 편하게 5분만 이야기해보세요. 현재는 fake call 모드입니다." : "상대와 연결되었습니다. 편하게 5분만 이야기해보세요. WebRTC 연결 준비 모드입니다.");

    const disconnectAfter = (Math.floor(Math.random() * 181) + 90) * 1000;
    opponentDisconnectTimer.current = window.setTimeout(() => opponentLeaves(), disconnectAfter);
  };

  const rejectCall = async () => {
    if (callId) await api(`/calls/${callId}/reject`, { method: "POST" });
    clearOpponentDisconnectTimer();
    setStatus("rejected");
    setShowRating(false);
    setCanRate(false);
    setMessage("대화를 거절했습니다. 온도는 변하지 않습니다.");
  };

  const endCall = async () => {
    if (!callId) return;
    const result = await api<EndResponse>(`/calls/${callId}/end`, { method: "POST" });
    finishCallUi(result, "ended", "대화를 종료했습니다. 괜찮은 대화였다면 상대의 매너 온도를 올려줄 수 있어요.");
  };

  const opponentLeaves = async () => {
    if (!callId) return;
    const result = await api<EndResponse>(`/calls/${callId}/opponent-left-demo`, { method: "POST" });
    finishCallUi(result, "opponentLeft", "상대가 대화를 종료했습니다. 괜찮았다면 매너 평가를 남길 수 있어요.");
  };

  const resetCall = () => {
    clearOpponentDisconnectTimer();
    setStatus("idle");
    setTimeLeft(CALL_LIMIT_SECONDS);
    setDurationSeconds(0);
    setShowRating(false);
    setCanRate(false);
    setOpponent(null);
    setCallId(null);
    callStartedAt.current = null;
    setMessage("5분 대화를 시작해보세요.");
  };

  useEffect(() => {
    let timer: number | undefined;
    if (status === "connected") {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            endCall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [status, callId]);

  useEffect(() => () => clearOpponentDisconnectTimer(), []);

  const connectedSeconds = status === "connected" && callStartedAt.current ? Math.floor((Date.now() - callStartedAt.current) / 1000) : durationSeconds;

  return (
    <div className="page">
      <h1>5분 대화 ☕</h1>
      <p className="muted">부담 없이 짧게 이야기해보고, 괜찮은 사람과 친구로 이어지는 연결 기능입니다.</p>
      <div className="card">
        <p>{message}</p>
        <p className="muted">대화 모드: {callMode === "fake" ? "Fake Call / WebRTC 미연결" : "WebRTC 준비"}</p>
        {opponent && <p>대화 상대: <b>{opponent.nickname}</b> <span className="temp">{opponent.temp}°</span></p>}

        {status === "idle" && <button onClick={startMatching}>대화 상대 찾기</button>}
        {status === "matching" && <button disabled>연결 중...</button>}

        {status === "ringing" && (
          <div className="row">
            <button onClick={acceptCall}>대화 시작</button>
            <button className="secondary" onClick={rejectCall}>거절</button>
          </div>
        )}

        {status === "connected" && (
          <div>
            <h2>대화중 {formatTime(timeLeft)}</h2>
            <p className="muted">매너 평가 가능까지 최소 {MIN_CALL_SECONDS_FOR_RATING}초 필요</p>
            {me && callId && <ChatBox callId={callId} me={me} />}
            <div className="row">
              <button onClick={endCall}>대화 종료</button>
            </div>
          </div>
        )}

        {(status === "ended" || status === "opponentLeft") && (
          <p className="muted">총 대화 시간: {connectedSeconds}초 / 평가 가능: {canRate ? "가능" : "불가"}</p>
        )}

        {(status === "rejected" || status === "ended" || status === "opponentLeft") && (
          <div className="row">
            <button onClick={resetCall}>다시 연결</button>
            <button className="secondary" onClick={() => nav("/")}>홈</button>
          </div>
        )}
      </div>

      {showRating && canRate && me && opponent && callId && (
        <RatingModal callId={callId} rater={me} opponent={opponent} onRated={setMe} onClose={() => setShowRating(false)} />
      )}
    </div>
  );
}
