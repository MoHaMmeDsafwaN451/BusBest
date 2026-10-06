# BUSBEST API reference

Local base URL: `http://127.0.0.1:3001/api`. WebSocket URL: `ws://127.0.0.1:3001/ws`.

## Visitor endpoints

| Method/path | Result |
| --- | --- |
| `GET /health` | Express health. |
| `GET /live/buses` | Lightweight latest bus state, route stops, status/source, traffic and available ETA inputs. HBase + route metadata only; short cache. |
| `GET /buses`, `GET /buses/:busId`, `GET /routes` | Existing full Python/HBase/HDFS/MapReduce-backed views. May take longer than `/live/buses`; retained for compatibility. |
| `GET /registry/routes` | Active MongoDB application routes and ordered stops. |
| `GET /analytics/summary` | Existing current traffic and historical MapReduce average output. Not used by the public map refresh path. |
| `WS /ws` | Public aggregate snapshot on connect; server broadcasts aggregate `bus_state` updates. No contributor identity or individual coordinates. |

Each bus object from `/live/buses` uses the existing pipeline fields (`bus_id`, `route_id`, `latitude`, `longitude`, `speed`, `timestamp`, `traffic_level`, `eta_minutes`, `eta_status`) plus `tracking_status`, `contributor_count`, `confidence`, `gps_accuracy_m`, `next_stop`, route label, and `data_label`. When there is no live fix, coordinates and ETA are null/unavailable. `DEMO` rows keep the explicit simulated source label.

## Authenticated user endpoints

| Method/path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Public/public/JWT | Account creation, JWT login, safe current profile. Passwords are bcrypt hashed. |
| `GET /my/buses` | USER/ADMIN | Owned/permitted registered buses. |
| `POST /buses`, `PUT /buses/:busId`, `DELETE /buses/:busId` | USER/owner/admin | Application bus registry. New buses remain pending review. |
| `POST /reports`, `GET /reports/mine` | JWT | Submit/list own issue reports. |
| `POST /tracking-sessions` | USER JWT | Start a bus session with `{ "bus_id": "B101", "consent": true }`; the session binds to an active application bus or known HBase bus. |
| `GET /tracking-sessions/current` | USER JWT | Return the caller's active session without precise coordinates. |
| `POST /tracking-sessions/:sessionId/stop` | Session owner | Stop collection and clear that session's precise recent points. |
| `POST /telemetry` | Active session owner | Submit one device location observation. The body contains `tracking_session_id`, numeric latitude/longitude, optional speed (km/h) and heading, accuracy (m), and timezone-aware ISO timestamp. `bus_id` is not accepted from the client. |

Telemetry is rejected unless the session is active and belongs to the authenticated user. Coordinates, speed, heading, timestamp, accuracy, bus status, timestamp window, and request frequency are validated server-side. The server aggregates recent quality-accepted session observations, stores raw history in HDFS and only aggregate latest state in HBase, then uses the existing Python traffic/ETA engine to enrich a one-bus WebSocket update. The event path does not scan HBase again, query Hive, or run MapReduce after the write.

## Admin endpoints

All require an ADMIN JWT.

| Method/path | Purpose |
| --- | --- |
| `GET /admin/users`, `PUT /admin/users/:id/role`, `DELETE /admin/users/:id` | User management. |
| `GET /admin/buses` | Bus registry and review. `PUT /buses/:busId` changes status/route/managers. |
| `GET/POST /admin/routes`, `PUT/DELETE /admin/routes/:routeId` | Create/edit/archive routes and ordered stops. Stop IDs are unique per route; sequence is normalized from input order. A route with assigned buses cannot be deleted; the API returns 409 and recommends archive/reassignment. |
| `GET /admin/tracking` | Tracking status, recent contributor counts, timestamps, GPS accuracy, speed, data source, confidence. Does not expose passenger identity or precise contributor locations. |
| `GET /admin/reports`, `PUT /admin/reports/:id` | Review community reports. |
| `GET /analytics/summary`, `GET /admin/system` | Existing historical analytics view (legacy path retained) and local service status. Hive is reported as unprobed unless separately checked. |

Visitor/user/admin page protection is also enforced in Express; hiding a frontend link is not treated as authorization. Tokens are kept in session storage, sent as Bearer tokens, and cleared on 401/logout. Backend secrets never go to the frontend.

Typical status codes: 400 validation/consent error, 401 unauthenticated/expired token, 403 role/session-owner failure, 404 missing bus/session/route, 409 duplicate/state conflict or route in use, 429 telemetry rate limit, 503 unavailable MongoDB or local storage. Exact error bodies are in `backend/src/routes/`.
