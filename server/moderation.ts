import { getDb } from "./db";
import { reports, blocks, sanctions, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * 사용자 신고
 */
export async function reportUser(
  reporterId: number,
  reportedUserId: number,
  category: "inappropriate_content" | "fraud" | "harassment" | "spam" | "other",
  description: string,
  evidence?: string[]
): Promise<{
  success: boolean;
  reportId?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 자신을 신고하는 경우 방지
    if (reporterId === reportedUserId) {
      return { success: false, error: "Cannot report yourself" };
    }

    // 2. 중복 신고 확인 (24시간 내)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReport = await db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, reporterId),
          eq(reports.reportedUserId, reportedUserId)
        )
      );

    const isDuplicate = recentReport.some(
      (r) => r.createdAt && r.createdAt > oneDayAgo
    );

    if (isDuplicate) {
      return { success: false, error: "Already reported this user within 24 hours" };
    }

    // 3. 신고 생성
    const result = await db.insert(reports).values({
      reporterId,
      reportedUserId,
      category,
      description,
      evidence: evidence ? JSON.stringify(evidence) : null,
      status: "pending",
      createdAt: new Date(),
    });

    // 4. 신고 누적 확인 (자동 제재)
    const totalReports = await db
      .select()
      .from(reports)
      .where(eq(reports.reportedUserId, reportedUserId));

    if (totalReports.length >= 5) {
      // 자동 정지
      await applySanction(reportedUserId, "ban", "Excessive reports", null, null);
    } else if (totalReports.length >= 3) {
      // 자동 일시 정지
      await applySanction(reportedUserId, "suspension", "Multiple reports", 7, null);
    }

    return {
      success: true,
      reportId: result.insertId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Report creation failed",
    };
  }
}

/**
 * 사용자 차단
 */
export async function blockUser(
  blockerId: number,
  blockedUserId: number,
  reason?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 자신을 차단하는 경우 방지
    if (blockerId === blockedUserId) {
      return { success: false, error: "Cannot block yourself" };
    }

    // 2. 이미 차단했는지 확인
    const existing = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.blockerId, blockerId),
          eq(blocks.blockedUserId, blockedUserId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { success: false, error: "Already blocked this user" };
    }

    // 3. 차단 생성
    await db.insert(blocks).values({
      blockerId,
      blockedUserId,
      reason,
      createdAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Block creation failed",
    };
  }
}

/**
 * 차단 해제
 */
export async function unblockUser(
  blockerId: number,
  blockedUserId: number
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    await db
      .delete(blocks)
      .where(
        and(
          eq(blocks.blockerId, blockerId),
          eq(blocks.blockedUserId, blockedUserId)
        )
      );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unblock failed",
    };
  }
}

/**
 * 차단 여부 확인
 */
export async function isBlocked(
  blockerId: number,
  blockedUserId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }

  try {
    const block = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.blockerId, blockerId),
          eq(blocks.blockedUserId, blockedUserId)
        )
      )
      .limit(1);

    return block.length > 0;
  } catch (error) {
    console.error("Block check failed:", error);
    return false;
  }
}

/**
 * 제재 적용
 */
export async function applySanction(
  userId: number,
  type: "warning" | "suspension" | "ban",
  reason: string,
  duration: number | null, // 일 단위
  appliedBy: number | null
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 기존 제재 확인
    const activeSanctions = await db
      .select()
      .from(sanctions)
      .where(eq(sanctions.userId, userId));

    const activeBan = activeSanctions.find(
      (s) => s.type === "ban" && (!s.expiresAt || s.expiresAt > new Date())
    );

    if (activeBan) {
      return { success: false, error: "User is already banned" };
    }

    // 2. 제재 생성
    const expiresAt = duration
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      : null;

    await db.insert(sanctions).values({
      userId,
      type,
      reason,
      duration,
      appliedAt: new Date(),
      expiresAt,
      appliedBy,
    });

    // 3. 사용자 상태 업데이트
    let status: "active" | "suspended" | "banned" = "active";
    if (type === "ban") {
      status = "banned";
    } else if (type === "suspension") {
      status = "suspended";
    }

    if (type !== "warning") {
      await db
        .update(users)
        .set({ status })
        .where(eq(users.id, userId));
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sanction application failed",
    };
  }
}

/**
 * 활성 제재 확인
 */
export async function getActiveSanction(userId: number): Promise<any | null> {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const activeSanctions = await db
      .select()
      .from(sanctions)
      .where(eq(sanctions.userId, userId));

    const now = new Date();

    // 가장 심각한 제재 반환 (ban > suspension > warning)
    const ban = activeSanctions.find(
      (s) => s.type === "ban" && (!s.expiresAt || s.expiresAt > now)
    );

    if (ban) {
      return ban;
    }

    const suspension = activeSanctions.find(
      (s) => s.type === "suspension" && (!s.expiresAt || s.expiresAt > now)
    );

    if (suspension) {
      return suspension;
    }

    const warning = activeSanctions.find(
      (s) => s.type === "warning" && (!s.expiresAt || s.expiresAt > now)
    );

    return warning || null;
  } catch (error) {
    console.error("Get active sanction failed:", error);
    return null;
  }
}

/**
 * 신고 목록 조회 (관리자용)
 */
export async function getReports(
  status?: "pending" | "investigating" | "resolved" | "dismissed"
): Promise<any[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    let query = db.select().from(reports);

    if (status) {
      query = query.where(eq(reports.status, status)) as any;
    }

    return await query;
  } catch (error) {
    console.error("Get reports failed:", error);
    return [];
  }
}

/**
 * 신고 상태 업데이트 (관리자용)
 */
export async function updateReportStatus(
  reportId: number,
  status: "pending" | "investigating" | "resolved" | "dismissed",
  adminNotes?: string,
  reviewedBy?: number
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    await db
      .update(reports)
      .set({
        status,
        adminNotes,
        reviewedBy,
        reviewedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

/**
 * 미성년자 로그인 방지
 */
export async function checkMinorLogin(userId: number): Promise<{
  isMinor: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { isMinor: false, error: "Database not available" };
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      return { isMinor: false, error: "User not found" };
    }

    if (!user[0].birthDate) {
      return { isMinor: false }; // 생년월일 없으면 성인으로 간주
    }

    const today = new Date();
    const birthDate = new Date(user[0].birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return { isMinor: age < 18 };
  } catch (error) {
    return {
      isMinor: false,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}
