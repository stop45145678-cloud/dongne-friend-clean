import { api } from "./api";

export type FriendProfile = {
  mbti?: string;
  socialType?: string;
  personalities?: string[];
  tastes?: string[];
  hobbies?: string[];
  intro?: string;
  region?: string;
  profileVisibility?: "public" | "friends" | "private";
};

export type CurrentUser = {
  id: number;
  nickname: string;
  temp: number;
  weeklyTemp?: number;
  token: string;
  coins?: number;
  ownedEmoticonPacks?: string[];
  inviteCode?: string;
  referredBy?: number | null;
  invitedCount?: number;
  profile?: FriendProfile;
};

const STORAGE_KEY = "dongne_friend_user";
const LEGACY_STORAGE_KEY = "heart_signal_user";

export function getStoredUser(): CurrentUser | null {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return null;
  }
}

export function saveUser(user: CurrentUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export async function loginWithNickname(nickname: string, profile?: FriendProfile) {
  const user = await api<CurrentUser>("/auth/nickname", {
    method: "POST",
    body: JSON.stringify({ nickname, profile }),
  });
  saveUser(user);
  return user;
}

export async function updateMyProfile(profile: FriendProfile) {
  const data = await api<{ user: CurrentUser }>("/me/profile", {
    method: "PUT",
    body: JSON.stringify({ profile }),
  });
  saveUser(data.user);
  return data.user;
}

export async function deleteMyAccount() {
  const data = await api<{ success: boolean; message: string }>("/me", { method: "DELETE" });
  logout();
  return data;
}
