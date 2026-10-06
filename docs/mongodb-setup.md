# BUSBEST Persistent MongoDB Setup

## Environment and version

- Ubuntu 24.04.4 LTS, Noble, x86_64 under WSL2; systemd is active.
- MongoDB Community Server installed from MongoDB Inc.'s official signed apt repository.
- Installed server and package version: **8.0.32**.
- `mongosh`: **2.13.0**.
- BUSBEST database: `busbest`, accessed by the Windows Node backend over WSL localhost at `mongodb://127.0.0.1:27017/busbest`.
- MongoDB is configured only for application records (users, app buses, app routes). GPS history and analytics remain in HDFS/MapReduce/Hive/HBase.

MongoDB 8.0's official platform support includes 64-bit Ubuntu 24.04 LTS. The official apt package provides the `mongod` service and packaged config/data/log directories. See [MongoDB's official Ubuntu Community installation guide](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/).

## Installation and service commands

The Ubuntu default user had no noninteractive sudo permission, so the installation commands were run as the WSL `root` account (`wsl.exe -d Ubuntu --user root ...`). The official MongoDB 8.0 signing key and Noble package source were configured, followed by the signed apt install:

```bash
apt-get update
apt-get install -y gnupg curl ca-certificates
curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
  | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo 'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt-get update
apt-get install -y mongodb-org
systemctl enable --now mongod
```

The package created the `mongodb` service user and `/var/lib/mongodb`, `/var/log/mongodb`, plus `/etc/mongod.conf`. The installed default network configuration was verified as:

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1
```

That keeps the development server bound to loopback. The service is enabled and active under WSL's systemd. No username/password was invented or configured. The Node backend's local URI and generated 64-character JWT secret are stored in the ignored `backend/.env`; neither current value is committed or included in this record. The secret was rotated while correcting the earlier malformed `.env`. `.env.example` documents the URI and secret requirement.

The runtime MongoDB URI matches the URI used by the backend. MongoDB is not a replacement for any Big Data store. No admin account was bootstrapped.

## Actual verification

| Check | Actual result |
|---|---|
| `mongod --version` | `db version v8.0.32` |
| `mongosh --version` | `2.13.0` |
| `systemctl is-active mongod` / `is-enabled` | `active` / `enabled` |
| `ss -ltnp` | `127.0.0.1:27017`, process `/usr/bin/mongod`, PID 27771 at check time |
| `/etc/mongod.conf` bind | `127.0.0.1`, port `27017` |
| `mongosh ... --eval db.runCommand({ping:1})` | `{ ok: 1 }`; database name `busbest` |
| Windows-hosted Mongoose connection from `backend/.env` | Connected; database `busbest` |
| Final database check | Ping `{ ok: 1 }`, `users` count `0`; no admin account created |

The backend was started with `npm.cmd --prefix backend start`. Actual API smoke check against that server:

| Request | Actual result |
|---|---|
| `GET /api/health` | HTTP 200, `status: ok` |
| `GET /api/buses` | HTTP 200, 5 buses, `SIMULATED DEMO GPS DATA` |
| `POST /api/auth/register` | HTTP 201, role `USER`, no password hash in response |
| `POST /api/auth/login` | HTTP 200 |
| `GET /api/auth/me` with returned token | HTTP 200 |

The registration smoke check generated a temporary random email/password in memory, used them for the HTTP calls, then deleted only that test account. Cleanup returned `true`. No test account remains in the database.

The existing backend suite was rerun after service installation: **3 passed, 0 failed**, 14.55 seconds. It exercises a disposable MongoDB process; the separate HTTP smoke check above confirms the same registration flow against persistent WSL MongoDB. Public pipeline assertions remained at five simulated buses and MapReduce average B101=29.67 km/h.

## Issue encountered and fix

The first apt source write contained a literal `\\n` suffix because of command-line quoting. `apt-get update` reported an invalid component and could not locate `mongodb-org`; no MongoDB package was installed by that attempt. The source line was corrected using `echo` with the exact official Noble repository entry, then `apt-get update` showed the signed repository and apt installed MongoDB 8.0.32 successfully.

The backend's ignored `.env` was also found to contain literal `\\n` sequences from its earlier setup, so Node did not load the URI or JWT secret. The file was rewritten with proper line breaks and a fresh random JWT secret. Node then confirmed both settings were loaded without displaying either secret, and Mongoose connected successfully.

## Data and service scope

MongoDB's default `/var/lib/mongodb` data path is inside Ubuntu's Linux filesystem. The local database contains no created admin account or retained smoke account. The existing HDFS, MapReduce, Hive, and HBase data was not changed. Use `sudo systemctl status mongod` to inspect the service; the local development service can be started with `sudo systemctl start mongod` inside Ubuntu.
