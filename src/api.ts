export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

function getTokenFromStorage() {
  try {
    const raw = localStorage.getItem("dongne_friend_user") || localStorage.getItem("heart_signal_user");
    if (!raw) return "";
    return JSON.parse(raw)?.token || "";
  } catch {
    return "";
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getTokenFromStorage();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `API error ${res.status}`);
  }

  return res.json();
}
