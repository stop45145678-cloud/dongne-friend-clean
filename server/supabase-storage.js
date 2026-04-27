const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "moment-photos";

function getStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function parseDataImage(dataUrl) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("사진 형식은 JPG, PNG, WEBP만 가능합니다.");
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > 3 * 1024 * 1024) throw new Error("압축된 사진은 3MB 이하만 업로드할 수 있습니다.");
  return { buffer, mimeType, ext };
}

async function uploadMomentImages({ userId, images }) {
  const supabase = getStorageClient();
  if (!supabase) {
    throw new Error("Supabase Storage 환경변수가 없습니다. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정하세요.");
  }

  const items = Array.isArray(images) ? images.slice(0, 5) : [];
  if (!items.length) return [];

  const uploaded = [];
  for (const item of items) {
    const { buffer, mimeType, ext } = parseDataImage(item.dataUrl || item.url);
    const safeName = String(item.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
    const storagePath = `moments/${userId}/${new Date().toISOString().slice(0, 10)}/${uuidv4()}-${safeName || `photo.${ext}`}`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: mimeType,
      cacheControl: "31536000",
      upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    uploaded.push({ url: data.publicUrl, storagePath, type: "image", name: safeName || `photo.${ext}` });
  }
  return uploaded;
}

async function removeStorageObjects(paths = []) {
  const supabase = getStorageClient();
  const clean = [...new Set((paths || []).map((p) => String(p || "").trim()).filter(Boolean))];
  if (!supabase || !clean.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(clean);
  if (error) console.error("Supabase Storage 삭제 실패:", error.message || error);
}

module.exports = { uploadMomentImages, removeStorageObjects, BUCKET };
