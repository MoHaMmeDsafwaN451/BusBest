"""Validation and cleaning for BUSBEST prototype GPS CSV records."""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED_COLUMNS = (
    "bus_id",
    "route_id",
    "user_id",
    "latitude",
    "longitude",
    "timestamp",
    "speed",
)
MAX_SPEED_KMH = 160.0


def _is_missing(value: str | None) -> bool:
    return value is None or not value.strip()


def _as_float(value: str | None) -> float | None:
    if _is_missing(value):
        return None
    try:
        number = float(value.strip())
    except ValueError:
        return None
    return number if number == number and abs(number) != float("inf") else None


def _validate(row: dict[str, str | None]) -> tuple[dict[str, str] | None, set[str]]:
    reasons: set[str] = set()

    for column in ("bus_id", "route_id", "user_id", "timestamp"):
        if _is_missing(row.get(column)):
            reasons.add("missing_value_records")

    latitude = _as_float(row.get("latitude"))
    longitude = _as_float(row.get("longitude"))
    if latitude is None or longitude is None or not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        reasons.add("invalid_coordinate_records")

    speed = _as_float(row.get("speed"))
    if speed is None or not (0 <= speed <= MAX_SPEED_KMH):
        reasons.add("invalid_speed_records")

    timestamp = row.get("timestamp")
    if not _is_missing(timestamp):
        try:
            datetime.fromisoformat(timestamp.strip())
        except ValueError:
            reasons.add("missing_value_records")

    if reasons:
        return None, reasons

    cleaned = {column: (row[column] or "").strip() for column in REQUIRED_COLUMNS}
    cleaned["latitude"] = str(latitude)
    cleaned["longitude"] = str(longitude)
    cleaned["speed"] = str(speed)
    return cleaned, reasons


def clean_csv(input_path: str | Path, output_path: str | Path, summary_path: str | Path) -> dict[str, int]:
    """Clean input CSV, write accepted unique rows and return summary counts."""
    input_path = Path(input_path)
    output_path = Path(output_path)
    summary_path = Path(summary_path)

    with input_path.open("r", newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise ValueError("Input CSV is empty or has no header")
        missing_columns = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing_columns:
            raise ValueError(f"Input CSV is missing required columns: {', '.join(missing_columns)}")

        summary: dict[str, int] = {
            "total_input_records": 0,
            "valid_records": 0,
            "invalid_records": 0,
            "duplicate_records": 0,
            "missing_value_records": 0,
            "invalid_coordinate_records": 0,
            "invalid_speed_records": 0,
            "final_cleaned_records": 0,
        }
        seen: set[tuple[str, ...]] = set()
        accepted: list[dict[str, str]] = []

        for row in reader:
            summary["total_input_records"] += 1
            key = tuple((row.get(column) or "").strip() for column in REQUIRED_COLUMNS)
            if key in seen:
                summary["duplicate_records"] += 1
                continue
            seen.add(key)

            cleaned, reasons = _validate(row)
            if reasons:
                summary["invalid_records"] += 1
                for reason in reasons:
                    summary[reason] += 1
            else:
                accepted.append(cleaned)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(accepted)

    summary["valid_records"] = len(accepted)
    summary["final_cleaned_records"] = len(accepted)
    with summary_path.open("w", encoding="utf-8") as destination:
        json.dump(summary, destination, indent=2)
        destination.write("\n")
    return summary
