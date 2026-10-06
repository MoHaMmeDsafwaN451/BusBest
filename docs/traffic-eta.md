# BUSBEST Traffic Classification and ETA Demo

## Scope and data sources

This milestone runs a small local Python engine against the existing verified data. The GPS source is **SIMULATED DEMO DATA**, not real passenger GPS data.

- Current bus location, route, speed, and source timestamp: latest rows in the existing HBase table `busbest_bus_state`.
- Historical speed baseline: verified MapReduce output at `/busbest/processed/average_speed_by_bus_milestone2/part-r-00000`.
- The cleaned HDFS CSV is read only to verify B104's earlier valid zero-speed observation. No datasets or existing HDFS outputs were changed.

HBase stores only each bus's latest row, so B104's latest HBase speed is 22 km/h. Its earlier cleaned CSV row at `2026-10-01T10:02:00` has speed `0.0` km/h; the next row at `10:02:09` is the latest HBase value.

## Traffic classification

The thresholds in `config/traffic_eta_demo.json` are configurable demo values, not scientifically validated traffic standards:

| Measured speed | Classification |
|---|---|
| 0 through 15 km/h | HEAVY |
| Above 15 through 30 km/h | MODERATE |
| Above 30 through 60 km/h | NORMAL |
| Above 60 through 160 km/h | FAST |
| Missing speed | UNKNOWN |

Negative, non-finite, or above-160 speeds are rejected as invalid; 160 km/h is the existing cleaner's maximum accepted speed. Classification uses the latest HBase `speed` value, not an average.

## Estimated speed and ETA

For a moving bus, `estimated_speed_kmh` uses that bus's verified MapReduce average speed. This is a simple historical baseline, not a traffic prediction model. If the current measured speed is 0, the current stop overrides history and estimated speed is 0 km/h.

The cleaned GPS schema has no remaining-route distance or destination. To demonstrate the formula without presenting invented distances as GPS measurements, `config/traffic_eta_demo.json` contains an explicitly labelled **hypothetical demo configuration**: R01=5 km, R02=8 km, R03=3 km, R04=4 km, and R05=6 km remaining to a demo destination. These are assumptions selected for this demonstration, not verified route lengths. Each output includes `distance_basis` to preserve that distinction.

Calculation uses kilometres and km/h:

```text
ETA hours = configured remaining distance in km / estimated speed in km/h
ETA minutes = ETA hours * 60
```

No ETA is returned when distance is absent, speed is missing, or speed is zero. Negative, non-numeric, NaN, or infinite inputs raise a clear `ValueError`; they are not silently converted into a result. A zero distance with a positive speed yields a zero ETA.

## Implementation and commands

- `src/traffic_eta.py` contains classification, input validation, HBase scan parsing, HDFS MapReduce average loading, and ETA calculation.
- `scripts/run_traffic_eta.py` reads current HBase/HDFS data and prints JSON.
- `config/traffic_eta_demo.json` keeps traffic thresholds and hypothetical remaining distances configurable and visibly separate from observations.
- `tests/test_traffic_eta.py` checks classification boundaries and ETA edge cases.

Run in Ubuntu with the already configured Java/Hadoop/HBase environment:

```bash
cd /mnt/c/Users/ZABEER\ KARATT/BUSBEST
python3 -m unittest tests/test_traffic_eta.py -v
python3 scripts/run_traffic_eta.py
```

## Actual verification

The live engine read five rows from HBase, read the five verified MapReduce averages, and emitted these results:

| Bus | Route | HBase speed km/h | MapReduce estimated speed km/h | Traffic | Demo distance km | ETA hours | ETA minutes | Status |
|---|---|---:|---:|---|---:|---:|---:|---|
| B101 | R01 | 30.0 | 29.67 | MODERATE | 5.0 | 0.16852 | 10.11 | calculated |
| B102 | R02 | 26.0 | 25.0 | MODERATE | 8.0 | 0.32 | 19.2 | calculated |
| B103 | R03 | 21.0 | 20.0 | MODERATE | 3.0 | 0.15 | 9.0 | calculated |
| B104 | R04 | 22.0 | 11.0 | MODERATE | 4.0 | 0.363636 | 21.82 | calculated |
| B105 | R05 | 35.0 | 35.0 | NORMAL | 6.0 | 0.171429 | 10.29 | calculated |

All rows included their actual HBase latitude/longitude and source timestamp. Each JSON ETA row also carried the demo-distance disclaimer and historical-speed basis. No latest state was classified FAST; the FAST branch was covered by the configured boundary test at 60.1 km/h.

The engine separately read the actual earlier B104 CSV observation and returned:

```json
{
  "source_timestamp": "2026-10-01T10:02:00",
  "source_speed_kmh": 0.0,
  "traffic_level": "HEAVY",
  "estimated_speed_kmh": 0.0,
  "eta_hours": null,
  "eta_minutes": null,
  "eta_status": "zero_speed"
}
```

The actual test command `python3 -m unittest tests/test_traffic_eta.py -v` completed **4 tests, OK**. Coverage included all four traffic classes and their boundaries, invalid speeds, the distance/speed formula, missing distance, missing speed, zero speed, and invalid ETA inputs.

These ETAs are calculation demonstrations using simulated positions and explicit demo distances. They must not be described as live or real-world passenger ETAs.
