import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";

const tabs = [
  { path: "/privacy", label: "개인정보처리방침" },
  { path: "/terms", label: "이용약관" },
  { path: "/community", label: "커뮤니티 가이드" },
  { path: "/delete-account", label: "계정 삭제 요청" },
];

function Privacy() {
  return (
    <div className="card policy-card">
      <h1>개인정보처리방침</h1>
      <p className="muted">동네친구는 친구 연결과 커뮤니티 운영을 위해 필요한 정보만 수집하고, 정확한 위치 정보나 지도 기반 실시간 위치는 사용하지 않습니다.</p>
      <h3>수집하는 정보</h3>
      <ul>
        <li>계정 정보: 닉네임, 로그인 토큰</li>
        <li>프로필 정보: MBTI, 성격, 취향, 취미, 한줄 소개, 넓은 지역, 공개 범위</li>
        <li>이용 정보: 모멘츠, 사진, YouTube 음악 링크, 댓글, 좋아요, 친구 연결, 익명 한마디</li>
        <li>운영 정보: 신고 내역, 차단 내역, 온도 변경 기록, 회원 탈퇴 요청</li>
      </ul>
      <h3>이용 목적</h3>
      <p>친구 추천, 모멘츠 피드 제공, 신고 처리, 차단 적용, 커뮤니티 안전 관리, 회원 탈퇴 처리에 사용합니다.</p>
      <h3>보관 및 삭제</h3>
      <p>회원 탈퇴 시 프로필, 모멘츠, 댓글, 좋아요, 친구/편지/신고/차단 관련 개인 데이터는 즉시 삭제되도록 설계되어 있습니다.</p>
      <h3>사용자 권리</h3>
      <p>앱 안의 프로필 수정과 회원 탈퇴 기능을 통해 정보를 수정하거나 삭제할 수 있습니다. 앱 접근이 어려운 경우 계정 삭제 요청 페이지를 이용할 수 있습니다.</p>
      <p className="muted small-note">출시 전 실제 사업자명, 연락처, 보관 기간, 위탁/국외 이전 여부는 운영 상황에 맞게 반드시 교체하세요.</p>
    </div>
  );
}

function Terms() {
  return (
    <div className="card policy-card">
      <h1>이용약관</h1>
      <h3>서비스 목적</h3>
      <p>동네친구는 연애 매칭이 아닌 일상 공유와 친구 연결을 위한 서비스입니다.</p>
      <h3>회원 책임</h3>
      <p>사용자는 타인을 사칭하거나, 허위 정보·불법 콘텐츠·광고성 콘텐츠를 올려서는 안 됩니다.</p>
      <h3>콘텐츠 운영</h3>
      <p>모멘츠, 댓글, 사진, 익명 한마디가 신고되거나 가이드 위반으로 판단되면 숨김, 삭제, 이용 제한, 온도 조정이 적용될 수 있습니다.</p>
      <h3>계정 탈퇴</h3>
      <p>앱 내 회원 탈퇴를 진행하면 개인 데이터가 즉시 삭제되며 복구할 수 없습니다.</p>
      <h3>면책</h3>
      <p>사용자 간 대화와 만남으로 발생하는 문제에 대해 서비스는 안전 기능 제공과 신고 처리 범위 내에서 도움을 제공합니다.</p>
    </div>
  );
}

function Community() {
  return (
    <div className="card policy-card">
      <h1>커뮤니티 가이드</h1>
      <p className="muted">친구 찾기 앱답게 부담 없고 안전한 대화를 위해 아래 기준을 지켜주세요.</p>
      <h3>금지 콘텐츠</h3>
      <ul>
        <li>욕설, 혐오, 괴롭힘, 협박, 성희롱</li>
        <li>음란물, 폭력적 이미지, 불법 행위 조장</li>
        <li>개인정보 노출: 전화번호, 주소, 학교/직장 등 민감한 정보 강요</li>
        <li>광고, 도배, 사기, 피싱 링크</li>
        <li>미성년자 대상 부적절한 접근</li>
      </ul>
      <h3>안전 기능</h3>
      <p>불편한 사용자는 신고하거나 차단할 수 있습니다. 차단하면 서로의 모멘츠, 댓글, 지역 추천, 랜덤 연결에서 최대한 제외됩니다.</p>
      <h3>신고 처리</h3>
      <p>신고가 누적되면 콘텐츠가 자동 숨김 처리될 수 있고, 심각한 경우 운영자가 계정을 제한할 수 있습니다. 운영자는 /admin/moderation 페이지에서 신고 목록을 확인하고 모멘츠 숨김 또는 사용자 이용 제한을 처리할 수 있습니다.</p>
      <h3>자동 필터</h3>
      <p>욕설, 성희롱, 조건만남, 협박, 개인정보 요구로 보이는 표현은 게시글·댓글·채팅·익명 한마디 등록 단계에서 차단됩니다.</p>
    </div>
  );
}

function DeleteAccountRequest() {
  const [nickname, setNickname] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState("");
  const submit = async () => {
    try {
      const res = await api<{ message: string }>("/account-deletion-requests", {
        method: "POST",
        body: JSON.stringify({ nickname, contact, reason }),
      });
      setDone(res.message || "삭제 요청이 접수되었습니다.");
      setNickname(""); setContact(""); setReason("");
    } catch (e: any) {
      alert(e.message || "삭제 요청을 접수하지 못했습니다.");
    }
  };
  return (
    <div className="card policy-card">
      <h1>계정 삭제 요청</h1>
      <p className="muted">앱에 로그인할 수 있다면 프로필 화면의 회원 탈퇴를 이용하면 즉시 삭제됩니다. 앱 접근이 어려운 경우 아래로 삭제 요청을 남겨주세요.</p>
      <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임" />
      <div style={{ height: 8 }} />
      <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락 가능한 이메일 또는 연락처" />
      <div style={{ height: 8 }} />
      <textarea className="input textarea small-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="삭제 요청 사유 선택 입력" />
      <div style={{ height: 12 }} />
      <button onClick={submit}>삭제 요청 접수</button>
      {done && <p className="muted">{done}</p>}
    </div>
  );
}

export default function Policies() {
  const nav = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  return (
    <div className="page">
      <div className="row">
        <button className="secondary" onClick={() => nav("/")}>홈</button>
        {tabs.map((tab) => <button key={tab.path} className={path === tab.path ? "" : "secondary"} onClick={() => nav(tab.path)}>{tab.label}</button>)}
      </div>
      {path === "/terms" ? <Terms /> : path === "/community" ? <Community /> : path === "/delete-account" ? <DeleteAccountRequest /> : <Privacy />}
    </div>
  );
}
