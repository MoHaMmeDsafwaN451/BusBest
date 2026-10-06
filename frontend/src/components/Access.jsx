import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "./Layout";

export function SignedIn() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session" />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function RequireUser() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <Navigate to="/admin" replace /> : <Outlet />;
}

export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <Outlet /> : <Navigate to="/forbidden" replace />;
}
