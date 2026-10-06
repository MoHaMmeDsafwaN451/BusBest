"""Append consented bus telemetry to HDFS raw history and update HBase latest state."""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TABLE = "busbest_bus_state"
RAW_DIR = "/busbest/raw/telemetry"
BUS_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
HBASE_TIMESTAMP_RE = re.compile(r"column=telemetry:timestamp, timestamp=\d+, value=([^\r\n]+)")


def parse_time(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO-8601 string with a timezone")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def parse_stored_time(value: str) -> datetime:
    try:
        return parse_time(value)
    except ValueError:
        # The verified simulated CSV/HBase rows predate this endpoint and use
        # timezone-naive ISO strings; interpret those demo timestamps as UTC.
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        raise


def finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be a finite number") from error
    if not math.isfinite(result):
        raise ValueError(f"{field} must be a finite number")
    return result


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    bus_id = payload.get("bus_id")
    route_id = payload.get("route_id")
    if not isinstance(bus_id, str) or not BUS_ID_RE.fullmatch(bus_id):
        raise ValueError("bus_id is invalid")
    if not isinstance(route_id, str) or not BUS_ID_RE.fullmatch(route_id):
        raise ValueError("route_id is invalid")
    latitude = finite_number(payload.get("latitude"), "latitude")
    longitude = finite_number(payload.get("longitude"), "longitude")
    speed = None if payload.get("speed") is None else finite_number(payload.get("speed"), "speed")
    heading = None if payload.get("heading") is None else finite_number(payload.get("heading"), "heading")
    accuracy = finite_number(payload.get("accuracy"), "accuracy")
    if not -90 <= latitude <= 90:
        raise ValueError("latitude must be between -90 and 90")
    if not -180 <= longitude <= 180:
        raise ValueError("longitude must be between -180 and 180")
    if speed is not None and not 0 <= speed <= 160:
        raise ValueError("speed must be between 0 and 160 km/h")
    if heading is not None and not 0 <= heading <= 360:
        raise ValueError("heading must be between 0 and 360 degrees")
    if not 0 <= accuracy <= 100:
        raise ValueError("accuracy must be between 0 and 100 metres")
    observed_at = parse_time(payload.get("timestamp"))
    if payload.get("consent") is not True:
        raise ValueError("explicit consent is required")
    return {
        "bus_id": bus_id,
        "route_id": route_id,
        "latitude": latitude,
        "longitude": longitude,
        "speed": speed,
        "heading": heading,
        "accuracy": accuracy,
        "timestamp": observed_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "consent": True,
        "source": "browser_geolocation_contribution",
        "data_label": "LIVE CROWD TELEMETRY",
        "source_device_verified": False,
    }


def hbase_literal(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def decode_payload(encoded: str) -> dict[str, Any]:
    return json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8"))


def run(command: list[str], *, input_text: str | None = None) -> str:
    result = subprocess.run(command, input=input_text, check=True, capture_output=True, text=True, encoding="utf-8")
    return result.stdout


def ingest(payload: dict[str, Any], aggregate: dict[str, Any]) -> dict[str, Any]:
    row = validate(payload)
    state = validate({**aggregate, "consent": True})
    state["data_label"] = "LIVE CROWD TELEMETRY"
    event_id = str(uuid.uuid4())
    run(["hdfs", "dfs", "-mkdir", "-p", RAW_DIR])
    fd, temp_path = tempfile.mkstemp(prefix="busbest-telemetry-", suffix=".json")
    remote_path = f"{RAW_DIR}/{event_id}.json"
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({**row, "event_id": event_id}, output, separators=(",", ":"))
            output.write("\n")
        run(["hdfs", "dfs", "-put", temp_path, remote_path])
    finally:
        Path(temp_path).unlink(missing_ok=True)

    current_output = run(["hbase", "shell", "-n"], input_text=f"get {hbase_literal(TABLE)}, {hbase_literal(state['bus_id'])}\n")
    current_timestamp = HBASE_TIMESTAMP_RE.search(current_output)
    if current_timestamp and parse_stored_time(current_timestamp.group(1)) > parse_time(state["timestamp"]):
        return {"event_id": event_id, "raw_hdfs_path": remote_path, "state_updated": False, "reason": "not_newer_than_current_state", "data_label": state["data_label"]}

    write_hbase_state(state, aggregate["status"], aggregate["contributorCount"], aggregate["confidence"])
    return {"event_id": event_id, "raw_hdfs_path": remote_path, "state_updated": True, "reason": "aggregated_state_updated", "data_label": state["data_label"]}


def write_hbase_state(state: dict[str, Any], status: str, contributor_count: int, confidence: str) -> None:
    cells = {
        "info:route_id": state["route_id"],
        "info:data_source": state["data_label"],
        "location:latitude": str(state["latitude"]),
        "location:longitude": str(state["longitude"]),
        "telemetry:speed": "" if state["speed"] is None else str(state["speed"]),
        "telemetry:timestamp": state["timestamp"],
        "telemetry:accuracy": str(state["accuracy"]),
        "telemetry:heading": "" if state["heading"] is None else str(state["heading"]),
        "telemetry:tracking_status": status,
        "telemetry:contributor_count": str(contributor_count),
        "telemetry:confidence": confidence,
    }
    commands = [
        f"put {hbase_literal(TABLE)}, {hbase_literal(state['bus_id'])}, {hbase_literal(column)}, {hbase_literal(value)}"
        for column, value in cells.items()
    ]
    run(["hbase", "shell", "-n"], input_text="\n".join(commands) + "\n")


def persist_aggregate(payload: dict[str, Any]) -> dict[str, Any]:
    bus_id = payload.get("bus_id")
    if not isinstance(bus_id, str) or not BUS_ID_RE.fullmatch(bus_id):
        raise ValueError("bus_id is invalid")
    aggregate = payload.get("aggregate") or {}
    state = aggregate.get("state")
    if state:
        validated = validate({**state, "bus_id": bus_id, "route_id": payload["route_id"], "consent": True})
        write_hbase_state(validated, aggregate["status"], aggregate["contributorCount"], aggregate["confidence"])
    else:
        status = aggregate.get("status", "NO LIVE DATA")
        count = aggregate.get("contributorCount", 0)
        confidence = aggregate.get("confidence", "LOW")
        commands = [
            f"put {hbase_literal(TABLE)}, {hbase_literal(bus_id)}, {hbase_literal(column)}, {hbase_literal(value)}"
            for column, value in {
                "telemetry:tracking_status": status,
                "telemetry:contributor_count": str(count),
                "telemetry:confidence": confidence,
            }.items()
        ]
        run(["hbase", "shell", "-n"], input_text="\n".join(commands) + "\n")
    return {"bus_id": bus_id, "state_updated": bool(state), "tracking_status": aggregate.get("status", "NO LIVE DATA")}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload-base64")
    parser.add_argument("--aggregate-only-base64")
    args = parser.parse_args()
    if bool(args.payload_base64) == bool(args.aggregate_only_base64):
        parser.error("provide exactly one payload mode")
    if args.aggregate_only_base64:
        payload = decode_payload(args.aggregate_only_base64)
        result = persist_aggregate(payload)
    else:
        payload = decode_payload(args.payload_base64)
        result = ingest(payload["observation"], payload["aggregate"])
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"Telemetry ingestion failed: {error}", file=sys.stderr)
        raise SystemExit(1)
