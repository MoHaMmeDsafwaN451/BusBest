"""Lightweight public current-state view: HBase only, no HDFS/MapReduce/Hive reads."""

from __future__ import annotations

import json
import base64
import math
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.traffic_eta import DEFAULT_CONFIG, build_bus_result, read_hbase_states


def decode_payload(encoded: str) -> dict | list:
    return json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8"))


def distance_km(a: dict, b: dict) -> float:
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def select_next_stop(state: dict, ordered_stops: list[dict]) -> dict | None:
    stops = sorted(ordered_stops, key=lambda stop: stop["sequence"])
    if not stops:
        return None
    if len(stops) == 1:
        return stops[0]
    # Project onto each ordered route segment in a local tangent plane.
    # The nearest segment's destination is the next stop in the configured
    # start-to-destination direction.
    lat_scale = 111.32
    lon_scale = 111.32 * math.cos(math.radians(state["latitude"]))
    px, py = state["longitude"] * lon_scale, state["latitude"] * lat_scale
    best = None
    for index, (start, end) in enumerate(zip(stops, stops[1:])):
        ax, ay = start["longitude"] * lon_scale, start["latitude"] * lat_scale
        bx, by = end["longitude"] * lon_scale, end["latitude"] * lat_scale
        dx, dy = bx - ax, by - ay
        length_squared = dx * dx + dy * dy
        fraction = 0 if length_squared == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length_squared))
        projected = {"latitude": start["latitude"] + fraction * (end["latitude"] - start["latitude"]),
                     "longitude": start["longitude"] + fraction * (end["longitude"] - start["longitude"])}
        candidate = (distance_km(state, projected), index)
        if best is None or candidate < best:
            best = candidate
    return stops[(best[1] + 1) if best else 1]


def next_stop_with_arrival_check(state: dict, ordered_stops: list[dict]) -> dict | None:
    stops = sorted(ordered_stops, key=lambda stop: stop["sequence"])
    candidate = select_next_stop(state, stops)
    if candidate is None:
        return None
    # When effectively at an intermediate stop, show the following stop.
    if distance_km(state, candidate) <= 0.15:
        index = stops.index(candidate)
        if index + 1 < len(stops):
            return stops[index + 1]
    return candidate


def enrich_live_state(state: dict, route: dict | None, historical_average_by_bus: dict[str, float], config: dict) -> dict:
    next_stop = next_stop_with_arrival_check(state, (route or {}).get("stops", []))
    calculation_state = {**state}
    calculation_state["data_source"] = state.get("data_source") or state.get("source")
    calculation_state["contributor_count"] = state.get("contributor_count", state.get("contributorCount", 0))
    if next_stop:
        calculation_state["next_stop"] = {"stop_id": next_stop["stopId"], "name": next_stop["name"], "sequence": next_stop["sequence"]}
        calculation_state["remaining_distance_km"] = distance_km(state, next_stop)
        calculation_state["distance_basis"] = "Straight-line distance to the next configured stop on the ordered start-to-destination route; it is not road-route distance."
    result = build_bus_result(calculation_state, historical_average_by_bus.get(state["bus_id"]), config, use_current_speed_fallback=True)
    if route:
        result["route_label"] = f"{route.get('start', '')} → {route.get('destination', '')}".strip(" →") or route.get("name") or state["route_id"]
    else:
        result["route_label"] = state.get("route_label") or state["route_id"]
    return result


def main() -> int:
    payload = decode_payload(sys.argv[1]) if len(sys.argv) > 1 else {}
    # Accept a bare route list for direct/manual invocations as well.
    routes = payload if isinstance(payload, list) else payload.get("routes", [])
    historical = payload.get("historicalAverageByBus", []) if isinstance(payload, dict) else []
    historical_by_bus = {row["bus_id"]: row["average_speed_kmh"] for row in historical}
    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    # Ignore incomplete operational/test rows; strict historical pipeline
    # reads remain strict through the default parser behavior.
    states = read_hbase_states(skip_incomplete=True)
    route_by_id = {route["routeId"]: route for route in routes}
    buses = [enrich_live_state(state, route_by_id.get(state["route_id"]), historical_by_bus, config) for state in states]
    print(json.dumps({"count": len(buses), "buses": buses}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
