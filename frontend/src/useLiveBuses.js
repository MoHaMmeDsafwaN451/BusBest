import { useEffect, useState } from "react";
import { http } from "./api";

function socketUrl() {
  const url = new URL(import.meta.env.VITE_API_URL || "/api", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function useLiveBuses() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    http.get("/live/buses").then((result) => { if (active) { setData(result); setError(null); } })
      .catch((reason) => { if (active) setError(reason); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true;
    let socket;
    let retries = 0;
    let timer;
    function connect() {
      if (!active) return;
      socket = new WebSocket(socketUrl());
      socket.onopen = () => { retries = 0; };
      socket.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          if (update.type === "snapshot") setData({ count: update.count, buses: update.buses, routes: update.routes, refreshed_at: update.refreshed_at });
          if (update.type === "bus_state") setData((current) => current && ({ ...current, buses: current.buses.map((bus) => bus.bus_id === update.bus.bus_id ? { ...bus, ...update.bus } : bus) }));
          if (update.type === "tracking_status") setData((current) => current && ({ ...current, buses: current.buses.map((bus) => bus.bus_id === update.bus_id ? { ...bus, contributor_count: update.contributor_count } : bus) }));
        } catch { /* Ignore malformed broadcasts; the next snapshot refreshes state. */ }
      };
      socket.onclose = () => {
        if (!active) return;
        retries += 1;
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retries, 5)));
      };
    }
    connect();
    return () => { active = false; window.clearTimeout(timer); socket?.close(); };
  }, []);
  return { data, loading, error, reload: () => { setLoading(true); setRevision((value) => value + 1); } };
}
