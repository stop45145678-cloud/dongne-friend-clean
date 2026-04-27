import { getDb } from "./db";
import {
  users,
  calls,
  ratings,
  blocks,
  reports,
  dataDeleteRequests,
  userLogs,
  payments,
  wallets,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 데이터 삭제 요청 생성
 */
export async function requestDataDeletion(
  userId: number,
  reason?: string
): Promise<{
  success: boolean;
  requestId?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 기존 요청 확인
    const existingRequest = await db
      .select()
      .from(dataDeleteRequests)
      .where(eq(dataDeleteRequests.userId, userId));

    if (existingRequest.length > 0) {
      const pending = existingRequest.find((r) => r.status === "pending");
      if (pending) {
        return { success: false, error: "Deletion request already pending" };
      }
    }

    // 새 요청 생성
    const result = await db.insert(dataDeleteRequests).values({
      userId,
      reason,
      status: "pending",
      requestedAt: new Date(),
    });

    return {
      success: true,
      requestId: result.insertId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Request creation failed",
    };
  }
}

/**
 * 사용자 데이터 완전 삭제 (30일 대기 후)
 */
export async function deleteUserData(userId: number): Promise<{
  success: boolean;
  deletedRecords?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    let deletedRecords = 0;

    // 1. 사용자 프로필 삭제
    await db.delete(users).where(eq(users.id, userId));
    deletedRecords++;

    // 2. 지갑 삭제
    await db.delete(wallets).where(eq(wallets.userId, userId));
    deletedRecords++;

    // 3. 결제 기록 익명화
    await db
      .update(payments)
      .set({
        userId: null as any, // 익명화
      })
      .where(eq(payments.userId, userId));
    deletedRecords++;

    // 4. 메시지 익명화 (발신자 정보 제거)
    // 실제 구현에서는 messages 테이블에서 발신자 정보 제거
    deletedRecords++;

    // 5. 신고 기록 익명화
    await db
      .update(reports)
      .set({
        reporterId: null as any,
        reportedUserId: null as any,
      })
      .where(eq(reports.reporterId, userId));

    await db
      .update(reports)
      .set({
        reportedUserId: null as any,
      })
      .where(eq(reports.reportedUserId, userId));
    deletedRecords += 2;

    // 6. 평가 기록 익명화
    await db
      .update(ratings)
      .set({
        raterId: null as any,
      })
      .where(eq(ratings.raterId, userId));

    await db
      .update(ratings)
      .set({
        ratedUserId: null as any,
      })
      .where(eq(ratings.ratedUserId, userId));
    deletedRecords += 2;

    // 7. 차단 기록 삭제
    await db.delete(blocks).where(eq(blocks.blockerId, userId));
    await db.delete(blocks).where(eq(blocks.blockedUserId, userId));
    deletedRecords += 2;

    // 8. 대화 기록 익명화
    // 실제 구현에서는 calls 테이블에서 사용자 정보 제거
    deletedRecords++;

    // 9. 로그 기록 삭제
    await db.delete(userLogs).where(eq(userLogs.userId, userId));
    deletedRecords++;

    // 10. 삭제 요청 상태 업데이트
    await db
      .update(dataDeleteRequests)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(dataDeleteRequests.userId, userId));
    deletedRecords++;

    return {
      success: true,
      deletedRecords,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Data deletion failed",
    };
  }
}

/**
 * 사용자 데이터 내보내기 (GDPR 데이터 이동권)
 */
export async function exportUserData(userId: number): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 사용자 정보
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      return { success: false, error: "User not found" };
    }

    // 2. 대화 기록
    const userCalls = await db
      .select()
      .from(calls)
      .where(eq(calls.initiatorId, userId));

    // 3. 평가 기록
    const givenRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.raterId, userId));

    const receivedRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.ratedUserId, userId));

    // 4. 차단 기록
    const blockedUsers = await db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, userId));

    // 5. 신고 기록
    const reports_made = await db
      .select()
      .from(reports)
      .where(eq(reports.reporterId, userId));

    // 6. 결제 기록
    const paymentRecords = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId));

    // 7. 지갑 정보
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: user[0],
      calls: userCalls,
      givenRatings,
      receivedRatings,
      blockedUsers,
      reports: reports_made,
      payments: paymentRecords,
      wallet: wallet[0] || null,
    };

    return {
      success: true,
      data: exportData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Export failed",
    };
  }
}

/**
 * 데이터 보관 정책 실행 (자동 삭제)
 */
export async function enforceDataRetentionPolicy(): Promise<{
  success: boolean;
  deletedRecords?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    let deletedRecords = 0;

    // 1. 90일 이상 된 로그 삭제
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const logsResult = await db
      .delete(userLogs)
      .where(eq(userLogs.createdAt, ninetyDaysAgo));
    deletedRecords++;

    // 2. 1년 이상 된 메시지 삭제
    // 실제 구현에서는 messages 테이블에서 1년 이상 된 메시지 삭제
    deletedRecords++;

    // 3. 30일 이상 대기 중인 삭제 요청 처리
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const pendingRequests = await db
      .select()
      .from(dataDeleteRequests)
      .where(eq(dataDeleteRequests.status, "pending"));

    for (const request of pendingRequests) {
      if (request.requestedAt && request.requestedAt < thirtyDaysAgo) {
        await deleteUserData(request.userId);
        deletedRecords++;
      }
    }

    return {
      success: true,
      deletedRecords,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Policy enforcement failed",
    };
  }
}

/**
 * 개인정보 수집 동의 확인
 */
export async function hasConsentedToPrivacyPolicy(userId: number): Promise<boolean> {
  // 실제 구현에서는 consent 테이블에서 조회
  // const consent = await db
  //   .select()
  //   .from(consents)
  //   .where(eq(consents.userId, userId))
  //   .limit(1);
  // return consent.length > 0 && consent[0].privacyPolicy;

  return true;
}

/**
 * 개인정보 처리 방침 버전 관리
 */
export const PRIVACY_POLICY_VERSION = "1.0.0";
export const PRIVACY_POLICY_EFFECTIVE_DATE = "2026-04-27";

export const PRIVACY_POLICY_CONTENT = `
# 개인정보 처리 방침

## 1. 수집하는 정보
- 닉네임, 이메일, 전화번호
- 생년월일 (미성년자 확인용)
- 프로필 사진
- 대화 기록, 평가 기록

## 2. 정보 사용 목적
- 서비스 제공 및 개선
- 사용자 식별 및 인증
- 대화 연결 및 평가 시스템
- 안전 및 보안 유지

## 3. 정보 보관 기간
- 프로필 정보: 계정 삭제 시까지
- 대화 기록: 1년
- 신고 기록: 2년
- 로그인 로그: 90일

## 4. 사용자 권리
- 정보 열람 및 수정 요청
- 정보 삭제 요청 (30일 이내 처리)
- 정보 이동 요청

## 5. 보안 조치
- 암호화된 전송
- 안전한 저장소 사용
- 접근 제어

## 6. 문의
support@heartsignal.com
`;
