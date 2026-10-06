const API_ROOT = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message || "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api(path, options = {}) {
  const token = sessionStorage.getItem("busbest_token");
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response;
  try {
    response = await fetch(`${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      headers,
      body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "BUSBEST API is unavailable. Start the backend and check its local connection.", "backend_unavailable");
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 401 && token) {
    sessionStorage.removeItem("busbest_token");
    window.dispatchEvent(new CustomEvent("busbest:unauthorized"));
  }
  if (!response.ok) {
    const messages = {
      401: "Your session has expired. Please sign in again.",
      403: "You do not have permission to perform this action.",
      503: payload?.message || "The requested BUSBEST service is unavailable.",
    };
    throw new ApiError(response.status, payload?.message || messages[response.status] || payload?.error || "The request could not be completed.", payload?.error);
  }
  return payload;
}

export const http = {
  get: (path) => api(path),
  post: (path, body) => api(path, { method: "POST", body }),
  put: (path, body) => api(path, { method: "PUT", body }),
  delete: (path) => api(path, { method: "DELETE" }),
};
