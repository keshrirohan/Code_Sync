const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://codesync-api-5p2c.onrender.com" : "")
).replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
