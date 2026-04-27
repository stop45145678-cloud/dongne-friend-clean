import {
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  boolean,
  decimal,
  mysqlTable,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * 사용자 테이블
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    nickname: varchar("nickname", { length: 32 }).notNull().unique(),
    email: varchar("email", { length: 255 }).unique(),
    phoneNumber: varchar("phone_number", { length: 20 }).unique(),
    passwordHash: varchar("password_hash", { length: 255 }),
    googleId: varchar("google_id", { length: 255 }).unique(),
    kakaoId: varchar("kakao_id", { length: 255 }).unique(),
    birthDate: timestamp("birth_date"),
    gender: mysqlEnum("gender", ["male", "female", "other"]),
    profileImage: varchar("profile_image", { length: 500 }),
    bio: text("bio"),
    temperature: decimal("temperature", { precision: 5, scale: 2 }).default("36.5"),
    weeklyTemperature: decimal("weekly_temperature", { precision: 5, scale: 2 }).default("0"),
    status: mysqlEnum("status", ["active", "suspended", "banned"]).default("active"),
    isVerified: boolean("is_verified").default(false),
    verificationToken: varchar("verification_token", { length: 255 }),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    nicknameIdx: index("nickname_idx").on(table.nickname),
    emailIdx: index("email_idx").on(table.email),
    statusIdx: index("status_idx").on(table.status),
  })
);

/**
 * 통화 기록 테이블
 */
export const calls = mysqlTable(
  "calls",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    initiatorId: int("initiator_id").notNull(),
    recipientId: int("recipient_id").notNull(),
    status: mysqlEnum("status", ["ringing", "connected", "rejected", "ended", "missed"]).default("ringing"),
    mode: mysqlEnum("mode", ["audio", "video", "fake"]).default("audio"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    endedBy: int("ended_by"),
    durationSeconds: int("duration_seconds"),
    signalingData: text("signaling_data"), // WebRTC SDP/ICE candidates
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    initiatorIdx: index("initiator_idx").on(table.initiatorId),
    recipientIdx: index("recipient_idx").on(table.recipientId),
    statusIdx: index("status_idx").on(table.status),
  })
);

/**
 * 평가 테이블
 */
export const ratings = mysqlTable(
  "ratings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    callId: varchar("call_id", { length: 36 }).notNull(),
    raterId: int("rater_id").notNull(),
    ratedUserId: int("rated_user_id").notNull(),
    score: int("score").notNull(), // 1-5
    addedTemperature: decimal("added_temperature", { precision: 5, scale: 2 }),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    callIdIdx: index("call_id_idx").on(table.callId),
    raterIdx: index("rater_idx").on(table.raterId),
    ratedUserIdx: index("rated_user_idx").on(table.ratedUserId),
    uniqueRatingIdx: uniqueIndex("unique_rating").on(table.callId, table.raterId),
  })
);

/**
 * 차단 테이블
 */
export const blocks = mysqlTable(
  "blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerId: int("blocker_id").notNull(),
    blockedUserId: int("blocked_user_id").notNull(),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    blockerIdx: index("blocker_idx").on(table.blockerId),
    blockedUserIdx: index("blocked_user_idx").on(table.blockedUserId),
    uniqueBlockIdx: uniqueIndex("unique_block").on(table.blockerId, table.blockedUserId),
  })
);

/**
 * 신고 테이블
 */
export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterId: int("reporter_id").notNull(),
    reportedUserId: int("reported_user_id").notNull(),
    category: mysqlEnum("category", ["inappropriate_content", "fraud", "harassment", "spam", "other"]).notNull(),
    description: text("description").notNull(),
    evidence: text("evidence"), // JSON array of URLs
    status: mysqlEnum("status", ["pending", "investigating", "resolved", "dismissed"]).default("pending"),
    adminNotes: text("admin_notes"),
    reviewedBy: int("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    reporterIdx: index("reporter_idx").on(table.reporterId),
    reportedUserIdx: index("reported_user_idx").on(table.reportedUserId),
    statusIdx: index("status_idx").on(table.status),
  })
);

/**
 * 제재 기록 테이블
 */
export const sanctions = mysqlTable(
  "sanctions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    type: mysqlEnum("type", ["warning", "suspension", "ban"]).notNull(),
    reason: text("reason").notNull(),
    duration: int("duration"), // 일 단위, null이면 영구
    appliedAt: timestamp("applied_at").defaultNow(),
    expiresAt: timestamp("expires_at"),
    appliedBy: int("applied_by"),
  },
  (table) => ({
    userIdx: index("user_idx").on(table.userId),
    expiresAtIdx: index("expires_at_idx").on(table.expiresAt),
  })
);

/**
 * 결제 테이블
 */
export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("KRW"),
    coins: int("coins").notNull(),
    paymentMethod: mysqlEnum("payment_method", ["toss", "google_play", "kakao_pay"]).notNull(),
    transactionId: varchar("transaction_id", { length: 255 }).notNull().unique(),
    status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userIdx: index("user_idx").on(table.userId),
    transactionIdIdx: index("transaction_id_idx").on(table.transactionId),
    statusIdx: index("status_idx").on(table.status),
  })
);

/**
 * 코인 지갑 테이블
 */
export const wallets = mysqlTable(
  "wallets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().unique(),
    coins: int("coins").default(0),
    totalSpent: int("total_spent").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  }
);

/**
 * 데이터 삭제 요청 테이블
 */
export const dataDeleteRequests = mysqlTable(
  "data_delete_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    reason: varchar("reason", { length: 255 }),
    status: mysqlEnum("status", ["pending", "processing", "completed"]).default("pending"),
    requestedAt: timestamp("requested_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userIdx: index("user_idx").on(table.userId),
    statusIdx: index("status_idx").on(table.status),
  })
);

/**
 * 사용자 행동 로그 테이블
 */
export const userLogs = mysqlTable(
  "user_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    details: text("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("user_idx").on(table.userId),
    actionIdx: index("action_idx").on(table.action),
  })
);

/**
 * 타입 정의
 */
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type InsertRating = typeof ratings.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = typeof blocks.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
export type Sanction = typeof sanctions.$inferSelect;
export type InsertSanction = typeof sanctions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;
export type DataDeleteRequest = typeof dataDeleteRequests.$inferSelect;
export type InsertDataDeleteRequest = typeof dataDeleteRequests.$inferInsert;
export type UserLog = typeof userLogs.$inferSelect;
export type InsertUserLog = typeof userLogs.$inferInsert;

/**
 * 관계 정의
 */
export const usersRelations = relations(users, ({ many }) => ({
  initiatedCalls: many(calls, { relationName: "initiator" }),
  receivedCalls: many(calls, { relationName: "recipient" }),
  givenRatings: many(ratings, { relationName: "rater" }),
  receivedRatings: many(ratings, { relationName: "ratedUser" }),
  blocks: many(blocks, { relationName: "blocker" }),
  blockedBy: many(blocks, { relationName: "blockedUser" }),
  reports: many(reports, { relationName: "reporter" }),
  reportedBy: many(reports, { relationName: "reportedUser" }),
  sanctions: many(sanctions),
  payments: many(payments),
  wallet: many(wallets),
  logs: many(userLogs),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  initiator: one(users, {
    fields: [calls.initiatorId],
    references: [users.id],
    relationName: "initiator",
  }),
  recipient: one(users, {
    fields: [calls.recipientId],
    references: [users.id],
    relationName: "recipient",
  }),
  ratings: many(ratings),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  call: one(calls, {
    fields: [ratings.callId],
    references: [calls.id],
  }),
  rater: one(users, {
    fields: [ratings.raterId],
    references: [users.id],
    relationName: "rater",
  }),
  ratedUser: one(users, {
    fields: [ratings.ratedUserId],
    references: [users.id],
    relationName: "ratedUser",
  }),
}));
