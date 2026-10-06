"""Transparent demo traffic classification and ETA calculations for BUSBEST."""

from __future__ import annotations

import csv
import io
import json
import math
import re
import subprocess
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "traffic_eta_demo.json"
HBASE_TABLE = "busbest_bus_state"
HDFS_AVERAGES = "/busbest/processed/average_speed_by_bus_milestone2/part-r-00000"
HDFS_CLEANED = "/busbest/cleaned/gps_cleaned.csv"

HBASE_CELLS = {
    "info:route_id": "route_id",
    "info:data_source": "data_source",
    "location:latitude": "latitude",
    "location:longitude": "longitude",
    "telemetry:speed": "speed",
    "telemetry:timestamp": "timestamp",
    "telemetry:heading": "heading",
    "telemetry:accuracy": "accuracy",
    "telemetry:tracking_status": "tracking_status",
    "telemetry:contributor_count": "contributor_count",
    "telemetry:confidence": "confidence",
}
SCAN_CELL = re.compile(
    r"^\s*(?P<bus_id>[A-Za-z0-9._-]+)\s+column="
    r"(?P<column>[^,]+), timestamp=.*?, value=(?P<value>.*)$"
)


def _finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be a finite number") from error
    if not math.isfinite(number):
        raise ValueError(f"{field} must be a finite number")
    return number


def classify_traffic(speed_kmh: Any, thresholds: dict[str, float]) -> str:
    """Classify a measured speed using inclusive, configurable demo thresholds."""
    if speed_kmh is None or speed_kmh == "":
        return "UNKNOWN"
    speed = _finite_number(speed_kmh, "speed_kmh")
    heavy = _finite_number(thresholds["heavy_max_inclusive"], "heavy threshold")
    moderate = _finite_number(thresholds["moderate_max_inclusive"], "moderate threshold")
    normal = _finite_number(thresholds["normal_max_inclusive"], "normal threshold")
    maximum = _finite_number(thresholds["maximum_valid_speed"], "maximum valid speed")
    if not (0 <= heavy < moderate < normal <= maximum):
        raise ValueError("Traffic thresholds must be ordered and within the valid speed range")
    if not 0 <= speed <= maximum:
        raise ValueError(f"speed_kmh must be between 0 and {maximum}")
    if speed <= heavy:
        return "HEAVY"
    if speed <= moderate:
        return "MODERATE"
    if speed <= normal:
        return "NORMAL"
    return "FAST"


def calculate_eta(distance_km: Any, estimated_speed_kmh: Any) -> dict[str, Any]:
    """Calculate ETA; return an explicit unavailable status when inputs are missing."""
    if distance_km is None or distance_km == "":
        return {"eta_hours": None, "eta_minutes": None, "eta_status": "distance_unavailable"}
    distance = _finite_number(distance_km, "distance_km")
    if distance < 0:
        raise ValueError("distance_km cannot be negative")
    if estimated_speed_kmh is None or estimated_speed_kmh == "":
        return {"eta_hours": None, "eta_minutes": None, "eta_status": "missing_speed"}
    speed = _finite_number(estimated_speed_kmh, "estimated_speed_kmh")
    if speed < 0:
        raise ValueError("estimated_speed_kmh cannot be negative")
    if speed == 0:
        return {"eta_hours": None, "eta_minutes": None, "eta_status": "zero_speed"}
    hours = distance / speed
    return {
        "eta_hours": round(hours, 6),
        "eta_minutes": round(hours * 60, 2),
        "eta_status": "calculated",
    }


def parse_hbase_scan(output: str, *, skip_incomplete: bool = False) -> list[dict[str, Any]]:
    """Parse the HBase shell's scan output into one latest state per row key."""
    rows: dict[str, dict[str, str]] = {}
    for line in output.splitlines():
        match = SCAN_CELL.match(line)
        if not match:
            continue
        field = HBASE_CELLS.get(match.group("column"))
        if field:
            rows.setdefault(match.group("bus_id"), {})[field] = match.group("value")

    optional = {"data_source", "speed", "heading", "accuracy", "tracking_status", "contributor_count", "confidence"}
    required = set(HBASE_CELLS.values()) - optional
    if not rows:
        raise ValueError(f"HBase scan returned no rows for {HBASE_TABLE}")
    result: list[dict[str, Any]] = []
    for bus_id, values in sorted(rows.items()):
        missing = required - values.keys()
        if missing:
            if skip_incomplete:
                continue
            raise ValueError(f"HBase row {bus_id} is missing cells: {sorted(missing)}")
        result.append({
            "bus_id": bus_id,
            "route_id": values["route_id"],
            "latitude": _finite_number(values["latitude"], "latitude"),
            "longitude": _finite_number(values["longitude"], "longitude"),
            "speed": _finite_number(values["speed"], "speed") if values.get("speed") else None,
            "timestamp": values["timestamp"],
            "data_source": values.get("data_source"),
            "heading": _finite_number(values["heading"], "heading") if values.get("heading") else None,
            "accuracy": _finite_number(values["accuracy"], "accuracy") if values.get("accuracy") else None,
            "tracking_status": values.get("tracking_status"),
            "contributor_count": int(values["contributor_count"]) if values.get("contributor_count") else 0,
            "confidence": values.get("confidence"),
        })
    if not result:
        raise ValueError(f"HBase scan contained no complete rows for {HBASE_TABLE}")
    return result


def _hdfs_cat(path: str) -> str:
    result = subprocess.run(
        ["hdfs", "dfs", "-cat", path],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout


def read_hbase_states(*, skip_incomplete: bool = False) -> list[dict[str, Any]]:
    result = subprocess.run(
        ["hbase", "shell", "-n"],
        input=f"scan '{HBASE_TABLE}'\n",
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return parse_hbase_scan(result.stdout, skip_incomplete=skip_incomplete)


def read_historical_averages() -> dict[str, float]:
    averages: dict[str, float] = {}
    for line in _hdfs_cat(HDFS_AVERAGES).splitlines():
        if not line.strip():
            continue
        fields = line.split("\t")
        if len(fields) != 2:
            raise ValueError(f"Unexpected MapReduce average row: {line!r}")
        averages[fields[0]] = _finite_number(fields[1], "historical average speed")
    if not averages:
        raise ValueError("MapReduce average-speed output was empty")
    return averages


def read_cleaned_records() -> list[dict[str, str]]:
    records = list(csv.DictReader(io.StringIO(_hdfs_cat(HDFS_CLEANED))))
    if not records:
        raise ValueError("Cleaned HDFS GPS CSV contained no data rows")
    return records


def build_bus_result(
    state: dict[str, Any],
    historical_average_kmh: float | None,
    config: dict[str, Any],
    *,
    use_current_speed_fallback: bool = False,
) -> dict[str, Any]:
    thresholds = config["traffic_thresholds_kmh"]
    speed = state.get("speed")
    traffic = classify_traffic(speed, thresholds)

    # The verified MapReduce mean is the transparent ETA speed baseline. A
    # current stopped reading takes precedence so history cannot mask a stop.
    if speed is None or speed == "":
        estimated_speed = None
    elif _finite_number(speed, "speed") == 0:
        estimated_speed = 0.0
    elif historical_average_kmh is None:
        estimated_speed = _finite_number(speed, "speed") if use_current_speed_fallback else None
    else:
        estimated_speed = _finite_number(historical_average_kmh, "historical average speed")
        if estimated_speed < 0:
            raise ValueError("historical average speed cannot be negative")

    distances = config["demo_remaining_distance_km_by_route"]
    is_live = str(state.get("data_source") or "").startswith("LIVE CROWD TELEMETRY")
    distance = state.get("remaining_distance_km") if is_live else distances.get(state["route_id"])
    if distance is not None:
        distance = _finite_number(distance, "demo remaining distance")
        if distance < 0:
            raise ValueError("demo remaining distance cannot be negative")
    eta = calculate_eta(distance, estimated_speed)
    data_label = state.get("data_source") or config["data_label"]
    return {
        "bus_id": state["bus_id"],
        "route_id": state["route_id"],
        "latitude": state["latitude"],
        "longitude": state["longitude"],
        "speed": speed,
        "speed_unit": "km/h",
        "timestamp": state["timestamp"],
        "data_label": data_label,
        "tracking_status": state.get("tracking_status") or ("LIVE" if is_live else "DEMO"),
        "contributor_count": int(state.get("contributor_count") or 0),
        "gps_accuracy_m": state.get("accuracy"),
        "heading": state.get("heading"),
        "traffic_level": traffic,
        "estimated_speed_kmh": estimated_speed,
        "estimated_speed_basis": "Current device GPS speed; historical MapReduce average is the normal ETA baseline." if use_current_speed_fallback and historical_average_kmh is None else "Verified MapReduce average by bus; current 0 km/h reading overrides history.",
        "remaining_distance_km": distance,
        "distance_basis": state.get("distance_basis") or ("Hypothetical remaining distance to a demo destination. These values are configuration assumptions, not fields in GPS/HBase and not measured route distances." if is_live else config["demo_distance_disclaimer"]),
        "next_stop": state.get("next_stop"),
        **eta,
    }


def run_engine(config_path: str | Path = DEFAULT_CONFIG) -> dict[str, Any]:
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    # Ignore incomplete operational rows while keeping the standalone parser
    # strict; malformed rows cannot represent a public bus state.
    states = read_hbase_states(skip_incomplete=True)
    averages = read_historical_averages()
    cleaned_rows = read_cleaned_records()
    buses = [
        build_bus_result(state, averages.get(state["bus_id"]), config)
        for state in states
    ]

    # Confirm zero-speed behavior using the actual earlier B104 row from HDFS;
    # HBase intentionally holds only the later state for each bus.
    zero_row = next((
        row for row in cleaned_rows
        if row.get("bus_id") == "B104" and row.get("speed") == "0.0"
    ), None)
    if zero_row is None:
        raise ValueError("Expected actual B104 zero-speed sample was not found in cleaned HDFS CSV")
    zero_state = {
        "bus_id": zero_row["bus_id"],
        "route_id": zero_row["route_id"],
        "latitude": _finite_number(zero_row["latitude"], "latitude"),
        "longitude": _finite_number(zero_row["longitude"], "longitude"),
        "speed": _finite_number(zero_row["speed"], "speed"),
        "timestamp": zero_row["timestamp"],
    }
    zero_result = build_bus_result(zero_state, averages.get("B104"), config)
    source_labels = sorted({bus["data_label"] for bus in buses})
    overall_data_label = source_labels[0] if len(source_labels) == 1 else "MIXED DATA SOURCES: " + " + ".join(source_labels)
    return {
        "data_label": overall_data_label,
        "traffic_thresholds_kmh": config["traffic_thresholds_kmh"],
        "historical_speed_source": HDFS_AVERAGES,
        "historical_average_speed_by_bus": [
            {"bus_id": bus_id, "average_speed_kmh": speed}
            for bus_id, speed in sorted(averages.items())
        ],
        "buses": buses,
        "edge_case_checks": [{
            "description": "Actual earlier B104 cleaned GPS observation; not its latest HBase row.",
            "source_timestamp": zero_result["timestamp"],
            "source_speed_kmh": zero_result["speed"],
            "traffic_level": zero_result["traffic_level"],
            "estimated_speed_kmh": zero_result["estimated_speed_kmh"],
            "eta_hours": zero_result["eta_hours"],
            "eta_minutes": zero_result["eta_minutes"],
            "eta_status": zero_result["eta_status"],
        }],
    }
