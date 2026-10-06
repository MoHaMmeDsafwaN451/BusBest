# BUSBEST architecture

## Crowdsourced bus state

```text
Visitor: browse/search/map                 Admin: operational views
                  |                                      |
Passenger USER -- login + explicit consent               |
                  |                                      |
       browser/device Geolocation API                     |
                  | POST /api/telemetry                   |
                  v                                      |
        Express validation + active session               |
                  |                                      |
        recent GPS quality filtering                      |
        accuracy/recency weighted aggregation             |
            /                     \                       |
 HBase aggregated latest state   HDFS raw event history  |
            |                       |                    |
            |                 MapReduce -> Hive           |
            |                       |                    |
            +---- Python traffic/ETA engine <-------------+
                  |
        HTTP live endpoint + WebSocket
                  |
            React + Leaflet map

MongoDB: users, buses, routes/stops, reports, tracking-session metadata.
```

The web map uses `GET /api/live/buses`, which reads current HBase rows and MongoDB route metadata. It does not wait for Hive, HDFS history, or MapReduce. The server keeps a short in-memory cache, warms it in the background, and invalidates it on accepted telemetry. WebSocket sends an initial aggregate snapshot and broadcasts updated aggregate bus state. The existing full analytics endpoint remains available to dashboards; it is not called for each map refresh.

## Data boundaries

- The five prepared bus rows and the cleaned GPS CSV are **SIMULATED DEMO DATA**. They are not real passengers, vehicles, or live telemetry.
- The first-visit location panel explains browser location. Allowing location only records the browser permission choice; it never starts sharing.
- A signed-in USER/passenger starts a bus-specific session only after affirming that they are travelling on the selected bus and choosing **Start sharing**. Location is watched only while that session is running. Stop sharing clears the browser watch and removes that session's precise latest/previous point from MongoDB.
- Telemetry requires an authenticated owner of an active tracking session, and the session binds to one active bus. The server validates ranges, timestamp freshness, accuracy, speed, heading, and a per-session rate limit. A user cannot select an arbitrary bus in the payload.
- Recent points are quality filtered and grouped by bus. HBase receives the aggregated bus state only. Individual observations (without user ID, email, device ID, or session ID) are appended to `/busbest/raw/telemetry/` in HDFS for history.
- Public API and WebSocket expose the aggregated bus state and contributor count only. They never return a passenger identity or an individual session point. The admin tracking API reports aggregate quality/freshness/count, without precise contributor coordinates or identities.
- Browser/device speed is used when supplied within the accepted range; otherwise speed may be derived from consecutive points from the same active session. If speed, distance, or history is unavailable, ETA is unavailable. Route distance is straight-line distance to a stop on the ordered route, not measured road distance.
- Historical MapReduce average speeds are passed to the existing Python ETA engine when the backend cache has them. The live map path does not run MapReduce, Hive, or HDFS reads per request.

## Storage responsibilities

| Component | BUSBEST responsibility |
| --- | --- |
| MongoDB | User/application records: accounts, registered buses, routes/stops, reports, and short-lived tracking session metadata. Never raw historical GPS files. |
| HBase | Fast random lookup of the latest aggregate state by `bus_id`. |
| HDFS | Large raw/cleaned/historical GPS files, including consented history events. |
| MapReduce | Historical average bus speed. |
| Hive | SQL analytics over HDFS datasets. |
| Python engine | Transparent traffic and ETA calculations using available speed/distance/history. |

Hadoop/HDFS, HBase, Hive, MapReduce, MongoDB, and the web API run locally in the development setup. The Big Data stack has not been deployed to a cloud production environment. A hosted React/API deployment alone would not make the local HDFS/HBase services available.

## Status semantics

- `DEMO`: prepared simulated state only.
- `LIVE`: at least two recent quality-accepted passenger contributions.
- `LIMITED DATA`: one recent quality-accepted contribution.
- `STALE`: prior live state exists, but no recent contributor has updated it.
- `NO LIVE DATA`: there is no sufficiently recent live state.

The implementation can distinguish a browser-reported coordinate from a verified vehicle device, but it cannot prove that a phone is physically on the selected bus. Browser background behavior, permission, connectivity, and battery restrictions can stop updates. When that happens, the state ages to `STALE`, then `NO LIVE DATA`; it never keeps inventing movement.
