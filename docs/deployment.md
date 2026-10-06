# Local run and deployment notes

## Local development

Prerequisites already used by this project: Node.js 18+, Python 3.10+, MongoDB Community running locally, and the existing Hadoop/HDFS/HBase tools in Ubuntu WSL2 for pipeline-backed endpoints. Hive and MapReduce results are existing local outputs. The web API is not a cloud deployment.

1. Copy `backend/.env.example` to `backend/.env`; set a private random `JWT_SECRET` (at least 32 bytes). Keep it out of Git.
2. Copy `frontend/.env.example` to `frontend/.env`; set `VITE_API_URL=http://127.0.0.1:3001/api` for local development.
3. If the local data services are stopped, start MongoDB from PowerShell: `wsl.exe -d Ubuntu --user root --exec systemctl start mongod`. In Ubuntu as the normal user, load the existing environment and start the already-configured HDFS and HBase services in dependency order:

   ```bash
   source ~/.bashrc
   hdfs --daemon start namenode
   hdfs --daemon start datanode
   hbase-daemon.sh autostart zookeeper
   hbase-daemon.sh autostart master
   hbase-daemon.sh autostart regionserver
   ```

   These start commands do not format the NameNode or alter the existing HDFS data.
4. Start the API: `npm.cmd --prefix backend start`.
5. Start Vite in another terminal: `npm.cmd --prefix frontend run dev`.
6. Open the URL printed by Vite (normally `http://localhost:5173`). Ensure `CORS_ORIGIN` in backend `.env` includes that exact origin.

The browser location flow works on localhost for development. A deployed browser app must use HTTPS for geolocation; set the exact HTTPS site origin in `CORS_ORIGIN` and configure secure WebSocket (`wss://`) access. Location permission alone never starts collection: the user must be signed in, choose a bus, confirm travel, start a session, and can stop sharing at any time. Background location is not guaranteed by browsers or mobile operating systems.

The backend performs a one-time background warm of the light HBase current-state cache and existing historical MapReduce/Python report. Public map requests use the lightweight endpoint and do not wait for Hive or history jobs. If MongoDB, WSL/HDFS, or HBase is stopped, affected application or map requests report a service-unavailable error; no production cloud connection is configured here.

To start the local web layer after MongoDB, HDFS, and HBase are already running:

```powershell
npm.cmd --prefix backend start
npm.cmd --prefix frontend run dev
```

The development backend listens on `127.0.0.1:3001`; Vite normally uses port 5173. Keep the backend `.env` private, and never put backend settings or secrets in `VITE_*` variables.

To create the first administrator, set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` temporarily in the ignored backend `.env`, run `npm.cmd --prefix backend run admin:bootstrap`, then remove the bootstrap password from the file. Registration always creates a USER; never promote users by editing the database manually for routine operation.

## Production web deployment

Build the client with `npm run build` in `frontend`. Serve `frontend/dist` from a static frontend host over HTTPS and set build-time `VITE_API_URL` to the HTTPS API origin. Deploy the Express API to a separate Node hosting environment; set `PORT`, `MONGODB_URI`, `JWT_SECRET`, and exact `CORS_ORIGIN` through the host's secret/configuration manager. Do not put backend credentials in Vite variables: all `VITE_*` values are public in the built client.

MongoDB Atlas is an option for production application entities. Use a dedicated least-privilege database user, network access restrictions, TLS, backups, and a managed secret store. No Atlas connection string or credentials are supplied by this project.

## Big Data boundary

HDFS, MapReduce, Hive, and HBase are local WSL2 demonstration components. The API invokes the existing local pipeline; publishing the React site or API does not publish those services. Do not expose the WSL NameNode, HBase, or MongoDB ports publicly. A production system needs an independently designed ingestion service, durable history/analytics infrastructure, access controls, monitoring, and verified device data.

## Environment variables

Backend variables are listed in `backend/.env.example`: `PORT`, `HOST`, `CORS_ORIGIN`, `MONGODB_URI`, `JWT_SECRET`, and WSL-local pipeline paths/cache/timeout. Frontend uses only `VITE_API_URL` from `frontend/.env.example`. Never commit `.env` files or place secrets under `VITE_` names.
