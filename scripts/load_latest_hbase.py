"""Load the latest GPS observation per bus from HDFS into the HBase demo table.

The source remains in HDFS unchanged. `user_id` is intentionally not stored.
"""

from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
from datetime import datetime

HDFS_INPUT = "/busbest/cleaned/gps_cleaned.csv"
TABLE = "busbest_bus_state"
REQUIRED = {"bus_id", "route_id", "latitude", "longitude", "timestamp", "speed"}
CELLS = (
    ("info:route_id", "route_id"),
    ("info:data_source", "data_source"),
    ("location:latitude", "latitude"),
    ("location:longitude", "longitude"),
    ("telemetry:speed", "speed"),
    ("telemetry:timestamp", "timestamp"),
)


def latest_rows() -> list[dict[str, str]]:
    result = subprocess.run(
        ["hdfs", "dfs", "-cat", HDFS_INPUT],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    reader = csv.DictReader(io.StringIO(result.stdout))
    if not reader.fieldnames or not REQUIRED.issubset(reader.fieldnames):
        raise ValueError(f"Unexpected HDFS CSV header: {reader.fieldnames!r}")

    latest: dict[str, tuple[datetime, dict[str, str]]] = {}
    for line_number, row in enumerate(reader, start=2):
        if any(not row.get(column) for column in REQUIRED):
            raise ValueError(f"Missing required field at CSV line {line_number}")
        observed_at = datetime.fromisoformat(row["timestamp"])
        previous = latest.get(row["bus_id"])
        if previous is None or observed_at > previous[0]:
            latest[row["bus_id"]] = (observed_at, row)
    return [entry[1] for _, entry in sorted(latest.items())]


def hbase_literal(value: str) -> str:
    """Quote CSV text as a JRuby single-quoted HBase shell string."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--show-latest",
        action="store_true",
        help="print the selected source rows without writing to HBase",
    )
    args = parser.parse_args()
    rows = latest_rows()

    if args.show_latest:
        print("bus_id,route_id,latitude,longitude,timestamp,speed")
        for row in rows:
            print(",".join(row[key] for key in (
                "bus_id", "route_id", "latitude", "longitude", "timestamp", "speed"
            )))
        return 0

    for row in rows:
        row["data_source"] = "SIMULATED DEMO GPS DATA"
    commands = [
        f"put {hbase_literal(TABLE)}, {hbase_literal(row['bus_id'])}, "
        f"{hbase_literal(column)}, {hbase_literal(row[field])}"
        for row in rows
        for column, field in CELLS
    ]
    result = subprocess.run(
        ["hbase", "shell", "-n"],
        input="\n".join(commands) + "\n",
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode:
        return result.returncode
    print(f"Loaded {len(rows)} latest bus rows from {HDFS_INPUT} into {TABLE}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"HBase load failed: {error}", file=sys.stderr)
        raise SystemExit(1)
