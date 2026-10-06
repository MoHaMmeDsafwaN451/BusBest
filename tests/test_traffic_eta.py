"""Tests for BUSBEST's configurable traffic classification and ETA math."""

from pathlib import Path
import sys
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.traffic_eta import calculate_eta, classify_traffic, parse_hbase_scan  # noqa: E402


THRESHOLDS = {
    "heavy_max_inclusive": 15,
    "moderate_max_inclusive": 30,
    "normal_max_inclusive": 60,
    "maximum_valid_speed": 160,
}


class TrafficClassificationTests(unittest.TestCase):
    def test_demo_speed_bands_and_boundaries(self) -> None:
        cases = (
            (0, "HEAVY"), (15, "HEAVY"), (15.1, "MODERATE"),
            (30, "MODERATE"), (30.1, "NORMAL"), (60, "NORMAL"),
            (60.1, "FAST"), (160, "FAST"), (None, "UNKNOWN"),
        )
        for speed, expected in cases:
            with self.subTest(speed=speed):
                self.assertEqual(classify_traffic(speed, THRESHOLDS), expected)

    def test_rejects_invalid_speed(self) -> None:
        for speed in (-0.1, 160.1, float("nan"), "not-a-speed"):
            with self.subTest(speed=speed), self.assertRaises(ValueError):
                classify_traffic(speed, THRESHOLDS)


class EtaCalculationTests(unittest.TestCase):
    def test_calculates_km_per_hour_as_minutes(self) -> None:
        self.assertEqual(calculate_eta(5, 30), {
            "eta_hours": 0.166667,
            "eta_minutes": 10.0,
            "eta_status": "calculated",
        })

    def test_missing_zero_and_invalid_inputs(self) -> None:
        self.assertEqual(calculate_eta(5, 0)["eta_status"], "zero_speed")
        self.assertIsNone(calculate_eta(5, 0)["eta_minutes"])
        self.assertEqual(calculate_eta(None, 20)["eta_status"], "distance_unavailable")
        self.assertEqual(calculate_eta(5, None)["eta_status"], "missing_speed")
        for distance, speed in ((-1, 20), (float("inf"), 20), ("bad", 20), (5, -1)):
            with self.subTest(distance=distance, speed=speed), self.assertRaises(ValueError):
                calculate_eta(distance, speed)


class HBaseParsingTests(unittest.TestCase):
    def test_live_read_can_skip_incomplete_rows_while_strict_parser_rejects_them(self) -> None:
        output = """B100 column=info:route_id, timestamp=1, value=R01
B100 column=location:latitude, timestamp=1, value=9.59
B100 column=location:longitude, timestamp=1, value=76.52
B100 column=telemetry:timestamp, timestamp=1, value=2026-10-06T10:00:00Z
TEST-PARTIAL column=telemetry:tracking_status, timestamp=1, value=LIVE
"""
        with self.assertRaisesRegex(ValueError, "TEST-PARTIAL"):
            parse_hbase_scan(output)
        buses = parse_hbase_scan(output, skip_incomplete=True)
        self.assertEqual([bus["bus_id"] for bus in buses], ["B100"])
        self.assertEqual(buses[0]["route_id"], "R01")


if __name__ == "__main__":
    unittest.main()
