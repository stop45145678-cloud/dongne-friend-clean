let adminApp = null;

async function getFirebaseAdmin() {
  try {
    const admin = await import("firebase-admin");

    if (!adminApp && !admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined;

      if (!projectId || !clientEmail || !privateKey) {
        return null;
      }

      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    return admin;
  } catch (error) {
    return null;
  }
}

export async function getDb() {
  const admin = await getFirebaseAdmin();
  if (!admin) return null;
  return admin.firestore();
}

export function requireAdmin(req, res) {
  const token = req.headers.authorization;

  if (!process.env.ADMIN_TOKEN) {
    res.status(500).json({ error: "Vercel 환경변수 ADMIN_TOKEN이 없습니다." });
    return false;
  }

  if (token !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ error: "관리자 권한 없음" });
    return false;
  }

  return true;
}

export function methodOnly(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.status(405).json({ error: "허용되지 않은 요청 방식입니다." });
    return false;
  }

  return true;
}

export async function readCollection(collectionName, limit = 100) {
  const db = await getDb();

  if (!db) {
    return {
      connected: false,
      items: [],
      message: "Firebase Admin 환경변수 미설정. 목록은 빈 배열로 표시됩니다.",
    };
  }

  const snap = await db.collection(collectionName).limit(limit).get();
  const items = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return {
    connected: true,
    items,
  };
}
