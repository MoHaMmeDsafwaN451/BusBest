import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { http } from "../api";
import { useAuth } from "./AuthContext";

const Tracking = createContext(null);

export function TrackingProvider({ children }) {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const watchId = useRef(null);
  const lastSentAt = useRef(0);
  const stopWatch = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }, []);

  const beginWatch = useCallback((current) => {
    if (!navigator.geolocation) { setError("This device/browser does not provide geolocation."); return; }
    stopWatch();
    setError("");
    watchId.current = navigator.geolocation.watchPosition(async (position) => {
      const now = Date.now();
      if (now - lastSentAt.current < 5000) return;
      lastSentAt.current = now;
      try {
        await http.post("/telemetry", {
          tracking_session_id: current.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        });
      } catch (reason) { setError(reason.message); }
    }, (reason) => setError(reason.message || "Location permission is unavailable."), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    setSharing(true);
  }, [stopWatch]);

  useEffect(() => {
    stopWatch();
    setSession(null);
    if (!user) return undefined;
    let active = true;
    http.get("/tracking-sessions/current").then((result) => { if (active) setSession(result.session); }).catch(() => {});
    return () => { active = false; stopWatch(); };
  }, [user, stopWatch]);

  const start = useCallback(async (busId) => {
    setError("");
    const result = await http.post("/tracking-sessions", { bus_id: busId, consent: true });
    setSession(result.session);
    beginWatch(result.session);
    return result.session;
  }, [beginWatch]);
  const resume = useCallback(() => { if (session) beginWatch(session); }, [session, beginWatch]);
  const stop = useCallback(async () => {
    const current = session;
    stopWatch();
    if (current) {
      try { await http.post(`/tracking-sessions/${current.id}/stop`, {}); setSession(null); }
      catch (reason) { setError(reason.message); }
    }
    else setError("");
  }, [session, stopWatch]);

  return <Tracking.Provider value={{ session, sharing, error, start, resume, stop }}>{children}</Tracking.Provider>;
}

export function useTracking() {
  const context = useContext(Tracking);
  if (!context) throw new Error("useTracking must be inside TrackingProvider");
  return context;
}
