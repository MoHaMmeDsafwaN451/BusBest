import { Link } from "react-router-dom";
import { usePreferences } from "../context/PreferencesContext";

export function TrafficPill({ level }) {
  return <span className={`traffic-pill traffic-pill--${String(level || "unknown").toLowerCase()}`}><i />{level || "UNKNOWN"}</span>;
}

export function TrackingStatus({ bus }) {
  const status = bus.tracking_status || (bus.data_label?.includes("SIMULATED") ? "DEMO" : bus.latitude != null ? "LIMITED_DATA" : "NO_LIVE_DATA");
  return <span className={`tracking-status tracking-status--${status.toLowerCase().replaceAll(" ", "_")}`}>{status.replaceAll("_", " ")}</span>;
}

export function BusCard({ bus, secondary, to }) {
  const { t } = usePreferences();
  const target = to || `/buses/${encodeURIComponent(bus.bus_id || bus.busId)}`;
  const live = Number.isFinite(bus.latitude) && Number.isFinite(bus.longitude);
  return <Link className="bus-card" to={target}>
    <span className="bus-card-icon" aria-hidden="true">🚌</span>
    <span className="bus-card-main"><span className="bus-card-title">{bus.bus_id || bus.busId}<small>{bus.route_label || bus.route_id || bus.routeId}{bus.name ? ` · ${bus.name}` : ""}</small></span><TrackingStatus bus={bus} /></span>
    <span className="bus-card-stats">{live ? <><strong>{bus.speed == null ? "—" : bus.speed} <small>km/h</small></strong><span>{bus.eta_minutes == null ? (bus.eta_status === "zero_speed" ? t("waiting") : t("etaUnavailable")) : `${bus.eta_minutes} min ETA`}</span>{bus.next_stop?.name && <span>{t("nextStop")} · {bus.next_stop.name}</span>}</> : <><strong>{t("noLive")}</strong><span>{bus.timestamp ? `Last update ${new Date(bus.timestamp).toLocaleString()}` : secondary || "Live location unavailable"}</span></>}</span>
  </Link>;
}
