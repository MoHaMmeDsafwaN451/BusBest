"""Command line entry point for the BUSBEST GPS cleaner."""

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.cleaning import clean_csv  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and clean BUSBEST GPS CSV data.")
    parser.add_argument("--input", type=Path, default=PROJECT_ROOT / "data/raw/simulated_gps.csv")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "data/cleaned/gps_cleaned.csv")
    parser.add_argument("--summary", type=Path, default=PROJECT_ROOT / "data/cleaned/cleaning_summary.json")
    args = parser.parse_args()

    summary = clean_csv(args.input, args.output, args.summary)
    print(f"Cleaned CSV: {args.output}")
    print(f"Summary JSON: {args.summary}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
