const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const STATE_ID = "dongne-friend-v2";
const TABLE_NAME = process.env.SUPABASE_STATE_TABLE || "app_state";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDbShape(db, normalizeUser) {
  const next = db && typeof db === "object" ? db : {};
  next.users = (next.users || []).map(normalizeUser);
  next.calls = next.calls || [];
  next.matches = next.matches || [];
  next.ratings = next.ratings || [];
  next.messages = next.messages || [];
  next.missionClaims = next.missionClaims || [];
  next.inviteRewards = next.inviteRewards || [];
  next.swipes = next.swipes || [];
  next.friends = next.friends || [];
  next.moments = next.moments || [];
  next.momentLikes = next.momentLikes || [];
  next.momentComments = next.momentComments || [];
  next.momentReports = next.momentReports || [];
  next.commentReports = next.commentReports || [];
  next.blocks = next.blocks || [];
  next.deletionRequests = next.deletionRequests || [];
  next.temperatureEvents = next.temperatureEvents || [];
  next.letters = next.letters || [];
  return next;
}

function createFileFallback({ defaultDb, normalizeUser, dbPath }) {
  function readFileDb() {
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify(defaultDb(), null, 2));
    }
    return ensureDbShape(JSON.parse(fs.readFileSync(dbPath, "utf-8")), normalizeUser);
  }

  function writeFileDb(db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }

  return { readFileDb, writeFileDb };
}

function createAppStore({ defaultDb, normalizeUser, dbPath }) {
  const { readFileDb, writeFileDb } = createFileFallback({ defaultDb, normalizeUser, dbPath });
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const useSupabase = Boolean(supabaseUrl && serviceRoleKey);
  const supabase = useSupabase ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }) : null;
  let cache = null;
  let pendingWrite = Promise.resolve();

  async function init() {
    if (!useSupabase) {
      console.warn("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없어 로컬 JSON 저장소로 실행합니다. 출시 환경에서는 Supabase 환경변수를 설정하세요.");
      cache = readFileDb();
      return;
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("data")
      .eq("id", STATE_ID)
      .maybeSingle();

    if (error) throw error;

    if (data && data.data) {
      cache = ensureDbShape(data.data, normalizeUser);
      return;
    }

    cache = ensureDbShape(defaultDb(), normalizeUser);
    const { error: insertError } = await supabase
      .from(TABLE_NAME)
      .insert({ id: STATE_ID, data: cache });
    if (insertError) throw insertError;
  }

  function readDb() {
    if (!cache) cache = readFileDb();
    return deepClone(cache);
  }

  function writeDb(db) {
    cache = ensureDbShape(db, normalizeUser);
    if (!useSupabase) {
      writeFileDb(cache);
      return;
    }

    const snapshot = deepClone(cache);
    pendingWrite = pendingWrite
      .then(async () => {
        const { error } = await supabase
          .from(TABLE_NAME)
          .upsert({ id: STATE_ID, data: snapshot, updated_at: new Date().toISOString() });
        if (error) throw error;
      })
      .catch((error) => {
        console.error("Supabase 저장 실패:", error.message || error);
      });
  }

  return { init, readDb, writeDb };
}

module.exports = { createAppStore };
