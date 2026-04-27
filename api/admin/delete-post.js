import { requireAdmin, methodOnly, getDb } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (!methodOnly(req, res, ["POST"])) return;
  if (!requireAdmin(req, res)) return;

  const { postId } = req.body || {};

  if (!postId) {
    return res.status(400).json({ error: "postId가 필요합니다." });
  }

  try {
    const db = await getDb();

    if (!db) {
      return res.status(200).json({
        success: true,
        simulated: true,
        message: "Firebase 미연결 상태라 테스트 응답만 반환했습니다.",
        postId,
      });
    }

    await db.collection("posts").doc(postId).set({
      deleted: true,
      deletedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      message: "게시글 삭제 처리 완료",
      postId,
    });
  } catch (error) {
    return res.status(500).json({
      error: "게시글 삭제 실패",
      detail: error.message,
    });
  }
}
