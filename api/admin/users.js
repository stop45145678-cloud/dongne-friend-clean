const { requireAdmin, methodOnly, readCollection } = require('./_firebaseAdmin');

module.exports = async function handler(req, res) {
  if (!methodOnly(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const profiles = await readCollection('profiles', 100);
    let users = profiles.items;
    let source = 'profiles';

    if (profiles.connected && users.length === 0) {
      const legacyUsers = await readCollection('users', 100);
      users = legacyUsers.items;
      source = 'users';
    }

    return res.status(200).json({
      success: true,
      message: profiles.connected ? '유저 목록 불러오기 성공' : profiles.message,
      firebaseConnected: profiles.connected,
      source,
      users,
    });
  } catch (error) {
    return res.status(500).json({ error: '유저 목록 불러오기 실패', detail: error.message });
  }
};
