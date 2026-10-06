import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePreferences } from "../context/PreferencesContext";

function popupContent(bus, t) {
  const root = document.createElement("div");
  root.className = "map-popup";
  const title = document.createElement("strong");
  title.textContent = bus.bus_id;
  root.append(title);
  const details = [
    `${t("route")} ${bus.route_id}`,
    `${t("speed")} ${bus.speed == null ? "—" : `${bus.speed} km/h`}`,
    `${t("traffic")} ${bus.traffic_level || "UNKNOWN"}`,
    `${t("status")} ${bus.tracking_status || "UNKNOWN"}`,
    bus.next_stop?.name ? `${t("nextStop")} ${bus.next_stop.name}` : `${t("nextStop")} unavailable`,
    `${t("eta")} ${bus.eta_minutes == null ? bus.eta_status : `${bus.eta_minutes} min`}`,
    `${t("updated")} ${bus.timestamp ? new Date(bus.timestamp).toLocaleString() : "unavailable"}`,
    bus.data_label || "Source label unavailable",
  ];
  for (const detail of details) {
    const line = document.createElement("span");
    line.textContent = detail;
    root.append(line);
  }
  return root;
}

export default function BusMap({ buses = [], routes = [], compact = false }) {
  const { t } = usePreferences();
  const element = useRef(null);
  const map = useRef(null);
  const markers = useRef(null);

  useEffect(() => {
    if (!element.current || map.current) return undefined;
    map.current = L.map(element.current, { scrollWheelZoom: false, zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    const timer = window.setTimeout(() => map.current?.invalidateSize(), 120);
    return () => {
      window.clearTimeout(timer);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    for (const route of routes) {
      const stops = [...(route.stops || [])].sort((a, b) => a.sequence - b.sequence);
      if (stops.length > 1) L.polyline(stops.map((stop) => [stop.latitude, stop.longitude]), { color: "#ef713f", weight: 3, opacity: 0.45 }).addTo(markers.current);
      for (const stop of stops) {
        L.circleMarker([stop.latitude, stop.longitude], { radius: compact ? 4 : 5, color: "#30352f", weight: 1, fillColor: "#fff", fillOpacity: 1 }).bindTooltip(`${stop.sequence}. ${stop.name}`).addTo(markers.current);
      }
    }
    const valid = buses.filter((bus) => bus.latitude != null && bus.longitude != null && Number.isFinite(Number(bus.latitude)) && Number.isFinite(Number(bus.longitude)));
    for (const bus of valid) {
      const marker = L.circleMarker([Number(bus.latitude), Number(bus.longitude)], {
        radius: compact ? 8 : 10,
        color: "#fff",
        weight: 3,
        fillColor: bus.tracking_status === "DEMO" ? "#e6973b" : ["NO_LIVE_DATA", "STALE"].includes(bus.tracking_status) ? "#7c7d78" : bus.traffic_level === "HEAVY" ? "#d64e39" : bus.traffic_level === "FAST" ? "#3c8b63" : "#ef713f",
        fillOpacity: 1,
      });
      marker.bindPopup(popupContent(bus, t)).addTo(markers.current);
    }
    if (valid.length === 1) map.current.setView([Number(valid[0].latitude), Number(valid[0].longitude)], 13);
    if (valid.length > 1) map.current.fitBounds(L.latLngBounds(valid.map((bus) => [Number(bus.latitude), Number(bus.longitude)])), { padding: [30, 30], maxZoom: 14 });
  }, [buses, routes, compact, t]);

  return <div ref={element} className={`bus-map${compact ? " bus-map--compact" : ""}`} role="img" aria-label="Map showing current BUSBEST API bus locations" />;
}
