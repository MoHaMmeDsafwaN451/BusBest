"""Run the BUSBEST traffic and ETA demo against live HBase and HDFS outputs."""

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.traffic_eta import DEFAULT_CONFIG, run_engine  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = parser.parse_args()
    print(json.dumps(run_engine(args.config), indent=2, sort_keys=False))


if __name__ == "__main__":
    main()
