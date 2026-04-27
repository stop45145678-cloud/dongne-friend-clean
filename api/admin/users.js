export default function handler(req, res) {
  const token = req.headers.authorization;

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({
      error: "관리자 권한 없음",
    });
  }

  return res.status(200).json({
    success: true,
    message: "관리자 로그인 성공",
    users: [],
  });
}
