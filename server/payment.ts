import axios from "axios";
import crypto from "crypto";
import { getDb } from "./db";
import { payments, wallets, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 코인 패키지 정의
 */
export const COIN_PACKAGES = {
  small: { coins: 100, price: 1000, name: "Small" },
  medium: { coins: 500, price: 4500, name: "Medium" },
  large: { coins: 1000, price: 8000, name: "Large" },
  xl: { coins: 5000, price: 35000, name: "XL" },
};

/**
 * Toss 결제 승인
 */
export async function approveTossPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  try {
    const response = await axios.post(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        paymentKey,
        orderId,
        amount,
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TOSS_CLIENT_KEY}:`
          ).toString("base64")}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status === "DONE") {
      return {
        success: true,
        transactionId: response.data.paymentKey,
      };
    }

    return {
      success: false,
      error: `Payment status: ${response.data.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment approval failed",
    };
  }
}

/**
 * Google Play 결제 검증
 */
export async function verifyGooglePlayPurchase(
  packageName: string,
  subscriptionId: string,
  token: string
): Promise<{
  success: boolean;
  purchaseData?: any;
  error?: string;
}> {
  try {
    const response = await axios.get(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${token}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_PLAY_API_KEY}`,
        },
      }
    );

    if (response.data.paymentState === 1) {
      // 1 = Paid
      return {
        success: true,
        purchaseData: response.data,
      };
    }

    return {
      success: false,
      error: `Payment state: ${response.data.paymentState}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

/**
 * 결제 기록 생성
 */
export async function createPayment(
  userId: number,
  amount: number,
  coins: number,
  paymentMethod: "toss" | "google_play" | "kakao_pay",
  transactionId: string
): Promise<{
  success: boolean;
  paymentId?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 중복 거래 확인
    const existing = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, transactionId));

    if (existing.length > 0) {
      return { success: false, error: "Duplicate transaction" };
    }

    // 2. 결제 기록 생성
    const result = await db.insert(payments).values({
      userId,
      amount,
      coins,
      paymentMethod,
      transactionId,
      status: "pending",
      createdAt: new Date(),
    });

    return {
      success: true,
      paymentId: result.insertId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment creation failed",
    };
  }
}

/**
 * 결제 완료 처리
 */
export async function completePayment(
  paymentId: number
): Promise<{
  success: boolean;
  coins?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 결제 기록 조회
    const payment = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment.length) {
      return { success: false, error: "Payment not found" };
    }

    const paymentRecord = payment[0];

    // 2. 결제 상태 업데이트
    await db
      .update(payments)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    // 3. 지갑에 코인 추가
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, paymentRecord.userId))
      .limit(1);

    if (wallet.length > 0) {
      await db
        .update(wallets)
        .set({
          coins: wallet[0].coins + paymentRecord.coins,
        })
        .where(eq(wallets.userId, paymentRecord.userId));
    } else {
      await db.insert(wallets).values({
        userId: paymentRecord.userId,
        coins: paymentRecord.coins,
      });
    }

    return {
      success: true,
      coins: paymentRecord.coins,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment completion failed",
    };
  }
}

/**
 * 결제 실패 처리
 */
export async function failPayment(
  paymentId: number,
  reason: string
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
      .update(payments)
      .set({
        status: "failed",
      })
      .where(eq(payments.id, paymentId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment failure handling failed",
    };
  }
}

/**
 * 코인 사용
 */
export async function useCoins(
  userId: number,
  coins: number,
  reason: string
): Promise<{
  success: boolean;
  remainingCoins?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 지갑 조회
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (!wallet.length) {
      return { success: false, error: "Wallet not found" };
    }

    // 2. 코인 확인
    if (wallet[0].coins < coins) {
      return { success: false, error: "Insufficient coins" };
    }

    // 3. 코인 차감
    const newCoins = wallet[0].coins - coins;
    const totalSpent = (wallet[0].totalSpent || 0) + coins;

    await db
      .update(wallets)
      .set({
        coins: newCoins,
        totalSpent,
      })
      .where(eq(wallets.userId, userId));

    return {
      success: true,
      remainingCoins: newCoins,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Coin usage failed",
    };
  }
}

/**
 * 환불 처리
 */
export async function refundPayment(
  paymentId: number,
  reason: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 1. 결제 기록 조회
    const payment = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment.length) {
      return { success: false, error: "Payment not found" };
    }

    const paymentRecord = payment[0];

    // 2. 이미 환불된 경우 방지
    if (paymentRecord.status === "refunded") {
      return { success: false, error: "Already refunded" };
    }

    // 3. 환불 처리
    await db
      .update(payments)
      .set({
        status: "refunded",
      })
      .where(eq(payments.id, paymentId));

    // 4. 코인 반환 (사용하지 않은 경우)
    if (paymentRecord.status === "completed") {
      const wallet = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, paymentRecord.userId))
        .limit(1);

      if (wallet.length > 0) {
        await db
          .update(wallets)
          .set({
            coins: wallet[0].coins + paymentRecord.coins,
          })
          .where(eq(wallets.userId, paymentRecord.userId));
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Refund failed",
    };
  }
}

/**
 * 사용자 지갑 조회
 */
export async function getWallet(userId: number): Promise<{
  success: boolean;
  wallet?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (!wallet.length) {
      return { success: false, error: "Wallet not found" };
    }

    return { success: true, wallet: wallet[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Get wallet failed",
    };
  }
}

/**
 * 결제 내역 조회
 */
export async function getPaymentHistory(
  userId: number,
  limit: number = 10
): Promise<{
  success: boolean;
  payments?: any[];
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const paymentList = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .limit(limit);

    return { success: true, payments: paymentList };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Get payment history failed",
    };
  }
}
