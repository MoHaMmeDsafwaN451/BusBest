# BUSBEST

BUSBEST is a B.Tech project prototype for crowdsourced bus tracking, traffic classification, and transparent ETA calculation. The current GPS records are **SIMULATED DEMO DATA**; they are not real passenger or vehicle GPS.

## Current application

- React + Vite public map, bus/route search, details, and project information.
- USER registration/login, profile, owned/permitted bus management, telemetry consent flow, and issue reporting.
- ADMIN account, bus, route, report, analytics, and local system management.
- Express API backed by local MongoDB for application records and the existing Python/HBase/HDFS pipeline for current demo states and historical analytics.
- Leaflet/OpenStreetMap tiles display API coordinates. The current five bus locations are simulated.

HDFS, MapReduce, Hive, and HBase run locally in Ubuntu WSL2. They are not cloud production services. See [architecture](docs/architecture.md), [API](docs/api.md), and [deployment](docs/deployment.md).

## Run locally

Prerequisites: Node.js 18+, MongoDB running in Ubuntu WSL2, and the already configured BUSBEST WSL Hadoop/HBase environment for pipeline-backed endpoints.

1. Copy `backend/.env.example` to `backend/.env`, set a private `JWT_SECRET` (32+ random bytes), and check the local MongoDB/WSL path values.
2. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL=http://127.0.0.1:3001/api`.
3. Start MongoDB if necessary: `wsl.exe -d Ubuntu --user root --exec systemctl start mongod`.
4. Start the API in one terminal: `npm.cmd --prefix backend start`.
5. Start the web app in another terminal: `npm.cmd --prefix frontend run dev`.
6. Open the Vite URL, normally `http://localhost:5173`.

Create the first admin only when needed: temporarily set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in ignored `backend/.env`, run `npm.cmd --prefix backend run admin:bootstrap`, then remove the password.

## Validation

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix frontend run build
```

The recorded final results are in [docs/testing.md](docs/testing.md). The original Python cleaner can be run with `python scripts/clean_gps.py`; its tests use `python -m unittest discover -s tests -v`.
