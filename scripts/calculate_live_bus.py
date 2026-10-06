"""Run the existing traffic/ETA engine for one already-aggregated live bus state."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.run_live_state import decode_payload, enrich_live_state
from src.traffic_eta import DEFAULT_CONFIG


def main() -> int:
    payload = decode_payload(sys.argv[1])
    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    result = enrich_live_state(payload["state"], payload.get("route"), payload.get("historicalAverageByBus", {}), config)
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
