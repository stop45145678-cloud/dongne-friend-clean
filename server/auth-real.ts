import axios from "axios";
import crypto from "crypto";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Google 로그인 검증
 */
export async function verifyGoogleToken(idToken: string): Promise<{
  valid: boolean;
  googleId?: string;
  email?: string;
  name?: string;
  error?: string;
}> {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?id_token=${idToken}`
    );

    if (response.data.aud !== process.env.GOOGLE_CLIENT_ID) {
      return { valid: false, error: "Invalid client ID" };
    }

    return {
      valid: true,
      googleId: response.data.sub,
      email: response.data.email,
      name: response.data.name,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Token verification failed",
    };
  }
}

/**
 * Kakao 로그인 검증
 */
export async function verifyKakaoToken(accessToken: string): Promise<{
  valid: boolean;
  kakaoId?: string;
  email?: string;
  name?: string;
  error?: string;
}> {
  try {
    const response = await axios.get("https://kapi.kakao.com/v2/user/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return {
      valid: true,
      kakaoId: response.data.id.toString(),
      email: response.data.kakao_account?.email,
      name: response.data.kakao_account?.profile?.nickname,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Token verification failed",
    };
  }
}

/**
 * 전화번호 인증 (NiceID)
 */
export async function verifyPhoneNumber(
  phoneNumber: string,
  verificationCode: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // 실제 구현에서는 NiceID API 호출
  // 여기서는 간단한 검증만 수행
  if (!phoneNumber || !verificationCode) {
    return { valid: false, error: "Phone number and code required" };
  }

  // 코드 검증 (실제로는 DB에서 조회)
  // const stored = await getStoredVerificationCode(phoneNumber);
  // if (stored !== verificationCode) {
  //   return { valid: false, error: "Invalid verification code" };
  // }

  return { valid: true };
}

/**
 * 미성년자 확인
 */
export function isMinor(birthDate: Date): boolean {
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    return age - 1 < 18;
  }

  return age < 18;
}

/**
 * Google 로그인 또는 회원가입
 */
export async function loginWithGoogle(
  googleId: string,
  email: string,
  name: string
): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 기존 사용자 조회
    let user = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1);

    if (user.length > 0) {
      // 기존 사용자 로그인
      return { success: true, user: user[0] };
    }

    // 새 사용자 생성
    const nickname = `user_${crypto.randomBytes(4).toString("hex")}`;

    await db.insert(users).values({
      nickname,
      email,
      googleId,
      isVerified: true,
      lastLoginAt: new Date(),
    });

    user = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1);

    return { success: true, user: user[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
}

/**
 * Kakao 로그인 또는 회원가입
 */
export async function loginWithKakao(
  kakaoId: string,
  email: string,
  name: string
): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 기존 사용자 조회
    let user = await db
      .select()
      .from(users)
      .where(eq(users.kakaoId, kakaoId))
      .limit(1);

    if (user.length > 0) {
      // 기존 사용자 로그인
      return { success: true, user: user[0] };
    }

    // 새 사용자 생성
    const nickname = `user_${crypto.randomBytes(4).toString("hex")}`;

    await db.insert(users).values({
      nickname,
      email,
      kakaoId,
      isVerified: true,
      lastLoginAt: new Date(),
    });

    user = await db
      .select()
      .from(users)
      .where(eq(users.kakaoId, kakaoId))
      .limit(1);

    return { success: true, user: user[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
}

/**
 * 전화번호 인증 로그인
 */
export async function loginWithPhoneNumber(
  phoneNumber: string,
  birthDate: Date
): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 미성년자 확인
    if (isMinor(birthDate)) {
      return { success: false, error: "Users under 18 are not allowed" };
    }

    // 기존 사용자 조회
    let user = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    if (user.length > 0) {
      // 기존 사용자 로그인
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user[0].id));

      return { success: true, user: user[0] };
    }

    // 새 사용자 생성
    const nickname = `user_${crypto.randomBytes(4).toString("hex")}`;

    await db.insert(users).values({
      nickname,
      phoneNumber,
      birthDate,
      isVerified: true,
      lastLoginAt: new Date(),
    });

    user = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    return { success: true, user: user[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
}

/**
 * 세션 토큰 생성
 */
export function generateSessionToken(userId: number): string {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

/**
 * 세션 토큰 검증
 */
export async function verifySessionToken(
  userId: number,
  token: string
): Promise<boolean> {
  // 실제 구현에서는 Redis에서 토큰 조회
  // const stored = await redis.get(`session:${userId}`);
  // return stored === token;
  return true;
}

/**
 * 로그아웃
 */
export async function logout(userId: number): Promise<boolean> {
  // 실제 구현에서는 Redis에서 토큰 삭제
  // await redis.del(`session:${userId}`);
  return true;
}
