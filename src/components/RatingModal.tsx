import React, { useState } from "react";
import { api } from "../api";
import { CurrentUser, saveUser } from "../auth";

type Props = {
  callId: string;
  rater: CurrentUser;
  opponent: { id: number; nickname: string; temp: number };
  onClose: () => void;
  onRated?: (updatedUser: CurrentUser) => void;
};

export default function RatingModal({ callId, rater, opponent, onClose, onRated }: Props) {
  const [score, setScore] = useState(5);
  const [loading, setLoading] = useState(false);

  const handleRate = async () => {
    setLoading(true);
    try {
      const result = await api<{ success: boolean; rater: CurrentUser; ratedUser: any; addedTemp: number; durationSeconds: number }>(`/calls/${callId}/rate`, {
        method: "POST",
        body: JSON.stringify({ ratedUserId: opponent.id, score }),
      });
      saveUser(result.rater);
      onRated?.(result.rater);
      alert(`${opponent.nickname}님에게 매너 온도 +${result.addedTemp}° 지급 완료`);
      onClose();
    } catch (e: any) {
      alert(e.message || "평가 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>매너 평가</h3>
        <p><b>{opponent.nickname}</b>님과의 대화는 편안했나요?</p>
        <input type="range" min="1" max="5" value={score} onChange={(e) => setScore(Number(e.target.value))} />
        <p>편안함 점수: {score} / 5</p>
        <p className="muted">매너 평가는 최소 대화 시간 조건을 통과한 경우에만 가능합니다.</p>
        <div className="row">
          <button onClick={handleRate} disabled={loading}>{loading ? "남기는 중..." : "매너 평가 남기기"}</button>
          <button className="secondary" onClick={onClose}>나중에</button>
        </div>
      </div>
    </div>
  );
}
