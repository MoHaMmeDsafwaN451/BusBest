import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { http } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("busbest:unauthorized", onUnauthorized);
    const token = sessionStorage.getItem("busbest_token");
    if (!token) {
      setLoading(false);
      return () => window.removeEventListener("busbest:unauthorized", onUnauthorized);
    }
    http.get("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => {
        sessionStorage.removeItem("busbest_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
    return () => window.removeEventListener("busbest:unauthorized", onUnauthorized);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await http.post("/auth/login", { email, password });
      sessionStorage.setItem("busbest_token", result.token);
      setUser(result.user);
      return result.user;
    },
    async register(name, email, password) {
      const result = await http.post("/auth/register", { name, email, password });
      sessionStorage.setItem("busbest_token", result.token);
      setUser(result.user);
      return result.user;
    },
    logout() {
      sessionStorage.removeItem("busbest_token");
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
