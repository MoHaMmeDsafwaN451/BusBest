"""Automated tests for BUSBEST's local GPS CSV cleaner."""

import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.cleaning import clean_csv  # noqa: E402


class CleanCsvTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base = Path(self.temp_dir.name)
        self.input_path = self.base / "input.csv"
        self.output_path = self.base / "cleaned.csv"
        self.summary_path = self.base / "summary.json"
        self.fields = ["bus_id", "route_id", "user_id", "latitude", "longitude", "timestamp", "speed"]

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_rows(self, rows: list[dict[str, str]]) -> None:
        with self.input_path.open("w", newline="", encoding="utf-8") as output:
            writer = csv.DictWriter(output, fieldnames=self.fields)
            writer.writeheader()
            writer.writerows(rows)

    def valid_row(self, **changes: str) -> dict[str, str]:
        row = {
            "bus_id": "B001",
            "route_id": "R01",
            "user_id": "U001",
            "latitude": "9.5916",
            "longitude": "76.5222",
            "timestamp": "2026-10-01T10:00:00",
            "speed": "28",
        }
        row.update(changes)
        return row

    def test_deduplicates_and_reports_each_rejection_type(self) -> None:
        self.write_rows([
            self.valid_row(),
            self.valid_row(),
            self.valid_row(user_id="", bus_id="B002"),
            self.valid_row(latitude="91", bus_id="B003"),
            self.valid_row(speed="200", bus_id="B004"),
        ])

        summary = clean_csv(self.input_path, self.output_path, self.summary_path)

        self.assertEqual(summary, {
            "total_input_records": 5,
            "valid_records": 1,
            "invalid_records": 3,
            "duplicate_records": 1,
            "missing_value_records": 1,
            "invalid_coordinate_records": 1,
            "invalid_speed_records": 1,
            "final_cleaned_records": 1,
        })
        with self.output_path.open(newline="", encoding="utf-8") as source:
            cleaned = list(csv.DictReader(source))
        self.assertEqual(len(cleaned), 1)
        with self.summary_path.open(encoding="utf-8") as source:
            self.assertEqual(json.load(source), summary)

    def test_rejects_missing_required_columns(self) -> None:
        self.input_path.write_text("bus_id,route_id\nB001,R01\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing required columns"):
            clean_csv(self.input_path, self.output_path, self.summary_path)


if __name__ == "__main__":
    unittest.main()
