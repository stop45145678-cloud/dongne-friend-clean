import { getDb } from "./db";
import { ratings, calls, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * 온도 조작 탐지
 */
export async function detectTemperatureManipulation(userId: number): Promise<{
  isSuspicious: boolean;
  reason?: string;
  riskScore: number;
}> {
  const db = await getDb();
  if (!db) {
    return { isSuspicious: false, riskScore: 0 };
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 최근 24시간 평가 조회
    const recentRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.ratedUserId, userId));

    const ratingsLast24h = recentRatings.filter(
      (r) => r.createdAt && r.createdAt > oneDayAgo
    );

    let riskScore = 0;
    const reasons: string[] = [];

    // 1. 비정상적으로 많은 평가 (1시간에 10개 이상)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const ratingsLastHour = ratingsLast24h.filter(
      (r) => r.createdAt && r.createdAt > oneHourAgo
    );

    if (ratingsLastHour.length > 10) {
      riskScore += 40;
      reasons.push("Excessive ratings in 1 hour");
    }

    // 2. 모두 높은 점수 (5점만 계속)
    const allFiveStars = ratingsLast24h.every((r) => r.score === 5);
    if (ratingsLast24h.length > 5 && allFiveStars) {
      riskScore += 35;
      reasons.push("All 5-star ratings");
    }

    // 3. 같은 사람에게 여러 번 평가받음
    const raterCounts: Record<number, number> = {};
    ratingsLast24h.forEach((r) => {
      raterCounts[r.raterId] = (raterCounts[r.raterId] || 0) + 1;
    });

    const duplicateRaters = Object.values(raterCounts).filter((count) => count > 1);
    if (duplicateRaters.length > 0) {
      riskScore += 30;
      reasons.push("Duplicate raters detected");
    }

    // 4. 비정상적으로 큰 온도 상승 (1시간에 50도 이상)
    const totalTempLastHour = ratingsLastHour.reduce(
      (sum, r) => sum + (parseFloat(r.addedTemperature?.toString() || "0")),
      0
    );

    if (totalTempLastHour > 50) {
      riskScore += 45;
      reasons.push("Excessive temperature increase");
    }

    const isSuspicious = riskScore >= 50;

    return {
      isSuspicious,
      reason: reasons.join("; "),
      riskScore: Math.min(riskScore, 100),
    };
  } catch (error) {
    console.error("Temperature manipulation detection failed:", error);
    return { isSuspicious: false, riskScore: 0 };
  }
}

/**
 * 평가 검증 (중복 방지, 자기 평가 방지 등)
 */
export async function validateRating(
  callId: string,
  raterId: number,
  ratedUserId: number,
  score: number
): Promise<{
  valid: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { valid: false, error: "Database not available" };
  }

  try {
    // 1. 자기 자신 평가 방지
    if (raterId === ratedUserId) {
      return { valid: false, error: "Cannot rate yourself" };
    }

    // 2. 점수 범위 검증
    if (score < 1 || score > 5) {
      return { valid: false, error: "Score must be between 1 and 5" };
    }

    // 3. 통화 존재 확인
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { valid: false, error: "Call not found" };
    }

    // 4. 통화 참여자 확인
    const callRecord = call[0];
    const isParticipant =
      (callRecord.initiatorId === raterId && callRecord.recipientId === ratedUserId) ||
      (callRecord.recipientId === raterId && callRecord.initiatorId === ratedUserId);

    if (!isParticipant) {
      return { valid: false, error: "Not a participant of this call" };
    }

    // 5. 통화 상태 확인 (종료된 통화만)
    if (callRecord.status !== "ended") {
      return { valid: false, error: "Only ended calls can be rated" };
    }

    // 6. 중복 평가 방지
    const existingRating = await db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.callId, callId),
          eq(ratings.raterId, raterId)
        )
      )
      .limit(1);

    if (existingRating.length > 0) {
      return { valid: false, error: "Already rated this call" };
    }

    // 7. 온도 조작 탐지
    const manipulation = await detectTemperatureManipulation(ratedUserId);
    if (manipulation.isSuspicious) {
      return {
        valid: false,
        error: `Suspicious rating pattern detected: ${manipulation.reason}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

/**
 * 온도 제재 (조작 감지 시)
 */
export async function penalizeTemperatureManipulation(
  userId: number
): Promise<{
  success: boolean;
  penalty?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 사용자 조회
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      return { success: false, error: "User not found" };
    }

    // 2. 온도 50% 감소
    const currentTemp = parseFloat(user[0].temperature?.toString() || "36.5");
    const penalty = Math.floor(currentTemp * 0.5);
    const newTemp = Math.max(36, currentTemp - penalty);

    await db
      .update(users)
      .set({
        temperature: newTemp.toString(),
      })
      .where(eq(users.id, userId));

    return {
      success: true,
      penalty,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Penalty failed",
    };
  }
}

/**
 * 온도 상한선 설정 (최대 100도)
 */
export async function capTemperature(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      return false;
    }

    const currentTemp = parseFloat(user[0].temperature?.toString() || "36.5");
    if (currentTemp > 100) {
      await db
        .update(users)
        .set({
          temperature: "100",
        })
        .where(eq(users.id, userId));
    }

    return true;
  } catch (error) {
    console.error("Cap temperature failed:", error);
    return false;
  }
}

/**
 * 평가 기반 온도 계산 (서버에서만 수행)
 */
export function calculateTemperatureIncrease(score: number): number {
  // 기본값: 5-10도
  const base = Math.floor(Math.random() * 6) + 5;

  // 점수에 따라 조정
  const multiplier = score / 5;
  const increase = Math.round(base * multiplier);

  return Math.max(1, increase);
}
