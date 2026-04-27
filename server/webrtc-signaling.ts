import { getDb } from "./db";
import { calls } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * WebRTC Signaling 메시지 타입
 */
export type SignalingMessage = {
  type: "offer" | "answer" | "ice-candidate";
  from: number;
  to: number;
  callId: string;
  data: any;
  timestamp: number;
};

/**
 * 통화 시작 (Offer 생성)
 */
export async function initializeCall(
  initiatorId: number,
  recipientId: number,
  callId: string,
  mode: "audio" | "video" = "audio"
): Promise<{
  success: boolean;
  call?: any;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // 통화 기록 생성
    await db.insert(calls).values({
      id: callId,
      initiatorId,
      recipientId,
      status: "ringing",
      mode,
      createdAt: new Date(),
    });

    return {
      success: true,
      call: {
        id: callId,
        initiatorId,
        recipientId,
        status: "ringing",
        mode,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Call initialization failed",
    };
  }
}

/**
 * Offer 저장
 */
export async function saveOffer(
  callId: string,
  offer: RTCSessionDescriptionInit
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    signalingData.offer = offer;

    await db
      .update(calls)
      .set({
        signalingData: JSON.stringify(signalingData),
      })
      .where(eq(calls.id, callId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Save offer failed",
    };
  }
}

/**
 * Answer 저장
 */
export async function saveAnswer(
  callId: string,
  answer: RTCSessionDescriptionInit
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    signalingData.answer = answer;

    await db
      .update(calls)
      .set({
        signalingData: JSON.stringify(signalingData),
        status: "connected",
        startedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Save answer failed",
    };
  }
}

/**
 * ICE Candidate 저장
 */
export async function saveIceCandidate(
  callId: string,
  candidate: RTCIceCandidateInit,
  from: number
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    if (!signalingData.iceCandidates) {
      signalingData.iceCandidates = [];
    }

    signalingData.iceCandidates.push({
      candidate,
      from,
      timestamp: Date.now(),
    });

    // 최근 100개만 유지
    if (signalingData.iceCandidates.length > 100) {
      signalingData.iceCandidates = signalingData.iceCandidates.slice(-100);
    }

    await db
      .update(calls)
      .set({
        signalingData: JSON.stringify(signalingData),
      })
      .where(eq(calls.id, callId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Save ICE candidate failed",
    };
  }
}

/**
 * Offer 조회
 */
export async function getOffer(callId: string): Promise<{
  success: boolean;
  offer?: RTCSessionDescriptionInit;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    if (!signalingData.offer) {
      return { success: false, error: "Offer not found" };
    }

    return { success: true, offer: signalingData.offer };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Get offer failed",
    };
  }
}

/**
 * Answer 조회
 */
export async function getAnswer(callId: string): Promise<{
  success: boolean;
  answer?: RTCSessionDescriptionInit;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    if (!signalingData.answer) {
      return { success: false, error: "Answer not found" };
    }

    return { success: true, answer: signalingData.answer };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Get answer failed",
    };
  }
}

/**
 * ICE Candidates 조회
 */
export async function getIceCandidates(
  callId: string,
  from: number
): Promise<{
  success: boolean;
  candidates?: RTCIceCandidateInit[];
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const signalingData = call[0].signalingData
      ? JSON.parse(call[0].signalingData)
      : {};

    const candidates = (signalingData.iceCandidates || [])
      .filter((c: any) => c.from !== from) // 자신이 보낸 것 제외
      .map((c: any) => c.candidate);

    return { success: true, candidates };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Get ICE candidates failed",
    };
  }
}

/**
 * 통화 상태 업데이트
 */
export async function updateCallStatus(
  callId: string,
  status: "ringing" | "connected" | "rejected" | "ended" | "missed"
): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const updateData: any = { status };

    if (status === "connected") {
      updateData.startedAt = new Date();
    } else if (status === "ended" || status === "rejected" || status === "missed") {
      updateData.endedAt = new Date();
    }

    await db
      .update(calls)
      .set(updateData)
      .where(eq(calls.id, callId));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Update call status failed",
    };
  }
}

/**
 * 통화 종료 및 지속 시간 계산
 */
export async function endCall(
  callId: string,
  endedBy: number
): Promise<{
  success: boolean;
  duration?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const call = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call.length) {
      return { success: false, error: "Call not found" };
    }

    const callRecord = call[0];
    const endedAt = new Date();
    const startedAt = callRecord.startedAt || callRecord.createdAt;

    let duration = 0;
    if (startedAt) {
      duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
    }

    await db
      .update(calls)
      .set({
        status: "ended",
        endedAt,
        endedBy,
        durationSeconds: duration,
      })
      .where(eq(calls.id, callId));

    return { success: true, duration };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "End call failed",
    };
  }
}
