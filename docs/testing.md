# Final application validation

Validation performed on 2026-10-06 against the BUSBEST development environment. Demo bus observations are **SIMULATED DEMO DATA**. No genuine passenger GPS telemetry was submitted or written to HDFS/HBase during this validation.

## Results

- Backend automated suite: `npm.cmd test` — **7 passed, 0 failed**. Covers aggregation and outlier/freshness cases, the visitor live and legacy endpoints, simulated-data labels, registration/login, ownership and role checks, and websocket snapshot/update behavior. After removing a duplicate Mongoose index declaration, the suite passed again with no duplicate-index warning.
- Persistent-service integration: `npm.cmd run test:integration` — **25 checks passed** against the running API and existing MongoDB/WSL data services. Verified visitor health and map coordinates, five simulated states, historical MapReduce summary, USER registration/login and B106 creation, duplicate rejection, USER admin denial, ADMIN listing/activation/system/tracking access, and that admin tracking omits contributor coordinates and identity. Its temporary user, admin, and B106 fixtures are removed in `finally`.
- Read-only MongoDB cleanup check after integration: no `smoke-*` users, no `B106`, and no test-named buses/routes remained. The database then contained 2 users, 1 bus, 1 route, and 0 reports overall; these remaining records did not match the smoke fixture names and were left untouched.
- Frontend: `npm.cmd run build` — Vite 7.3.6 transformed 59 modules and built successfully. Admin and user page chunks are split from the main bundle.
- Windows Python suite: `python -m unittest discover -s tests -p "test_*.py"` — **12 passed**. Ubuntu Python suite also passed **12 tests**.
- Big Data regression: HDFS cleaned CSV returned 11 lines including its header (10 data records). Existing MapReduce output remained:

  | Bus | Historical average speed (km/h) |
  | --- | ---: |
  | B101 | 29.67 |
  | B102 | 25.00 |
  | B103 | 20.00 |
  | B104 | 11.00 |
  | B105 | 35.00 |

- Hive read-only regression: `busbest_gps_records` returned 10 rows and the same average speed by bus as the MapReduce output above. A temporary HiveServer2 was stopped after the query. Hive/SLF4J emitted binding and terminal-size warnings, but both queries completed successfully.
- Existing Python traffic/ETA pipeline ran against HBase and the available historical output. All five prepared rows retained their SIMULATED DEMO label. The existing B104 zero-speed case remains classified as stopped/heavy with ETA unavailable; no live data was mixed into those rows.
- The backend stop-session test updates status/count/confidence qualifiers on the pre-existing incomplete `TEST-M3-BUS` HBase test row through the real persistence adapter. It does not write coordinates or raw telemetry history; B101–B105 demo rows and the cleaned HDFS CSV were not modified.
- Public endpoint timing from the final backend run, measured sequentially once in this WSL/HBase environment: legacy full bus endpoint **11,401 ms**, new lightweight live endpoint cold **7,701 ms** (about 32% lower in this run), cached live **2.2 ms**. This is a single local timing sample, not a benchmark; cold live data still takes about eight seconds here and deserves further measurement/optimization.
- Git ignore check confirmed `backend/.env`, backend/frontend `node_modules`, and `frontend/dist` are ignored. No commit was created.

## Validation limits

- No physical phone/browser location permission was requested, and no valid real-device GPS event was injected. Consent UX, session ownership, input rejection, aggregation, privacy response shape, and WebSocket updates were tested in software; actual geolocation behavior and a successful real telemetry write through HDFS/HBase still require an opted-in device session.
- The available computer-use environment had no browser surface, so interactive desktop/mobile visual QA was unavailable. Production compilation passed; responsive breakpoints and theme/language implementations were not visually verified in a browser.
- WSL local HDFS/HBase/Hive results are regression checks, not evidence of a cloud production deployment.
- A pre-existing incomplete `TEST-M3-BUS` HBase row was observed during prior regression inspection. It was preserved; incomplete rows are skipped by the tolerant pipeline reader, while the strict parser still rejects incomplete rows.
