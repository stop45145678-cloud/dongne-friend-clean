import { requireAdmin, methodOnly, getDb } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (!methodOnly(req, res, ["POST"])) return;
  if (!requireAdmin(req, res)) return;

  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "userId가 필요합니다." });
  }

  try {
    const db = await getDb();

    if (!db) {
      return res.status(200).json({
        success: true,
        simulated: true,
        message: "Firebase 미연결 상태라 테스트 응답만 반환했습니다.",
        userId,
      });
    }

    await db.collection("users").doc(userId).set({
      banned: true,
      bannedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      message: "유저 정지 완료",
      userId,
    });
  } catch (error) {
    return res.status(500).json({
      error: "유저 정지 실패",
      detail: error.message,
    });
  }
}
