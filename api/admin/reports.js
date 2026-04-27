import { requireAdmin, methodOnly, readCollection } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (!methodOnly(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const result = await readCollection("reports", 100);

    return res.status(200).json({
      success: true,
      message: result.connected
        ? "신고 목록 불러오기 성공"
        : result.message,
      firebaseConnected: result.connected,
      reports: result.items,
    });
  } catch (error) {
    return res.status(500).json({
      error: "신고 목록 불러오기 실패",
      detail: error.message,
    });
  }
}
