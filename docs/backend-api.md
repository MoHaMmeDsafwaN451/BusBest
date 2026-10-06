# Backend and live tracking

This note documents the current Express implementation. The endpoint catalog and request fields are maintained in [api.md](api.md); the architecture and privacy boundaries are in [architecture.md](architecture.md).

## Public map path

`GET /api/live/buses` reads the HBase latest-state table through `scripts/run_live_state.py`, adds active route/stops from MongoDB, and calculates traffic/ETA with the existing Python engine. It skips incomplete HBase rows but keeps strict validation for the low-level parser. The historical full endpoints (`/api/buses`, `/api/routes`, `/api/analytics/summary`) remain available. A short in-process cache is invalidated on telemetry writes. Server startup warms the current-state cache before warming the existing historical report.

The map uses the light endpoint for its initial state, then opens `/ws`. WebSocket sends an aggregate snapshot on connection and state broadcasts after accepted writes or a stop-session reaggregation. The telemetry handler does not read the full HBase table again after the write; it passes that one aggregate through `scripts/calculate_live_bus.py`, which calls the existing Python traffic/ETA engine using route stops and any warmed MapReduce average. The frontend does not call Hive, HDFS, or MapReduce while refreshing the map.

## Contribution sequence

1. A first-visit panel explains location permission. Allowing permission requests a single browser location fix but discards it; it does not create a session or publish a point. Not Now is remembered in local storage.
2. A logged-in USER selects a bus detail page, checks that they are travelling on that bus, and presses Start sharing. The backend creates an authenticated session bound to that bus. This is a user assertion, not proof of vehicle presence.
3. `navigator.geolocation.watchPosition` starts only for this session. Reports include a timestamp, coordinates, accuracy, and optional browser speed/heading. Browser speed converts m/s to km/h. Updates are rate limited by both client and server.
4. Express checks the session owner, active bus and session age; coordinates, accuracy, timestamp, speed, heading, and out-of-range/future observations are rejected. A stop button is always available in the header and contribution panel.
5. Active-session points no more than 2 minutes old and with reported accuracy no worse than 100 m are candidates. Candidate points are centered on median latitude/longitude; points more than `max(0.5 km, 3 * accuracy)` from that center are excluded. Remaining locations are weighted by inverse accuracy squared and exponential age decay (90 s scale). Aggregate speed is the median of valid device speeds or same-session derived speeds, capped at 160 km/h. Confidence is LOW for one contributor, MEDIUM for 2-3, HIGH for 4+; status is LIMITED DATA for one and LIVE for 2+.
6. Accepted observations are appended as individual JSON event records (without account/session/device ID) under `/busbest/raw/telemetry/`. HBase stores the representative bus position and aggregate attributes, never the individual source points. On Stop sharing the precise latest/previous point is cleared from that session; HBase is recomputed from remaining active points, or the public row ages to STALE/NO LIVE DATA.
7. Only aggregate results go to the public API/WebSocket. Admin sees freshness/accuracy/contributor-count/confidence/source but no contributor name, email, session ID, or precise individual point.

## Status and ETA

DEMO means the state came from the prepared simulated dataset. LIVE requires 2+ recent accepted contributors; LIMITED DATA requires one. Once there are no recent reports, the bus becomes STALE and then NO LIVE DATA. The map never manufactures movement.

Traffic classification and ETA use `src/traffic_eta.py`. The live path passes cached MapReduce historical speed when available; otherwise it can use a valid device/derived speed. Route stops are projected onto ordered start-to-destination segments to choose a next stop. ETA distance is straight-line geometry to that stop and is explicitly not road distance. No valid speed, configured stop/distance, or history means ETA unavailable; zero speed means waiting/stopped. These are transparent prototype calculations, not validated transport standards or AI prediction.

## Limitations and privacy

The existing seed buses are simulated. Browser coordinates have not been verified as coming from a vehicle device, and this environment did not submit actual passenger location. Browser geolocation requires permission and a secure context (localhost for development, HTTPS for deployment). Mobile browsers can stop background watches because of OS, battery, browser, and network restrictions. A route user can assert travel but the app cannot verify boarding. Raw opt-in history remains in local HDFS by design; local development has not established production retention, deletion, access auditing, or data-protection compliance.
