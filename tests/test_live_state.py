import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_live_state.py"
SPEC = importlib.util.spec_from_file_location("busbest_live_state", MODULE_PATH)
live_state = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(live_state)


class NextStopTests(unittest.TestCase):
    def setUp(self):
        self.stops = [
            {"stopId": "S1", "name": "Start", "latitude": 9.59, "longitude": 76.52, "sequence": 1},
            {"stopId": "S2", "name": "Middle", "latitude": 9.60, "longitude": 76.52, "sequence": 2},
            {"stopId": "S3", "name": "End", "latitude": 9.61, "longitude": 76.52, "sequence": 3},
        ]

    def test_selects_ordered_destination_of_nearest_route_segment(self):
        state = {"latitude": 9.595, "longitude": 76.52}
        self.assertEqual(live_state.select_next_stop(state, self.stops)["stopId"], "S2")

    def test_handles_route_end_and_missing_stops(self):
        at_end = {"latitude": 9.612, "longitude": 76.52}
        self.assertEqual(live_state.select_next_stop(at_end, self.stops)["stopId"], "S3")
        self.assertIsNone(live_state.select_next_stop(at_end, []))

    def test_advances_to_following_stop_when_bus_is_at_a_stop(self):
        at_middle = {"latitude": 9.60, "longitude": 76.52}
        self.assertEqual(live_state.next_stop_with_arrival_check(at_middle, self.stops)["stopId"], "S3")

    def test_reports_straight_line_distance(self):
        start = {"latitude": 9.59, "longitude": 76.52}
        end = {"latitude": 9.60, "longitude": 76.52}
        self.assertGreater(live_state.distance_km(start, end), 1)
        self.assertLess(live_state.distance_km(start, end), 2)

    def test_runs_existing_traffic_and_eta_engine_on_aggregate(self):
        from src.traffic_eta import DEFAULT_CONFIG
        import json

        state = {"bus_id": "TEST", "route_id": "R-TEST", "latitude": 9.595, "longitude": 76.52,
                 "speed": 30, "timestamp": "2026-10-06T10:00:00Z", "accuracy": 12,
                 "source": "LIVE CROWD TELEMETRY", "contributorCount": 2}
        route = {"routeId": "R-TEST", "name": "Test route", "start": "Start", "destination": "End", "stops": self.stops}
        config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
        result = live_state.enrich_live_state(state, route, {"TEST": 20}, config)
        self.assertEqual(result["data_label"], "LIVE CROWD TELEMETRY")
        self.assertEqual(result["next_stop"]["stop_id"], "S2")
        self.assertIsNotNone(result["eta_minutes"])
        self.assertEqual(result["estimated_speed_kmh"], 20)


if __name__ == "__main__":
    unittest.main()
