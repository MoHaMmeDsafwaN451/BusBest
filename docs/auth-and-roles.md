# BUSBEST Authentication, Roles, and Application Data

## Data boundaries

The existing data pipeline is unchanged: HDFS stores GPS history, MapReduce produces historical speed output, Hive provides analytics, HBase stores latest bus state, and `traffic_eta.py` calculates traffic and ETA. The existing public `GET /api/buses`, `GET /api/buses/:busId`, `GET /api/routes`, and `GET /api/analytics/summary` still read that pipeline. MongoDB stores only application accounts and user-managed bus/route registry records; it does not receive GPS history or replace any Big Data store.

MongoDB was absent at the start of the persistence milestone and is now installed as MongoDB Community Server 8.0.32 in Ubuntu WSL. The service is enabled and active on `127.0.0.1:27017`; the backend uses `mongodb://127.0.0.1:27017/busbest` from the ignored `backend/.env`. No database credentials were invented. If MongoDB is unavailable, public pipeline endpoints remain available and Mongo-backed endpoints return 503. Integration tests use a temporary MongoDB server; a separate registration/login/me smoke check was also verified against persistent WSL MongoDB and its temporary user was removed. Setup results are in [mongodb-setup.md](mongodb-setup.md).

## Roles and access

| Role | Access |
|---|---|
| Visitor | No account required for pipeline-backed public bus, route, traffic, ETA, and analytics GET endpoints. Cannot mutate application records. |
| User | Registers/logs in, views buses they own or are permitted to manage at `/api/my/buses`, and adds/updates/deletes only those MongoDB bus registry records. New buses start as `PENDING_REVIEW`. Users cannot set status or call admin routes. |
| Admin | Uses the same login and can manage all MongoDB buses, user roles/accounts, permitted bus managers, and application route records, and read the user/bus/route registries. |

Registration always assigns `USER`; clients cannot choose a role. The first administrator is created only by `npm.cmd --prefix backend run admin:bootstrap`, which requires `BOOTSTRAP_ADMIN_*` settings in the ignored `.env` and an empty users collection. It refuses to run after any account exists. There is no public admin registration route.

## Authentication and security

`POST /api/auth/register` hashes passwords with bcrypt (cost 12); only `passwordHash` is stored, and the field is excluded from normal model reads. `POST /api/auth/login` verifies the hash and returns a signed JWT valid for one hour. The secret is read from `JWT_SECRET` in the ignored `backend/.env`, must be at least 32 bytes, and is never returned by the API. `GET /api/auth/me` and protected endpoints require `Authorization: Bearer <token>`. The server reloads the account and role from MongoDB for each protected request, so deleted accounts or changed roles lose previous access.

Input is allow-listed and length/type checked. Email is lowercased and unique; duplicate registration returns 409. Passwords must be 12–72 UTF-8 bytes (bcrypt's input limit). User bus updates permit only name/routeId; admins can also set status and grant manager IDs after validating those accounts. User ownership and `permittedManagers` are checked before update/delete. Password hashes are not serialized. Admins cannot demote/delete themselves or remove the final administrator. Deleting an application account removes that user's Mongo bus records and manager grants only; HDFS, Hive, HBase, and GPS files are untouched. CORS allows configured origins and the Authorization header for the later frontend.

## Application models

- **User:** `name`, normalized unique `email`, `passwordHash` (hidden by default), `role` (`USER`/`ADMIN`), `createdAt`.
- **Bus:** unique `busId`, optional `name`, `routeId`, `owner` User reference, `permittedManagers` User references, `status` (`PENDING_REVIEW`, `ACTIVE`, `SUSPENDED`, `REJECTED`), `createdAt`, `updatedAt`.
- **Route:** unique `routeId`, `name`, `start`, `destination`, `createdAt`, `updatedAt`.

Application route CRUD is under `/api/admin/routes` to keep it distinct from the existing public `GET /api/routes`, which describes current pipeline routes. A route in use by a MongoDB app bus cannot be deleted.

## API

| Method and path | Access | Purpose |
|---|---|---|
| `POST /api/auth/register` | Public | Create a USER and return a token/profile. |
| `POST /api/auth/login` | Public | Verify credentials and return a token/profile. |
| `GET /api/auth/me` | Authenticated | Return the current safe profile. |
| `GET /api/my/buses` | Authenticated | List buses owned by/permitted to the user (admins see all). |
| `POST /api/buses` | Authenticated | Add a Mongo app bus in `PENDING_REVIEW`. |
| `PUT /api/buses/:busId` | Owner/manager or admin | Update allow-listed fields; admins can set status and `permittedUserIds`. |
| `DELETE /api/buses/:busId` | Owner/manager or admin | Delete a Mongo app bus record. |
| `GET /api/admin/users` | Admin | List safe user profiles. |
| `PUT /api/admin/users/:id/role` | Admin | Change a user's USER/ADMIN role. |
| `DELETE /api/admin/users/:id` | Admin | Delete a user and their application bus records. |
| `GET /api/admin/buses` | Admin | List all application bus records. |
| `GET/POST /api/admin/routes` | Admin | List/create application routes. |
| `PUT/DELETE /api/admin/routes/:routeId` | Admin | Update/delete an unused application route. |

Existing public endpoints remain unchanged: `GET /api/health`, `GET /api/buses`, `GET /api/buses/:busId`, `GET /api/routes`, and `GET /api/analytics/summary`.

## Configuration and running

Copy `backend/.env.example` to `backend/.env`; set a random `JWT_SECRET` of at least 32 bytes. Keep the provided local Mongo URI unless your MongoDB uses another local address. Never commit `.env`. Start MongoDB Community locally, then run:

```powershell
npm.cmd install --prefix backend
npm.cmd --prefix backend start
```

To create the first admin, temporarily place `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a 12–72 byte `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, run the bootstrap command shown above, then remove the password from `.env`.

## Verification

Test command: `npm.cmd test --prefix backend`. The Node built-in test runner starts a temporary MongoDB instance, runs a real HTTP server, and invokes the actual public pipeline APIs; its MongoDB executable is cached outside the project and the temporary database is shut down at the end.

Final automated run: **3 tests passed, 0 failed** (Node test runner, 12.57 seconds). The checks cover visitor `/api/health`, `/api/buses`, `/api/routes`, and `/api/analytics/summary`; registration and duplicate rejection; successful and invalid-password login; authenticated `/api/auth/me`; bcrypt hash persisted with no plaintext password and safe API serialization; user bus creation/list/update; unauthorized admin access; cross-user update/delete denial; admin user/bus/route access and role update; admin grant of a permitted bus manager; admin route create/delete; and public analytics values from the existing pipeline (five current buses and B101 historical average speed 29.67 km/h).

Normal runtime smoke check: `/api/health` returned HTTP 200; `/api/buses` returned HTTP 200 with five `SIMULATED DEMO GPS DATA` records; `POST /api/auth/register` returned HTTP 503 with `application_data_unavailable` because no persistent MongoDB server is installed/running locally. This is the expected documented readiness behavior; successful authentication and CRUD endpoints were tested against the temporary MongoDB database in the automated suite.
