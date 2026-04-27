const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { createAppStore } = require("./supabase-store");
const { uploadMomentImages, removeStorageObjects } = require("./supabase-storage");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "data", "db.json");
const MIN_CALL_SECONDS_FOR_RATING = Number(process.env.MIN_CALL_SECONDS_FOR_RATING || 30);
const REMATCH_BLOCK_MS = Number(process.env.REMATCH_BLOCK_HOURS || 2) * 60 * 60 * 1000;
const STARTING_COINS = Number(process.env.STARTING_COINS || 50);
const DAILY_CALL_MISSION_TARGET = Number(process.env.DAILY_CALL_MISSION_TARGET || 3);
const DAILY_RATE_MISSION_TARGET = Number(process.env.DAILY_RATE_MISSION_TARGET || 2);
const DAILY_MISSION_REWARD_COINS = Number(process.env.DAILY_MISSION_REWARD_COINS || 5);
const INVITE_REWARD_COINS = Number(process.env.INVITE_REWARD_COINS || 10);

const EMOTION_LABELS = ["공감", "편안해요", "기뻐요", "우울해요", "배고파요", "졸려요", "놀랐어요", "고마워요", "미안해요", "힘들어요"];

function createEmoticonPack(id, name, animalPath, description) {
  return {
    id,
    name,
    price: 5,
    description,
    coverImage: `/assets/emoticons/${animalPath}/sheet.png`,
    emoticons: EMOTION_LABELS.map((label, index) => ({
      id: `${id}-${index + 1}`,
      label,
      image: `/assets/emoticons/${animalPath}/${index + 1}.webp`
    }))
  };
}

const EMOTICON_PRODUCTS = [
  createEmoticonPack("rabbit-set", "토끼 감정 이모티콘 세트", "rabbit", "귀여운 토끼의 10가지 감정 표현"),
  createEmoticonPack("redpanda-set", "랫서팬더 감정 이모티콘 세트", "redpanda", "귀여운 랫서팬더의 10가지 감정 표현"),
  createEmoticonPack("beaver-set", "비버 감정 이모티콘 세트", "beaver", "댕청미 가득한 비버의 10가지 감정 표현")
];

const REGION_OPTIONS = ["지역 선택 안 함", "서울", "부산", "인천", "대구", "대전", "광주", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

function sanitizeRegion(value) {
  const region = String(value || "지역 선택 안 함").trim();
  return REGION_OPTIONS.includes(region) ? region : "지역 선택 안 함";
}

function sanitizeList(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => item.slice(0, 20));
}

function sanitizeProfileVisibility(value) {
  return ["public", "friends", "private"].includes(value) ? value : "public";
}

function sanitizeProfile(profile = {}) {
  return {
    mbti: String(profile.mbti || "모름").trim().slice(0, 8),
    socialType: String(profile.socialType || "천천히 친해지는 편").trim().slice(0, 30),
    personalities: sanitizeList(profile.personalities, ["다정함"]),
    tastes: sanitizeList(profile.tastes, ["카페"]),
    hobbies: sanitizeList(profile.hobbies, ["동네 산책"]),
    intro: String(profile.intro || "").trim().slice(0, 80),
    region: sanitizeRegion(profile.region),
    profileVisibility: sanitizeProfileVisibility(profile.profileVisibility)
  };
}

app.use(cors());
app.use(express.json({ limit: "60mb" }));
app.use("/assets", express.static(path.join(__dirname, "../public/assets")));


const BLOCKED_TEXT_PATTERNS = [
  /시발|씨발|ㅅㅂ|병신|개새끼|좆|꺼져/gi,
  /섹스|야동|조건만남|원나잇|성매매/gi,
  /죽여|자살해|협박|스토킹/gi,
  /카톡\s*아이디|전화번호|집주소|주민번호/gi
];

function moderateText(value, fieldName = "내용") {
  const text = String(value || "").trim();
  const matched = BLOCKED_TEXT_PATTERNS.find((pattern) => pattern.test(text));
  BLOCKED_TEXT_PATTERNS.forEach((pattern) => { pattern.lastIndex = 0; });
  if (matched) {
    const error = new Error(`${fieldName}에 욕설, 성희롱, 개인정보 요구 등 금지 표현이 포함되어 있습니다.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN || "";
  if (!adminToken) return res.status(403).send("ADMIN_TOKEN 환경변수를 설정해야 관리자 기능을 사용할 수 있습니다.");
  if (req.headers["x-admin-token"] !== adminToken) return res.status(401).send("관리자 인증이 필요합니다.");
  req.db = readDb();
  next();
}

function publicReportUser(db, userId) {
  const user = (db.users || []).find((u) => u.id === userId);
  return user ? {
    id: user.id,
    nickname: user.nickname,
    temp: user.temp,
    suspended: Boolean(user.suspended),
    banned: Boolean(user.banned),
    suspendedUntil: user.suspendedUntil || null,
    sanctionLevel: user.sanctionLevel || "none"
  } : null;
}

function ensureModerationCollections(db) {
  db.momentReports = db.momentReports || [];
  db.commentReports = db.commentReports || [];
  db.moderationActions = db.moderationActions || [];
  db.sanctions = db.sanctions || [];
}

function getTargetReportCount(db, userId) {
  ensureModerationCollections(db);
  const momentCount = db.momentReports.filter((r) => r.targetUserId === userId).length;
  const commentCount = db.commentReports.filter((r) => r.targetUserId === userId).length;
  return momentCount + commentCount;
}

function applyUserSanction(db, userId, level, reason, appliedBy = "system") {
  ensureModerationCollections(db);
  const user = (db.users || []).find((u) => u.id === userId);
  if (!user) return null;
  const now = new Date();
  const startedAt = now.toISOString();
  const sanction = { id: uuidv4(), userId, level, reason, appliedBy, createdAt: startedAt };

  if (level === "warning") {
    user.warningCount = Number(user.warningCount || 0) + 1;
    user.sanctionLevel = "warning";
    sanction.type = "warning";
  }
  if (level === "suspend_3d" || level === "suspend_7d") {
    const days = level === "suspend_3d" ? 3 : 7;
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    user.suspended = true;
    user.banned = false;
    user.suspendedUntil = until;
    user.suspendedReason = reason;
    user.suspendedAt = startedAt;
    user.sanctionLevel = level;
    sanction.type = "suspension";
    sanction.durationDays = days;
    sanction.expiresAt = until;
  }
  if (level === "ban") {
    user.suspended = true;
    user.banned = true;
    user.suspendedUntil = null;
    user.suspendedReason = reason;
    user.suspendedAt = startedAt;
    user.sanctionLevel = "ban";
    sanction.type = "ban";
  }

  db.sanctions.push(sanction);
  db.moderationActions.push({ id: uuidv4(), type: `apply_${level}`, userId, reason, appliedBy, createdAt: startedAt });
  return sanction;
}

function clearUserSanction(db, userId, reason = "관리자 해제") {
  ensureModerationCollections(db);
  const user = (db.users || []).find((u) => u.id === userId);
  if (!user) return null;
  user.suspended = false;
  user.banned = false;
  user.suspendedUntil = null;
  user.suspendedReason = null;
  user.sanctionLevel = "none";
  db.moderationActions.push({ id: uuidv4(), type: "clear_sanction", userId, reason, appliedBy: "admin", createdAt: new Date().toISOString() });
  return user;
}

function refreshUserSanction(user) {
  if (!user) return;
  if (user.suspended && !user.banned && user.suspendedUntil && new Date(user.suspendedUntil).getTime() <= Date.now()) {
    user.suspended = false;
    user.suspendedUntil = null;
    user.suspendedReason = null;
    user.sanctionLevel = "none";
  }
}

function applyAutoSanctionFromReports(db, userId, reason) {
  const totalReports = getTargetReportCount(db, userId);
  const user = (db.users || []).find((u) => u.id === userId);
  if (!user) return { totalReports, sanction: null };
  if (user.banned) return { totalReports, sanction: null };

  let sanction = null;
  if (totalReports >= 10 && user.sanctionLevel !== "ban") {
    sanction = applyUserSanction(db, userId, "ban", `${reason} · 누적 신고 ${totalReports}회`, "auto");
  } else if (totalReports >= 8 && !["suspend_7d", "ban"].includes(user.sanctionLevel)) {
    sanction = applyUserSanction(db, userId, "suspend_7d", `${reason} · 누적 신고 ${totalReports}회`, "auto");
  } else if (totalReports >= 5 && !["suspend_3d", "suspend_7d", "ban"].includes(user.sanctionLevel)) {
    sanction = applyUserSanction(db, userId, "suspend_3d", `${reason} · 누적 신고 ${totalReports}회`, "auto");
  } else if (totalReports >= 3 && (!user.sanctionLevel || user.sanctionLevel === "none")) {
    sanction = applyUserSanction(db, userId, "warning", `${reason} · 누적 신고 ${totalReports}회`, "auto");
  }
  return { totalReports, sanction };
}

function normalizeUser(user) {
  if (!user.token) user.token = uuidv4();
  if (!Number.isFinite(Number(user.coins))) user.coins = STARTING_COINS;
  if (!Array.isArray(user.ownedEmoticonPacks)) user.ownedEmoticonPacks = [];
  if (!user.inviteCode) user.inviteCode = `DF${String(user.id || uuidv4()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
  if (!Array.isArray(user.invitedUsers)) user.invitedUsers = [];
  if (!Number.isFinite(Number(user.weeklyTemp))) user.weeklyTemp = 0;
  if (!Number.isFinite(Number(user.temp))) user.temp = 36;
  user.profile = sanitizeProfile(user.profile || {});
  return user;
}

function defaultDb() {
  return {
    users: [
      normalizeUser({ id: 1, nickname: "동네곰", temp: 36, weeklyTemp: 0, token: uuidv4(), coins: STARTING_COINS, ownedEmoticonPacks: [], profile: { mbti: "ISFP", socialType: "천천히 친해지는 편", personalities: ["차분함", "다정함"], tastes: ["산책", "카페"], hobbies: ["동네 산책", "음악 듣기"], intro: "편한 대화를 좋아해요.", region: "서울" } }),
      normalizeUser({ id: 2, nickname: "따뜻한여우", temp: 40, weeklyTemp: 4, token: uuidv4(), coins: STARTING_COINS, ownedEmoticonPacks: [], profile: { mbti: "ENFP", socialType: "먼저 말을 거는 편", personalities: ["활발함", "유머러스함"], tastes: ["맛집", "영화"], hobbies: ["맛집 탐방", "콘텐츠 보기"], intro: "가볍게 웃으면서 이야기해요.", region: "경기" } }),
      normalizeUser({ id: 3, nickname: "친절한고래", temp: 38, weeklyTemp: 2, token: uuidv4(), coins: STARTING_COINS, ownedEmoticonPacks: [], profile: { mbti: "INFJ", socialType: "깊은 이야기를 좋아하는 편", personalities: ["공감형", "신중함"], tastes: ["독서", "음악"], hobbies: ["책 읽기", "사진 찍기"], intro: "서로의 하루를 조용히 들어주는 편이에요.", region: "서울" } })
    ],
    calls: [],
    matches: [],
    ratings: [],
    messages: [],
    missionClaims: [],
    inviteRewards: [],
    swipes: [],
    friends: [],
    moments: [],
    momentLikes: [],
    momentComments: [],
    momentReports: [],
    commentReports: [],
    blocks: [],
    deletionRequests: [],
    temperatureEvents: [],
    moderationActions: [],
    letters: []
  };
}

const appStore = createAppStore({ defaultDb, normalizeUser, dbPath: DB_PATH });

function readDb() {
  return appStore.readDb();
}

function writeDb(db) {
  return appStore.writeDb(db);
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    temp: user.temp,
    weeklyTemp: user.weeklyTemp || 0,
    coins: user.coins || 0,
    ownedEmoticonPacks: user.ownedEmoticonPacks || [],
    inviteCode: user.inviteCode,
    referredBy: user.referredBy || null,
    invitedCount: (user.invitedUsers || []).length,
    profile: sanitizeProfile(user.profile || {})
  };
}

function sessionUser(user) {
  return { ...publicUser(user), token: user.token };
}

function getOwnedEmoticons(user) {
  const owned = new Set(user.ownedEmoticonPacks || []);
  return EMOTICON_PRODUCTS.filter((p) => owned.has(p.id)).flatMap((p) => p.emoticons);
}

function getOwnedEmoticonIds(user) {
  return getOwnedEmoticons(user).map((e) => e.id);
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  const db = readDb();
  const user = db.users.find((u) => u.token === token);
  if (!token || !user) return res.status(401).send("로그인이 필요합니다.");
  refreshUserSanction(user);
  if (user.banned) return res.status(403).send("커뮤니티 가이드 위반으로 영구 이용 제한된 계정입니다.");
  if (user.suspended) return res.status(403).send(`커뮤니티 가이드 위반으로 이용이 제한된 계정입니다.${user.suspendedUntil ? ` 해제 예정: ${new Date(user.suspendedUntil).toLocaleString()}` : ""}`);
  req.db = db;
  req.user = user;
  next();
}

function callDurationSeconds(call) {
  if (!call.startedAt || !call.endedAt) return 0;
  return Math.max(0, Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000));
}

function isSamePair(match, userAId, userBId) {
  return (match.a === userAId && match.b === userBId) || (match.a === userBId && match.b === userAId);
}

function isRematchBlocked(db, userAId, userBId) {
  const now = Date.now();
  return (db.matches || []).some((m) => isSamePair(m, userAId, userBId) && now - new Date(m.createdAt).getTime() < REMATCH_BLOCK_MS);
}

function cleanupOldMatches(db) {
  const now = Date.now();
  db.matches = (db.matches || []).filter((m) => now - new Date(m.createdAt).getTime() < REMATCH_BLOCK_MS);
}

function recordMatch(db, userAId, userBId, callId) {
  cleanupOldMatches(db);
  db.matches.push({ id: uuidv4(), a: userAId, b: userBId, callId, createdAt: new Date().toISOString() });
}


function areFriends(db, userAId, userBId) {
  return (db.friends || []).some((f) => isSamePair({ a: f.a, b: f.b }, userAId, userBId));
}

function makeFriends(db, userAId, userBId) {
  if (areFriends(db, userAId, userBId)) return false;
  db.friends.push({ id: uuidv4(), a: userAId, b: userBId, createdAt: new Date().toISOString() });
  return true;
}

function isBlocked(db, userAId, userBId) {
  return (db.blocks || []).some((b) =>
    (b.blockerId === userAId && b.blockedUserId === userBId) ||
    (b.blockerId === userBId && b.blockedUserId === userAId)
  );
}

function blockedByMe(db, blockerId, blockedUserId) {
  return (db.blocks || []).some((b) => b.blockerId === blockerId && b.blockedUserId === blockedUserId);
}

function hasSwiped(db, fromUserId, toUserId) {
  return (db.swipes || []).some((s) => s.fromUserId === fromUserId && s.toUserId === toUserId);
}

function canSeeMoment(db, viewerId, moment) {
  if (moment.authorId === viewerId) return true;
  if (isBlocked(db, viewerId, moment.authorId)) return false;
  if (moment.visibility === "friends") return areFriends(db, viewerId, moment.authorId);
  return true;
}

function normalizeMedia(value = {}) {
  const url = String(value.url || "").trim().slice(0, 12000000);
  const type = "image";
  const name = String(value.name || "").trim().slice(0, 80);
  const storagePath = String(value.storagePath || "").trim().slice(0, 500);
  if (!url) return null;
  if (!url.startsWith("data:image/") && !/^https?:\/\//.test(url)) return null;
  return storagePath ? { url, storagePath, type, name } : { url, type, name };
}

function splitNewAndStoredMedia(media = []) {
  const normalized = (Array.isArray(media) ? media : []).map(normalizeMedia).filter(Boolean).slice(0, 5);
  const newImages = normalized.filter((m) => String(m.url || "").startsWith("data:image/"));
  const storedImages = normalized.filter((m) => !String(m.url || "").startsWith("data:image/"));
  return { newImages, storedImages };
}

function mediaStoragePaths(media = []) {
  return (Array.isArray(media) ? media : []).map((m) => m?.storagePath).filter(Boolean);
}

function isYouTubeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return true;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www./, "").toLowerCase();
    return ["youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"].includes(host);
  } catch {
    return false;
  }
}

function sanitizeYouTubeUrl(value = "") {
  const raw = String(value || "").trim().slice(0, 500);
  if (!raw) return "";
  return isYouTubeUrl(raw) ? raw : null;
}

function decreaseTemperature(db, user, amount, reason, sourceId) {
  const value = Math.max(1, Math.min(30, Number(amount || 1)));
  const before = Number(user.temp || 36);
  user.temp = Math.max(0, before - value);
  user.weeklyTemp = Math.max(0, Number(user.weeklyTemp || 0) - value);
  db.temperatureEvents = db.temperatureEvents || [];
  db.temperatureEvents.push({ id: uuidv4(), userId: user.id, type: "decrease", amount: value, reason, sourceId, before, after: user.temp, createdAt: new Date().toISOString() });
  return value;
}

function publicMoment(db, moment, viewerId) {
  const author = db.users.find((u) => u.id === moment.authorId);
  const likes = (db.momentLikes || []).filter((l) => l.momentId === moment.id);
  const reports = (db.momentReports || []).filter((r) => r.momentId === moment.id);
  const comments = (db.momentComments || [])
    .filter((c) => c.momentId === moment.id)
    .filter((c) => c.userId === viewerId || !isBlocked(db, viewerId, c.userId))
    .filter((c) => !c.hiddenByReports || c.userId === viewerId || moment.authorId === viewerId)
    .map((c) => {
      const user = db.users.find((u) => u.id === c.userId);
      const commentReports = (db.commentReports || []).filter((r) => r.commentId === c.id);
      return {
        ...c,
        nickname: user?.nickname || "알 수 없음",
        canDelete: c.userId === viewerId,
        reportCount: commentReports.length,
        hiddenByReports: Boolean(c.hiddenByReports)
      };
    });
  const legacyPhoto = moment.photoUrl ? [{ url: moment.photoUrl, type: "image", name: "사진" }] : [];
  return {
    ...moment,
    media: Array.isArray(moment.media) ? moment.media : legacyPhoto,
    author: author ? publicUser(author) : null,
    canEdit: moment.authorId === viewerId,
    canBlockAuthor: Boolean(author && author.id !== viewerId && !blockedByMe(db, viewerId, author.id)),
    reportCount: reports.length,
    hiddenByReports: Boolean(moment.hiddenByReports),
    likeCount: likes.length,
    liked: likes.some((l) => l.userId === viewerId),
    comments
  };
}

function publicLetter(db, letter, viewerId) {
  const sender = db.users.find((u) => u.id === letter.senderId);
  const recipient = db.users.find((u) => u.id === letter.recipientId);
  const myInterest = (letter.interests || []).includes(viewerId);
  const mutualInterest = (letter.interests || []).includes(letter.senderId) && (letter.interests || []).includes(letter.recipientId);
  return {
    ...letter,
    sender: sender ? publicUser(sender) : null,
    recipient: recipient ? publicUser(recipient) : null,
    myInterest,
    mutualInterest,
    canRequestFriend: mutualInterest && !areFriends(db, letter.senderId, letter.recipientId),
    alreadyFriends: areFriends(db, letter.senderId, letter.recipientId)
  };
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isTodayIso(iso, key = todayKey()) {
  return typeof iso === "string" && iso.slice(0, 10) === key;
}

function buildMissionState(db, userId) {
  const dateKey = todayKey();
  const completedCalls = (db.calls || []).filter((c) =>
    c.participants.includes(userId) &&
    c.status === "ended" &&
    c.startedAt &&
    isTodayIso(c.endedAt || c.startedAt, dateKey)
  ).length;
  const completedRatings = (db.ratings || []).filter((r) => r.raterId === userId && isTodayIso(r.createdAt, dateKey)).length;
  const missions = [
    { id: "daily-calls-3", title: "오늘 대화 3번", description: "5분 대화를 3번 완료하면 코인을 받아요.", target: DAILY_CALL_MISSION_TARGET, progress: Math.min(completedCalls, DAILY_CALL_MISSION_TARGET), rewardCoins: DAILY_MISSION_REWARD_COINS },
    { id: "daily-ratings-2", title: "오늘 평가 2번", description: "상대를 2번 평가하면 코인을 받아요.", target: DAILY_RATE_MISSION_TARGET, progress: Math.min(completedRatings, DAILY_RATE_MISSION_TARGET), rewardCoins: DAILY_MISSION_REWARD_COINS }
  ];
  return missions.map((m) => {
    const claimed = (db.missionClaims || []).some((c) => c.userId === userId && c.dateKey === dateKey && c.missionId === m.id);
    return { ...m, completed: m.progress >= m.target, claimed, claimable: m.progress >= m.target && !claimed, dateKey };
  });
}

function applyInviteReward(db, invitedUser, inviteCode) {
  const code = String(inviteCode || "").trim().toUpperCase();
  if (!code) return { applied: false, message: "초대 코드가 없습니다." };
  if (invitedUser.referredBy) return { applied: false, message: "이미 초대 보상을 받은 계정입니다." };
  const inviter = db.users.find((u) => String(u.inviteCode || "").toUpperCase() === code);
  if (!inviter) return { applied: false, message: "초대 코드를 찾을 수 없습니다." };
  if (inviter.id === invitedUser.id) return { applied: false, message: "내 초대 코드는 사용할 수 없습니다." };

  invitedUser.referredBy = inviter.id;
  invitedUser.coins = Number(invitedUser.coins || 0) + INVITE_REWARD_COINS;
  inviter.coins = Number(inviter.coins || 0) + INVITE_REWARD_COINS;
  if (!Array.isArray(inviter.invitedUsers)) inviter.invitedUsers = [];
  if (!inviter.invitedUsers.includes(invitedUser.id)) inviter.invitedUsers.push(invitedUser.id);
  db.inviteRewards.push({ id: uuidv4(), inviterId: inviter.id, invitedUserId: invitedUser.id, rewardCoins: INVITE_REWARD_COINS, createdAt: new Date().toISOString() });
  return { applied: true, message: `초대 보상 ${INVITE_REWARD_COINS}코인이 지급되었습니다.`, inviter: publicUser(inviter), invitedUser: sessionUser(invitedUser) };
}

async function deleteUserEverywhere(db, userId) {
  await removeStorageObjects((db.moments || []).filter((m) => m.authorId === userId).flatMap((m) => mediaStoragePaths(m.media || [])));
  const userMomentIds = new Set((db.moments || []).filter((m) => m.authorId === userId).map((m) => m.id));
  const commentIdsOnUserMoments = new Set((db.momentComments || []).filter((c) => userMomentIds.has(c.momentId)).map((c) => c.id));
  const userCommentIds = new Set((db.momentComments || []).filter((c) => c.userId === userId).map((c) => c.id));
  const removedCommentIds = new Set([...commentIdsOnUserMoments, ...userCommentIds]);

  db.users = (db.users || []).filter((u) => u.id !== userId);
  db.users.forEach((u) => {
    if (u.referredBy === userId) u.referredBy = null;
    if (Array.isArray(u.invitedUsers)) u.invitedUsers = u.invitedUsers.filter((id) => id !== userId);
  });

  db.calls = (db.calls || []).filter((c) => !(c.participants || []).includes(userId));
  db.matches = (db.matches || []).filter((m) => m.a !== userId && m.b !== userId);
  db.ratings = (db.ratings || []).filter((r) => r.raterId !== userId && r.ratedUserId !== userId);
  db.messages = (db.messages || []).filter((m) => m.fromUserId !== userId && m.toUserId !== userId && m.userId !== userId && m.senderId !== userId);
  db.missionClaims = (db.missionClaims || []).filter((m) => m.userId !== userId);
  db.inviteRewards = (db.inviteRewards || []).filter((r) => r.inviterId !== userId && r.invitedUserId !== userId);
  db.swipes = (db.swipes || []).filter((s) => s.fromUserId !== userId && s.toUserId !== userId);
  db.friends = (db.friends || []).filter((f) => f.a !== userId && f.b !== userId);
  db.blocks = (db.blocks || []).filter((b) => b.blockerId !== userId && b.blockedUserId !== userId);
  db.deletionRequests = (db.deletionRequests || []).filter((r) => r.userId !== userId);

  db.moments = (db.moments || []).filter((m) => m.authorId !== userId);
  db.momentLikes = (db.momentLikes || []).filter((l) => l.userId !== userId && !userMomentIds.has(l.momentId));
  db.momentComments = (db.momentComments || []).filter((c) => c.userId !== userId && !userMomentIds.has(c.momentId));
  db.momentReports = (db.momentReports || []).filter((r) => r.reporterId !== userId && r.targetUserId !== userId && !userMomentIds.has(r.momentId));
  db.commentReports = (db.commentReports || []).filter((r) => r.reporterId !== userId && r.targetUserId !== userId && !removedCommentIds.has(r.commentId));
  db.temperatureEvents = (db.temperatureEvents || []).filter((e) => e.userId !== userId);
  db.letters = (db.letters || [])
    .filter((l) => l.senderId !== userId && l.recipientId !== userId)
    .map((l) => ({
      ...l,
      interests: (l.interests || []).filter((id) => id !== userId),
      replies: (l.replies || []).filter((r) => r.senderId !== userId)
    }));
}


app.get("/admin/summary", requireAdmin, (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  (db.users || []).forEach(refreshUserSanction);
  const users = (db.users || []).map((u) => ({
    id: u.id, nickname: u.nickname, temp: u.temp, coins: u.coins || 0,
    reportCount: getTargetReportCount(db, u.id),
    warningCount: u.warningCount || 0,
    suspended: Boolean(u.suspended), banned: Boolean(u.banned),
    suspendedUntil: u.suspendedUntil || null, sanctionLevel: u.sanctionLevel || "none",
    createdAt: u.createdAt || null
  })).sort((a, b) => b.reportCount - a.reportCount);
  res.json({
    pendingReports: (db.momentReports || []).filter((r) => r.status !== "resolved" && r.status !== "dismissed").length +
      (db.commentReports || []).filter((r) => r.status !== "resolved" && r.status !== "dismissed").length,
    suspendedUsers: users.filter((u) => u.suspended && !u.banned).length,
    bannedUsers: users.filter((u) => u.banned).length,
    users,
    actions: (db.moderationActions || []).slice(-50).reverse()
  });
});

app.get("/admin/reports", requireAdmin, (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  const momentReports = (db.momentReports || []).map((r) => {
    const moment = (db.moments || []).find((m) => m.id === r.momentId);
    return { ...r, status: r.status || "pending", type: "moment", targetUser: publicReportUser(db, r.targetUserId), reporter: publicReportUser(db, r.reporterId), hiddenByReports: Boolean(moment?.hiddenByReports), text: moment?.text || "" };
  });
  const commentReports = (db.commentReports || []).map((r) => {
    const comment = (db.momentComments || []).find((c) => c.id === r.commentId);
    return { ...r, status: r.status || "pending", type: "comment", targetUser: publicReportUser(db, r.targetUserId), reporter: publicReportUser(db, r.reporterId), hiddenByReports: Boolean(comment?.hiddenByReports), text: comment?.text || "" };
  });
  res.json({ reports: [...momentReports, ...commentReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
});

app.post("/admin/reports/:reportId/status", requireAdmin, (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  const reportId = req.params.reportId;
  const status = ["pending", "investigating", "resolved", "dismissed"].includes(req.body.status) ? req.body.status : "resolved";
  const note = String(req.body.note || "").trim().slice(0, 200);
  const report = [...db.momentReports, ...db.commentReports].find((r) => r.id === reportId);
  if (!report) return res.status(404).send("신고를 찾을 수 없습니다.");
  report.status = status;
  report.adminNote = note;
  report.reviewedAt = new Date().toISOString();
  db.moderationActions.push({ id: uuidv4(), type: `report_${status}`, reportId, note, createdAt: report.reviewedAt });
  writeDb(db);
  res.json({ success: true, report });
});

app.post("/admin/users/:userId/sanction", requireAdmin, (req, res) => {
  const db = req.db;
  const userId = Number(req.params.userId);
  const level = String(req.body.level || "suspend_3d");
  if (!["warning", "suspend_3d", "suspend_7d", "ban"].includes(level)) return res.status(400).send("지원하지 않는 제재입니다.");
  const reason = String(req.body.reason || "커뮤니티 가이드 위반").trim().slice(0, 160);
  const sanction = applyUserSanction(db, userId, level, reason, "admin");
  if (!sanction) return res.status(404).send("사용자를 찾을 수 없습니다.");
  writeDb(db);
  res.json({ success: true, sanction, user: publicReportUser(db, userId) });
});

app.post("/admin/users/:userId/suspend", requireAdmin, (req, res) => {
  const db = req.db;
  const userId = Number(req.params.userId);
  const reason = String(req.body.reason || "신고 누적 및 커뮤니티 가이드 위반").trim().slice(0, 160);
  const sanction = applyUserSanction(db, userId, "suspend_3d", reason, "admin");
  if (!sanction) return res.status(404).send("사용자를 찾을 수 없습니다.");
  writeDb(db);
  res.json({ success: true, sanction, user: publicReportUser(db, userId) });
});

app.post("/admin/users/:userId/unsuspend", requireAdmin, (req, res) => {
  const db = req.db;
  const userId = Number(req.params.userId);
  const user = clearUserSanction(db, userId, String(req.body.reason || "관리자 해제").trim().slice(0, 160));
  if (!user) return res.status(404).send("사용자를 찾을 수 없습니다.");
  writeDb(db);
  res.json({ success: true, user: publicReportUser(db, userId) });
});

app.post("/admin/moments/:id/hide", requireAdmin, (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  const moment = (db.moments || []).find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  moment.hiddenByReports = true;
  moment.moderationReason = String(req.body.reason || "관리자 숨김").trim().slice(0, 120);
  db.moderationActions.push({ id: uuidv4(), type: "hide_moment", momentId: moment.id, reason: moment.moderationReason, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, momentId: moment.id });
});

app.delete("/admin/moments/:id", requireAdmin, async (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  const moment = (db.moments || []).find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  const removedCommentIds = new Set((db.momentComments || []).filter((c) => c.momentId === moment.id).map((c) => c.id));
  await removeStorageObjects(mediaStoragePaths(moment.media || []));
  db.moments = (db.moments || []).filter((m) => m.id !== moment.id);
  db.momentLikes = (db.momentLikes || []).filter((l) => l.momentId !== moment.id);
  db.momentComments = (db.momentComments || []).filter((c) => c.momentId !== moment.id);
  db.momentReports = (db.momentReports || []).filter((r) => r.momentId !== moment.id);
  db.commentReports = (db.commentReports || []).filter((r) => !removedCommentIds.has(r.commentId));
  db.moderationActions.push({ id: uuidv4(), type: "delete_moment", momentId: moment.id, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true });
});

app.delete("/admin/comments/:commentId", requireAdmin, (req, res) => {
  const db = req.db;
  ensureModerationCollections(db);
  const commentId = req.params.commentId;
  const comment = (db.momentComments || []).find((c) => c.id === commentId);
  if (!comment) return res.status(404).send("댓글을 찾을 수 없습니다.");
  db.momentComments = (db.momentComments || []).filter((c) => c.id !== commentId);
  db.commentReports = (db.commentReports || []).filter((r) => r.commentId !== commentId);
  db.moderationActions.push({ id: uuidv4(), type: "delete_comment", commentId, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true });
});

app.get("/health", (req, res) => res.json({ ok: true, mode: "fake-call", minCallSecondsForRating: MIN_CALL_SECONDS_FOR_RATING, rematchBlockHours: REMATCH_BLOCK_MS / 60 / 60 / 1000 }));

app.post("/account-deletion-requests", (req, res) => {
  const nickname = String(req.body.nickname || "").trim().slice(0, 40);
  const contact = String(req.body.contact || "").trim().slice(0, 120);
  const reason = String(req.body.reason || "").trim().slice(0, 300);
  if (!nickname || !contact) return res.status(400).send("닉네임과 연락처를 입력해주세요.");
  const db = readDb();
  db.deletionRequests = db.deletionRequests || [];
  const user = (db.users || []).find((u) => u.nickname === nickname);
  db.deletionRequests.push({ id: uuidv4(), userId: user?.id || null, nickname, contact, reason, status: "received", createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, message: "삭제 요청이 접수되었습니다. 앱 안에서 로그인 가능한 경우 프로필 > 회원 탈퇴를 이용하면 즉시 삭제됩니다." });
});

app.post("/auth/nickname", (req, res) => {
  const nickname = moderateText(req.body.nickname, "닉네임").slice(0, 16);
  const inviteCode = String(req.body.inviteCode || "").trim().toUpperCase();
  const profile = sanitizeProfile(req.body.profile || {});
  if (!nickname) return res.status(400).send("닉네임이 필요합니다.");
  if (!/^[가-힣a-zA-Z0-9_\-\s]{2,16}$/.test(nickname)) return res.status(400).send("닉네임은 2~16자, 한글/영문/숫자만 가능합니다.");

  const db = readDb();
  let user = db.users.find((u) => u.nickname === nickname);
  if (!user) {
    user = normalizeUser({
      id: db.users.length ? Math.max(...db.users.map((u) => u.id)) + 1 : 1,
      nickname,
      temp: 36,
      weeklyTemp: 0,
      token: uuidv4(),
      coins: STARTING_COINS,
      ownedEmoticonPacks: [],
      profile
    });
    db.users.push(user);
  } else {
    user.profile = sanitizeProfile({ ...(user.profile || {}), ...profile });
    normalizeUser(user);
  }
  let inviteResult = null;
  if (inviteCode && !user.referredBy) {
    inviteResult = applyInviteReward(db, user, inviteCode);
  }
  writeDb(db);
  res.json({ ...sessionUser(user), inviteResult });
});

app.get("/me", requireAuth, (req, res) => {
  res.json(sessionUser(req.user));
});

app.put("/me/profile", requireAuth, (req, res) => {
  const db = req.db;
  req.user.profile = sanitizeProfile(req.body.profile || {});
  writeDb(db);
  res.json({ success: true, user: sessionUser(req.user) });
});

app.delete("/me", requireAuth, async (req, res) => {
  const db = req.db;
  const userId = req.user.id;
  await deleteUserEverywhere(db, userId);
  writeDb(db);
  res.json({ success: true, message: "회원 탈퇴가 완료되었습니다. 모든 개인 데이터가 즉시 삭제되었습니다." });
});

app.get("/blocks", requireAuth, (req, res) => {
  const db = req.db;
  const blocks = (db.blocks || [])
    .filter((b) => b.blockerId === req.user.id)
    .map((b) => {
      const user = db.users.find((u) => u.id === b.blockedUserId);
      return user ? { ...publicUser(user), blockedAt: b.createdAt } : null;
    })
    .filter(Boolean);
  res.json({ blocks });
});

app.post("/blocks/:userId", requireAuth, (req, res) => {
  const db = req.db;
  const targetId = Number(req.params.userId);
  if (!Number.isFinite(targetId)) return res.status(400).send("차단할 사용자를 찾을 수 없습니다.");
  if (targetId === req.user.id) return res.status(400).send("본인은 차단할 수 없습니다.");
  const target = db.users.find((u) => u.id === targetId);
  if (!target) return res.status(404).send("차단할 사용자를 찾을 수 없습니다.");
  db.blocks = db.blocks || [];
  if (!blockedByMe(db, req.user.id, targetId)) {
    db.blocks.push({ id: uuidv4(), blockerId: req.user.id, blockedUserId: targetId, createdAt: new Date().toISOString() });
  }
  db.friends = (db.friends || []).filter((f) => !isSamePair({ a: f.a, b: f.b }, req.user.id, targetId));
  writeDb(db);
  res.json({ success: true, message: "차단되었습니다. 서로의 모멘츠, 댓글, 지역 친구 추천, 랜덤 연결에서 최대한 제외됩니다." });
});

app.delete("/blocks/:userId", requireAuth, (req, res) => {
  const db = req.db;
  const targetId = Number(req.params.userId);
  db.blocks = (db.blocks || []).filter((b) => !(b.blockerId === req.user.id && b.blockedUserId === targetId));
  writeDb(db);
  res.json({ success: true });
});


app.get("/friends/regional", requireAuth, (req, res) => {
  const db = req.db;
  const myRegion = sanitizeRegion(req.user.profile?.region);
  if (!myRegion || myRegion === "지역 선택 안 함") {
    return res.json({ region: myRegion, users: [], message: "프로필에서 넓은 지역을 먼저 선택해주세요." });
  }
  const candidates = db.users
    .filter((u) => u.id !== req.user.id)
    .filter((u) => sanitizeProfileVisibility(u.profile?.profileVisibility) === "public")
    .filter((u) => sanitizeRegion(u.profile?.region) === myRegion)
    .filter((u) => !isBlocked(db, req.user.id, u.id))
    .filter((u) => !areFriends(db, req.user.id, u.id));
  if (candidates.length < 5) {
    return res.json({ region: myRegion, users: [], message: "같은 지역 후보가 5명 이상일 때만 표시됩니다. 소수 유저 추정을 막기 위한 안전장치예요." });
  }
  const users = candidates
    .map((u) => ({ u, random: Math.random() }))
    .sort((a, b) => a.random - b.random)
    .slice(0, 20)
    .map(({ u }) => publicUser(u));
  res.json({ region: myRegion, users });
});

app.get("/shop/products", (req, res) => {
  res.json({ products: EMOTICON_PRODUCTS });
});

app.get("/shop/me", requireAuth, (req, res) => {
  res.json({ user: sessionUser(req.user), ownedEmoticons: getOwnedEmoticons(req.user) });
});

app.post("/shop/purchase", requireAuth, (req, res) => {
  const db = req.db;
  const me = req.user;
  const productId = String(req.body.productId || "");
  const product = EMOTICON_PRODUCTS.find((p) => p.id === productId);
  if (!product) return res.status(404).send("상품을 찾을 수 없습니다.");
  if (me.ownedEmoticonPacks.includes(product.id)) return res.status(400).send("이미 구매한 이모티콘입니다.");
  if (me.coins < product.price) return res.status(400).send("코인이 부족합니다.");

  me.coins -= product.price;
  me.ownedEmoticonPacks.push(product.id);
  writeDb(db);
  res.json({ success: true, user: sessionUser(me), ownedEmoticons: getOwnedEmoticons(me), product });
});

app.post("/match/random", requireAuth, (req, res) => {
  const db = req.db;
  const me = req.user;

  const activeCall = db.calls.find((c) => c.participants.includes(me.id) && ["ringing", "connected"].includes(c.status));
  if (activeCall) return res.status(409).send("이미 진행 중인 대화가 있습니다.");

  cleanupOldMatches(db);

  let candidates = db.users.filter((u) => u.id !== me.id && u.id !== 9999 && !isBlocked(db, me.id, u.id) && !isRematchBlocked(db, me.id, u.id));
  if (candidates.length === 0) {
    const existingBot = db.users.find((u) => u.id === 9999);
    if (existingBot && !isBlocked(db, me.id, existingBot.id) && !isRematchBlocked(db, me.id, existingBot.id)) {
      candidates = [existingBot];
    } else if (!existingBot) {
      const bot = normalizeUser({ id: 9999, nickname: "랜덤친구", temp: 36, weeklyTemp: 0, token: `bot-${uuidv4()}`, coins: 0, ownedEmoticonPacks: [] });
      db.users.push(bot);
      candidates = [bot];
    }
  }

  if (candidates.length === 0) {
    return res.status(409).send("최근 2시간 안에 만난 상대만 있어요. 잠시 후 다시 시도해주세요.");
  }

  const opponent = candidates[Math.floor(Math.random() * candidates.length)];
  const call = {
    id: uuidv4(),
    participants: [me.id, opponent.id],
    status: "ringing",
    startedAt: null,
    endedAt: null,
    endedBy: null,
    mode: "fake",
    createdAt: new Date().toISOString()
  };
  db.calls.push(call);
  recordMatch(db, me.id, opponent.id, call.id);
  writeDb(db);

  res.json({ callId: call.id, me: sessionUser(me), opponent: publicUser(opponent), status: "matched", mode: call.mode });
});

app.post("/calls/:id/accept", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (!call.participants.includes(req.user.id)) return res.status(403).send("내 대화만 받을 수 있습니다.");
  if (call.status !== "ringing") return res.status(400).send("받을 수 없는 대화 상태입니다.");

  call.status = "connected";
  call.startedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true, call });
});

app.post("/calls/:id/reject", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (!call.participants.includes(req.user.id)) return res.status(403).send("내 대화만 거절할 수 있습니다.");
  if (call.status !== "ringing") return res.status(400).send("거절할 수 없는 대화 상태입니다.");

  call.status = "rejected";
  call.endedAt = new Date().toISOString();
  call.endedBy = req.user.id;
  writeDb(db);
  res.json({ success: true });
});

app.post("/calls/:id/end", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (!call.participants.includes(req.user.id)) return res.status(403).send("내 대화만 종료할 수 있습니다.");
  if (!["connected", "ringing"].includes(call.status)) return res.status(400).send("종료할 수 없는 대화 상태입니다.");

  call.status = "ended";
  call.endedAt = new Date().toISOString();
  call.endedBy = req.user.id;
  writeDb(db);
  res.json({ success: true, durationSeconds: callDurationSeconds(call), canRate: callDurationSeconds(call) >= MIN_CALL_SECONDS_FOR_RATING });
});

app.post("/calls/:id/opponent-left-demo", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (!call.participants.includes(req.user.id)) return res.status(403).send("내 대화만 처리할 수 있습니다.");
  if (call.status !== "connected") return res.status(400).send("연결된 대화만 종료할 수 있습니다.");

  const opponentId = call.participants.find((id) => id !== req.user.id) || null;
  call.status = "ended";
  call.endedAt = new Date().toISOString();
  call.endedBy = opponentId;
  writeDb(db);
  res.json({ success: true, durationSeconds: callDurationSeconds(call), canRate: callDurationSeconds(call) >= MIN_CALL_SECONDS_FOR_RATING });
});

app.post("/calls/:id/messages", requireAuth, (req, res) => {
  const db = req.db;
  const me = req.user;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (call.status !== "connected") return res.status(400).send("연결된 대화에서만 메시지를 보낼 수 있습니다.");
  if (!call.participants.includes(me.id)) return res.status(403).send("대화 참여자가 아닙니다.");

  const type = req.body.type === "emoticon" ? "emoticon" : "text";
  const content = type === "text" ? moderateText(req.body.content, "채팅").slice(0, 120) : String(req.body.content || "").trim().slice(0, 120);
  if (!content) return res.status(400).send("메시지 내용이 필요합니다.");
  if (type === "emoticon" && !getOwnedEmoticonIds(me).includes(content)) {
    return res.status(403).send("구매한 이모티콘만 사용할 수 있습니다.");
  }

  const message = { id: uuidv4(), callId: call.id, senderId: me.id, senderNickname: me.nickname, type, content, createdAt: new Date().toISOString() };
  db.messages.push(message);
  writeDb(db);
  res.json({ success: true, message });
});

app.get("/calls/:id/messages", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (!call.participants.includes(req.user.id)) return res.status(403).send("대화 참여자가 아닙니다.");
  res.json({ messages: db.messages.filter((m) => m.callId === call.id) });
});

app.post("/calls/:id/rate", requireAuth, (req, res) => {
  const db = req.db;
  const call = db.calls.find((c) => c.id === req.params.id);
  if (!call) return res.status(404).send("대화를 찾을 수 없습니다.");
  if (call.status !== "ended") return res.status(400).send("종료된 대화만 평가할 수 있습니다.");

  const raterId = req.user.id;
  const ratedUserId = Number(req.body.ratedUserId);
  const score = Math.max(1, Math.min(5, Number(req.body.score || 5)));

  if (raterId === ratedUserId) return res.status(400).send("자기 자신은 평가할 수 없습니다.");
  if (!call.participants.includes(raterId) || !call.participants.includes(ratedUserId)) {
    return res.status(403).send("대화에 참여한 상대만 평가할 수 있습니다.");
  }

  const durationSeconds = callDurationSeconds(call);
  if (durationSeconds < MIN_CALL_SECONDS_FOR_RATING) {
    return res.status(400).send(`최소 ${MIN_CALL_SECONDS_FOR_RATING}초 이상 대화해야 평가할 수 있습니다.`);
  }

  if (db.ratings.some((r) => r.callId === call.id && r.raterId === raterId)) {
    return res.status(400).send("이미 평가한 대화입니다.");
  }

  const ratedUser = db.users.find((u) => u.id === ratedUserId);
  if (!ratedUser) return res.status(404).send("평가 대상 사용자를 찾을 수 없습니다.");

  const currentTemp = Number(ratedUser.temp || 36);
  const base = Math.floor(Math.random() * 6) + 5;
  const highTempPenalty = currentTemp >= 1000 ? 0.25 : currentTemp >= 500 ? 0.4 : currentTemp >= 200 ? 0.6 : 1;
  let addedTemp = Math.max(1, Math.round(base * (score / 5) * highTempPenalty));
  let decreasedTemp = 0;
  if (score <= 2) {
    addedTemp = 0;
    decreasedTemp = score === 1 ? 3 : 1;
    decreaseTemperature(db, ratedUser, decreasedTemp, `낮은 대화 평가 ${score}점`, call.id);
  } else {
    ratedUser.temp = Math.min(10000, currentTemp + addedTemp);
    ratedUser.weeklyTemp = (ratedUser.weeklyTemp || 0) + addedTemp;
  }
  db.ratings.push({ id: uuidv4(), callId: call.id, raterId, ratedUserId, score, addedTemp, decreasedTemp, durationSeconds, createdAt: new Date().toISOString() });
  writeDb(db);

  res.json({ success: true, rater: sessionUser(req.user), ratedUser: publicUser(ratedUser), addedTemp, decreasedTemp, durationSeconds });
});

app.get("/missions", requireAuth, (req, res) => {
  const db = req.db;
  res.json({
    user: sessionUser(req.user),
    missions: buildMissionState(db, req.user.id),
    invite: {
      inviteCode: req.user.inviteCode,
      invitedCount: (req.user.invitedUsers || []).length,
      rewardCoins: INVITE_REWARD_COINS
    }
  });
});

app.post("/missions/claim", requireAuth, (req, res) => {
  const db = req.db;
  const missionId = String(req.body.missionId || "");
  const missions = buildMissionState(db, req.user.id);
  const mission = missions.find((m) => m.id === missionId);
  if (!mission) return res.status(404).send("미션을 찾을 수 없습니다.");
  if (!mission.completed) return res.status(400).send("아직 미션을 완료하지 않았습니다.");
  if (mission.claimed) return res.status(400).send("이미 보상을 받은 미션입니다.");

  req.user.coins = Number(req.user.coins || 0) + mission.rewardCoins;
  db.missionClaims.push({ id: uuidv4(), userId: req.user.id, missionId: mission.id, dateKey: mission.dateKey, rewardCoins: mission.rewardCoins, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, user: sessionUser(req.user), missions: buildMissionState(db, req.user.id), rewardCoins: mission.rewardCoins });
});

app.post("/invite/apply", requireAuth, (req, res) => {
  const db = req.db;
  const result = applyInviteReward(db, req.user, req.body.inviteCode);
  if (!result.applied) return res.status(400).send(result.message);
  writeDb(db);
  res.json({ success: true, ...result });
});



app.get("/moments", requireAuth, (req, res) => {
  const db = req.db;
  const limit = Math.max(1, Math.min(20, Number(req.query.limit || 10)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const onlyMine = String(req.query.mine || "") === "true";
  const visible = (db.moments || [])
    .filter((m) => onlyMine ? m.authorId === req.user.id : (canSeeMoment(db, req.user.id, m) && (!m.hiddenByReports || m.authorId === req.user.id)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = visible.slice(offset, offset + limit);
  res.json({ moments: page.map((m) => publicMoment(db, m, req.user.id)), hasMore: offset + limit < visible.length, nextOffset: offset + page.length });
});

app.post("/moments", requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const todayCount = (db.moments || []).filter((m) => m.authorId === req.user.id && isTodayIso(m.createdAt)).length;
    if (todayCount >= 3) return res.status(400).send("모멘츠는 하루 최대 3개까지 올릴 수 있습니다.");
    const text = moderateText(req.body.text, "모멘츠").slice(0, 500);
    const mood = moderateText(req.body.mood || "오늘", "기분").slice(0, 20);
    const musicUrl = sanitizeYouTubeUrl(req.body.musicUrl);
    if (musicUrl === null) return res.status(400).send("음악 링크는 YouTube 링크만 입력할 수 있습니다.");
    const visibility = req.body.visibility === "friends" ? "friends" : "public";
    const { newImages, storedImages } = splitNewAndStoredMedia(req.body.media);
    const uploadedMedia = await uploadMomentImages({ userId: req.user.id, images: newImages });
    const media = [...storedImages, ...uploadedMedia].slice(0, 5);
    const legacyPhotoUrl = String(req.body.photoUrl || "").trim().slice(0, 500);
    if (legacyPhotoUrl && /^https?:\/\//.test(legacyPhotoUrl)) media.unshift({ url: legacyPhotoUrl, type: "image", name: "사진 링크" });
    if (!text && media.length === 0 && !musicUrl) return res.status(400).send("글, 사진, 음악 링크 중 하나는 필요합니다.");
    const moment = { id: uuidv4(), authorId: req.user.id, mood, text, media, musicUrl, visibility, hiddenByReports: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.moments.push(moment);
    writeDb(db);
    res.json({ success: true, moment: publicMoment(db, moment, req.user.id) });
  } catch (error) {
    res.status(400).send(error.message || "모멘츠 사진 업로드에 실패했습니다.");
  }
});

app.put("/moments/:id", requireAuth, async (req, res) => {
  const db = req.db;
  try {
    const moment = db.moments.find((m) => m.id === req.params.id);
    if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
    if (moment.authorId !== req.user.id) return res.status(403).send("본인이 작성한 모멘츠만 수정할 수 있습니다.");
    const text = moderateText(req.body.text, "모멘츠").slice(0, 500);
    const mood = moderateText(req.body.mood || moment.mood || "오늘", "기분").slice(0, 20);
    const musicUrl = sanitizeYouTubeUrl(req.body.musicUrl);
    if (musicUrl === null) return res.status(400).send("음악 링크는 YouTube 링크만 입력할 수 있습니다.");
    const visibility = req.body.visibility === "friends" ? "friends" : "public";
    const previousPaths = mediaStoragePaths(moment.media || []);
    const { newImages, storedImages } = splitNewAndStoredMedia(Array.isArray(req.body.media) ? req.body.media : moment.media || []);
    const uploadedMedia = await uploadMomentImages({ userId: req.user.id, images: newImages });
    const nextMedia = [...storedImages, ...uploadedMedia].slice(0, 5);
    if (!text && nextMedia.length === 0 && !musicUrl) return res.status(400).send("글, 사진, 음악 링크 중 하나는 필요합니다.");
    const nextPaths = new Set(mediaStoragePaths(nextMedia));
    await removeStorageObjects(previousPaths.filter((p) => !nextPaths.has(p)));
    moment.text = text;
    moment.mood = mood;
    moment.musicUrl = musicUrl;
    moment.visibility = visibility;
    moment.media = nextMedia;
    delete moment.photoUrl;
    moment.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json({ success: true, moment: publicMoment(db, moment, req.user.id) });
  } catch (error) {
    res.status(400).send(error.message || "모멘츠 사진 수정에 실패했습니다.");
  }
});

app.delete("/moments/:id", requireAuth, async (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  if (moment.authorId !== req.user.id) return res.status(403).send("본인이 작성한 모멘츠만 삭제할 수 있습니다.");
  const removedCommentIds = new Set((db.momentComments || []).filter((c) => c.momentId === moment.id).map((c) => c.id));
  await removeStorageObjects(mediaStoragePaths(moment.media || []));
  db.moments = db.moments.filter((m) => m.id !== moment.id);
  db.momentLikes = (db.momentLikes || []).filter((l) => l.momentId !== moment.id);
  db.momentComments = (db.momentComments || []).filter((c) => c.momentId !== moment.id);
  db.momentReports = (db.momentReports || []).filter((r) => r.momentId !== moment.id);
  db.commentReports = (db.commentReports || []).filter((r) => !removedCommentIds.has(r.commentId));
  writeDb(db);
  res.json({ success: true });
});

app.post("/moments/:id/report", requireAuth, (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  if (moment.authorId === req.user.id) return res.status(400).send("본인 모멘츠는 신고할 수 없습니다.");
  if (!canSeeMoment(db, req.user.id, moment)) return res.status(403).send("볼 수 없는 모멘츠입니다.");
  if ((db.momentReports || []).some((r) => r.momentId === moment.id && r.reporterId === req.user.id)) {
    return res.status(400).send("이미 신고한 모멘츠입니다.");
  }
  const reason = String(req.body.reason || "기타").trim().slice(0, 80);
  ensureModerationCollections(db);
  const report = { id: uuidv4(), momentId: moment.id, reporterId: req.user.id, targetUserId: moment.authorId, reason, status: "pending", createdAt: new Date().toISOString() };
  db.momentReports.push(report);
  const reports = db.momentReports.filter((r) => r.momentId === moment.id);
  let decreasedTemp = 0;
  if (reports.length >= 3) moment.hiddenByReports = true;
  if (reports.length === 5) {
    const target = db.users.find((u) => u.id === moment.authorId);
    if (target) decreasedTemp = decreaseTemperature(db, target, 5, "모멘츠 신고 5회 누적", moment.id);
  }
  const autoModeration = applyAutoSanctionFromReports(db, moment.authorId, "모멘츠 신고 누적");
  writeDb(db);
  res.json({ success: true, report, reportCount: reports.length, totalTargetReports: autoModeration.totalReports, hiddenByReports: Boolean(moment.hiddenByReports), decreasedTemp, autoSanction: autoModeration.sanction });
});

app.post("/moments/:id/like", requireAuth, (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  if (!canSeeMoment(db, req.user.id, moment)) return res.status(403).send("볼 수 없는 모멘츠입니다.");
  if (isBlocked(db, req.user.id, moment.authorId)) return res.status(403).send("차단 관계에서는 반응할 수 없습니다.");
  const existingIndex = db.momentLikes.findIndex((l) => l.momentId === moment.id && l.userId === req.user.id);
  if (existingIndex >= 0) db.momentLikes.splice(existingIndex, 1);
  else db.momentLikes.push({ id: uuidv4(), momentId: moment.id, userId: req.user.id, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, moment: publicMoment(db, moment, req.user.id) });
});

app.post("/moments/:id/comments", requireAuth, (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.id);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  if (!canSeeMoment(db, req.user.id, moment)) return res.status(403).send("댓글을 달 수 없는 모멘츠입니다.");
  if (isBlocked(db, req.user.id, moment.authorId)) return res.status(403).send("차단 관계에서는 댓글을 달 수 없습니다.");
  const text = moderateText(req.body.text, "댓글").slice(0, 160);
  if (!text) return res.status(400).send("댓글 내용을 입력해주세요.");
  db.momentComments.push({ id: uuidv4(), momentId: moment.id, userId: req.user.id, text, hiddenByReports: false, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, moment: publicMoment(db, moment, req.user.id) });
});

app.post("/moments/:momentId/comments/:commentId/report", requireAuth, (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.momentId);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  if (!canSeeMoment(db, req.user.id, moment)) return res.status(403).send("볼 수 없는 모멘츠입니다.");
  const comment = db.momentComments.find((c) => c.id === req.params.commentId && c.momentId === moment.id);
  if (!comment) return res.status(404).send("댓글을 찾을 수 없습니다.");
  if (comment.userId === req.user.id) return res.status(400).send("본인 댓글은 신고할 수 없습니다. 삭제 기능을 이용해주세요.");
  if ((db.commentReports || []).some((r) => r.commentId === comment.id && r.reporterId === req.user.id)) {
    return res.status(400).send("이미 신고한 댓글입니다.");
  }
  const reason = String(req.body.reason || "기타").trim().slice(0, 80);
  ensureModerationCollections(db);
  const report = { id: uuidv4(), momentId: moment.id, commentId: comment.id, reporterId: req.user.id, targetUserId: comment.userId, reason, status: "pending", createdAt: new Date().toISOString() };
  db.commentReports.push(report);
  const reports = db.commentReports.filter((r) => r.commentId === comment.id);
  let decreasedTemp = 0;
  if (reports.length >= 3) comment.hiddenByReports = true;
  if (reports.length === 5) {
    const target = db.users.find((u) => u.id === comment.userId);
    if (target) decreasedTemp = decreaseTemperature(db, target, 3, "댓글 신고 5회 누적", comment.id);
  }
  const autoModeration = applyAutoSanctionFromReports(db, comment.userId, "댓글 신고 누적");
  writeDb(db);
  res.json({ success: true, report, reportCount: reports.length, totalTargetReports: autoModeration.totalReports, hiddenByReports: Boolean(comment.hiddenByReports), decreasedTemp, autoSanction: autoModeration.sanction, moment: publicMoment(db, moment, req.user.id) });
});

app.delete("/moments/:momentId/comments/:commentId", requireAuth, (req, res) => {
  const db = req.db;
  const moment = db.moments.find((m) => m.id === req.params.momentId);
  if (!moment) return res.status(404).send("모멘츠를 찾을 수 없습니다.");
  const commentIndex = db.momentComments.findIndex((c) => c.id === req.params.commentId && c.momentId === moment.id);
  if (commentIndex < 0) return res.status(404).send("댓글을 찾을 수 없습니다.");
  if (db.momentComments[commentIndex].userId !== req.user.id) return res.status(403).send("본인이 작성한 댓글만 삭제할 수 있습니다.");
  const removed = db.momentComments.splice(commentIndex, 1)[0];
  db.commentReports = (db.commentReports || []).filter((r) => r.commentId !== removed.id);
  writeDb(db);
  res.json({ success: true, moment: publicMoment(db, moment, req.user.id) });
});

app.get("/letters", requireAuth, (req, res) => {
  const db = req.db;
  const letters = (db.letters || [])
    .filter((l) => l.senderId === req.user.id || l.recipientId === req.user.id)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .map((l) => publicLetter(db, l, req.user.id));
  res.json({ letters });
});

app.post("/letters/random", requireAuth, (req, res) => {
  const db = req.db;
  const title = moderateText(req.body.title || "", "한마디 제목").slice(0, 40);
  const content = moderateText(req.body.content || "", "한마디").slice(0, 700);
  const tag = moderateText(req.body.tag || "랜덤", "태그").slice(0, 20);
  if (!content) return res.status(400).send("한마디 내용을 입력해주세요.");
  const recentTargets = new Set((db.letters || [])
    .filter((l) => l.senderId === req.user.id && Date.now() - new Date(l.createdAt).getTime() < 24 * 60 * 60 * 1000)
    .map((l) => l.recipientId));
  let candidates = db.users.filter((u) => u.id !== req.user.id && u.id !== 9999 && !recentTargets.has(u.id) && !isBlocked(db, req.user.id, u.id));
  if (candidates.length === 0) candidates = db.users.filter((u) => u.id !== req.user.id && u.id !== 9999 && !isBlocked(db, req.user.id, u.id));
  if (candidates.length === 0) return res.status(400).send("한마디를 받을 상대가 아직 없습니다.");
  const recipient = candidates[Math.floor(Math.random() * candidates.length)];
  const now = new Date().toISOString();
  const letter = { id: uuidv4(), senderId: req.user.id, recipientId: recipient.id, title: title || "동네친구 익명 한마디", content, tag, replies: [], interests: [], friendRequested: false, createdAt: now, updatedAt: now };
  db.letters.push(letter);
  writeDb(db);
  res.json({ success: true, letter: publicLetter(db, letter, req.user.id), recipient: publicUser(recipient) });
});

app.post("/letters/:id/reply", requireAuth, (req, res) => {
  const db = req.db;
  const letter = db.letters.find((l) => l.id === req.params.id);
  if (!letter) return res.status(404).send("한마디를 찾을 수 없습니다.");
  if (![letter.senderId, letter.recipientId].includes(req.user.id)) return res.status(403).send("내 한마디에만 답장할 수 있습니다.");
  const content = moderateText(req.body.content || "", "답장").slice(0, 700);
  if (!content) return res.status(400).send("답장 내용을 입력해주세요.");
  letter.replies = letter.replies || [];
  letter.replies.push({ id: uuidv4(), senderId: req.user.id, content, createdAt: new Date().toISOString() });
  letter.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true, letter: publicLetter(db, letter, req.user.id) });
});

app.post("/letters/:id/interest", requireAuth, (req, res) => {
  const db = req.db;
  const letter = db.letters.find((l) => l.id === req.params.id);
  if (!letter) return res.status(404).send("한마디를 찾을 수 없습니다.");
  if (![letter.senderId, letter.recipientId].includes(req.user.id)) return res.status(403).send("내 한마디에만 공감을 표시할 수 있습니다.");
  letter.interests = letter.interests || [];
  if (!letter.interests.includes(req.user.id)) letter.interests.push(req.user.id);
  letter.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true, letter: publicLetter(db, letter, req.user.id) });
});

app.post("/letters/:id/friend-request", requireAuth, (req, res) => {
  const db = req.db;
  const letter = db.letters.find((l) => l.id === req.params.id);
  if (!letter) return res.status(404).send("한마디를 찾을 수 없습니다.");
  if (![letter.senderId, letter.recipientId].includes(req.user.id)) return res.status(403).send("내 한마디에서만 친구 연결할 수 있습니다.");
  const mutual = (letter.interests || []).includes(letter.senderId) && (letter.interests || []).includes(letter.recipientId);
  if (!mutual) return res.status(400).send("서로 공감해요를 누른 후 친구가 될 수 있습니다.");
  const created = makeFriends(db, letter.senderId, letter.recipientId);
  letter.friendRequested = true;
  letter.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true, friend: created, letter: publicLetter(db, letter, req.user.id), message: created ? "친구로 연결되었습니다." : "이미 친구입니다." });
});

app.get("/friends", requireAuth, (req, res) => {
  const db = req.db;
  const me = req.user;
  const friends = (db.friends || [])
    .filter((f) => f.a === me.id || f.b === me.id)
    .map((f) => {
      const friendId = f.a === me.id ? f.b : f.a;
      const user = db.users.find((u) => u.id === friendId);
      if (!user || isBlocked(db, me.id, user.id)) return null;
      return { ...publicUser(user), since: f.createdAt };
    })
    .filter(Boolean);
  res.json({ friends });
});

app.get("/ranking", (req, res) => {
  const db = readDb();
  res.json(db.users.filter((u) => u.id !== 9999).map(publicUser).sort((a, b) => b.temp - a.temp));
});


app.use((error, req, res, next) => {
  const statusCode = Number(error.statusCode || error.status || 500);
  if (statusCode >= 500) console.error(error);
  res.status(statusCode).send(error.message || "요청 처리 중 오류가 발생했습니다.");
});

appStore.init().then(() => {
  app.listen(PORT, () => console.log(`server on http://localhost:${PORT}`));
}).catch((error) => {
  console.error("Supabase 저장소 초기화 실패:", error);
  process.exit(1);
});
