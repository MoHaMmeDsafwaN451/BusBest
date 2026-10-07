# 🚌 BUSBEST

**BUSBEST** is a B.Tech project prototype for **crowdsourced bus tracking, traffic classification, and transparent ETA calculation**.

> ⚠️ **IMPORTANT:** The current GPS records are **SIMULATED DEMO DATA**. They are not real passenger or vehicle GPS. The application implements an opt-in crowdsourced telemetry architecture for future real-device testing.

---

## 📌 Project Overview

BUSBEST combines a modern full-stack web application with a local Big Data processing pipeline to demonstrate how GPS data can be collected, validated, stored, processed, analyzed, and presented as useful bus-tracking information.

The system combines:

- React + Vite frontend
- Node.js + Express backend
- MongoDB application database
- Hadoop / HDFS
- MapReduce
- Apache Hive
- Apache HBase
- Python-based traffic and ETA processing
- WebSocket-based live updates
- Leaflet / OpenStreetMap visualization

The project is designed as an academic prototype demonstrating the integration of **Big Data technologies with real-time transportation applications**.

---

# 🚍 Current Application

### Public Users

Visitors can:

- View the public bus map
- Search buses and routes
- View bus details
- View route information
- View traffic classification
- View estimated arrival time
- View project information

Visitors do **not** automatically share their location.

---

### 👤 Registered Users

Registered users can:

- Create an account
- Login securely
- Manage their profile
- Manage owned/permitted buses
- Select a bus for contribution
- Give telemetry consent
- Start an optional GPS tracking session
- Stop sharing GPS
- Submit bus-related issue reports

Location permission alone does **not** start tracking.

---

### 🛡️ Administrators

Administrators can:

- Manage users
- Manage buses
- Manage routes
- Manage reports
- View analytics
- Manage local system information
- View aggregate tracking status

Individual contributor identity and precise contributor coordinates are not exposed through the public tracking interface.

---

# 🏗️ System Architecture

```text
                     BUSBEST DATA SOURCES
                              │
               ┌──────────────┴──────────────┐
               │                             │
       Simulated GPS Data             Crowdsourced GPS
       Demo Dataset                  Opt-in Contributors
               │                             │
               └──────────────┬──────────────┘
                              ↓
                    DATA VALIDATION
                    & DATA CLEANING
                              │
                              ↓
                           HDFS
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ↓                ↓                ↓
        MapReduce           Hive             HBase
       Batch Analysis    SQL Analytics     Live State
             │                │                │
             ↓                ↓                ↓
       Average Speed      Historical       Latest Bus
         by Bus            Analysis          State
             │                │                │
             └────────────────┼────────────────┘
                              ↓
                     Python ETA Engine
                              │
                              ↓
                  Traffic + ETA Analysis
                              │
                              ↓
                       Express API
                              │
                  ┌───────────┴───────────┐
                  ↓                       ↓
                React                 WebSocket
              Dashboard              Live Updates
                  │                       │
                  └───────────┬───────────┘
                              ↓
                         BUSBEST Users



🧱 Technology Stack
Frontend
Technology	Purpose
React	User interface
Vite	Development and production build
JavaScript	Application logic
CSS	Responsive UI
Leaflet	Interactive map
OpenStreetMap	Map tiles


Backend
Technology	Purpose
Node.js	JavaScript runtime
Express	REST API
MongoDB	Application data
Mongoose	MongoDB data modeling
JWT	Authentication
bcrypt	Password hashing
WebSocket	Live updates


Big Data
Technology	BUSBEST Usage
Hadoop	Big Data ecosystem
HDFS	Historical GPS storage
MapReduce	Batch speed analysis
Hive	SQL-based historical analytics
HBase	Latest bus-state lookup


Data Processing
Technology	Purpose
Python	Data processing and ETA engine
CSV	GPS data format
MapReduce	Historical speed calculation
Hive SQL	Historical analytics
HBase	Current bus state


📊 Big Data Processing Pipeline
              RAW GPS DATA
                   │
                   ↓
           Data Validation
                   │
                   ↓
            Data Cleaning
                   │
                   ↓
                  HDFS
                   │
       ┌───────────┼───────────┐
       ↓           ↓           ↓
  MapReduce      Hive        HBase
       │           │           │
       ↓           ↓           ↓
Average Speed  Historical   Latest Bus
   Analysis     Analytics      State
       │           │           │
       └───────────┼───────────┘
                   ↓
             Python ETA
                   │
                   ↓
          Traffic Classification
                   │
                   ↓
             Express API
                   │
                   ↓
             React Dashboard

🗄️ HDFS
HDFS is used as the historical storage layer for cleaned GPS records.
The BUSBEST HDFS structure is:
/busbest/
│
├── raw/
│
├── cleaned/
│   └── gps_cleaned.csv
│
├── processed/
│
└── output/

The current Big Data environment runs locally in Ubuntu WSL2.
HDFS is currently used as a local academic/demo environment and is not deployed as a cloud production service.

⚙️ MapReduce
BUSBEST uses MapReduce for batch analysis of historical GPS data.
The implemented analysis calculates average speed by bus.
             HDFS GPS DATA
                   │
                   ↓
                MAPPER
                   │
             (Bus ID, Speed)
                   │
                   ↓
                SHUFFLE
                   │
             Group by Bus ID
                   │
                   ↓
               REDUCER
                   │
                   ↓
             Average Speed
                   │
                   ↓
              HDFS Output

Demonstration Results
Bus	Average Speed
B101	29.67 km/h
B102	25.00 km/h
B103	20.00 km/h
B104	11.00 km/h
B105	35.00 km/h


🔍 Hive Analytics
Apache Hive is used for SQL-based analysis of historical GPS records stored in HDFS.
The Hive analysis includes:
- Average speed
- Minimum speed
- Maximum speed
- Number of observations
- Route-level analysis
Example result:
Bus	Records	Average	Minimum	Maximum
B101	3	29.67	28	31
B102	2	25.00	24	26
B103	2	20.00	19	21
B104	2	11.00	0	22
B105	1	35.00	35	35


The tested Hive averages match the corresponding MapReduce results.
⚡ HBase
HBase is used to maintain the latest bus state for fast lookup.
The project uses the table:
busbest_bus_state

Logical structure:
Row Key: bus_id

info:
    route_id

location:
    latitude
    longitude

telemetry:
    speed
    timestamp

HBase Role
GPS Observation
       │
       ↓
Validation
       │
       ↓
Aggregation
       │
       ↓
     HBase
       │
       ↓
Latest Bus State
       │
       ↓
Live Map / API

HDFS and HBase have different responsibilities:
- HDFS → historical GPS data
- HBase → latest/current bus state
📡 Crowdsourced GPS Architecture
Registered users can optionally contribute GPS telemetry while traveling on a selected bus.
Passenger 1 ── GPS ──┐
Passenger 2 ── GPS ──┤
Passenger 3 ── GPS ──┤
                      ↓
              Backend Validation
                      ↓
               Outlier Filtering
                      ↓
             Accuracy + Recency
                  Weighting
                      ↓
                 Aggregation
                 /         \
                /           \
               ↓             ↓
            HBase          HDFS
        Latest State    Historical Data
               │
               ↓
           WebSocket
               │
               ↓
          Public Map

Multiple observations can contribute to a representative bus state.
The public interface does not expose individual contributor identity or precise individual contributor coordinates.
🔐 Privacy and Consent
BUSBEST uses an explicit opt-in tracking model.
Tracking flow
User Login
    ↓
Select Bus
    ↓
Start Sharing
    ↓
Location Permission
    ↓
GPS Telemetry
    ↓
Validation & Aggregation
    ↓
Stop Sharing

Important principles:
- Location permission does not automatically start tracking.
- The user explicitly starts sharing.
- The user can stop sharing.
- Public users are not automatically tracked.
- Individual contributor identity is not displayed publicly.
- Individual contributor coordinates are not displayed publicly.
- Aggregated bus state is used for public visualization.
🚦 Traffic Classification
BUSBEST compares current bus movement with historical speed information.
Current Speed
      +
Historical Speed
      +
Traffic Rules
      ↓
Traffic Classification
      ↓
Normal / Moderate / Heavy

The traffic classification is then used as an input to the ETA calculation pipeline.
🕐 ETA Calculation
The Python ETA engine combines:
- Current bus state
- Historical speed
- Traffic classification
- Estimated distance
Current Bus State
       +
Historical Speed
       +
Traffic Condition
       +
Estimated Distance
       ↓
Traffic-aware ETA

The current demonstration uses simulated/demo GPS records and estimated distances.
ETA distances are not currently verified road-network distances.

📈 Demonstration Analytics
The current cleaned GPS dataset contains:
Raw records       : 17
Valid records     : 10
Invalid records   : 6
Duplicate records : 1

Historical average speed:
B101 → 29.67 km/h
B102 → 25.00 km/h
B103 → 20.00 km/h
B104 → 11.00 km/h
B105 → 35.00 km/h

These values were obtained through the tested Big Data analytics pipeline.
🗺️ Map Visualization
Leaflet and OpenStreetMap tiles are used to display bus coordinates.
The application provides:
- Interactive bus map
- Bus markers
- Bus details
- Route information
- Search
- Traffic status
- ETA information
The current five bus coordinates shown on the map are simulated demonstration locations.

🔄 Real-Time Updates
BUSBEST uses WebSocket communication for live aggregate bus-state updates.
GPS Contributors
       ↓
Validation
       ↓
Aggregation
       ↓
HBase
       ↓
WebSocket
       ↓
React Live Map

This avoids repeatedly loading the complete bus dataset when an aggregate bus state changes.
👥 User Roles
Visitor
- Public map
- Bus search
- Route search
- Bus details
- ETA
- Traffic information
- Project information
USER
- Registration
- Login
- Profile
- Bus management
- Telemetry consent
- GPS contribution
- Issue reporting
ADMIN
- User management
- Bus management
- Route management
- Report management
- Analytics
- System management
- Aggregate tracking monitoring
🛣️ Route Management
Routes support:
- Starting point
- Destination
- Multiple ordered stops
- Stop reordering
- Route editing
- Route archiving
Assigned routes are protected from unsafe deletion. The application provides guidance when a route is already assigned to buses.
📱 Responsive Interface
The application is designed for:
- Desktop
- Laptop
- Tablet
- Smartphone
Supported interface features include:
- Light theme
- Dark theme
- System theme
- English
- Malayalam
- Hindi
🧪 Validation & Testing
The project has been tested across the backend, frontend, Python processing, and Big Data pipeline.
Recorded final verification includes:
Backend tests          : 7 passed
API integration checks : 25 passed
Frontend build         : Passed
Python tests Windows   : 12 passed
Python tests Ubuntu    : 12 passed

The Big Data regression also verified:
HDFS cleaned records : 10

MapReduce averages:
B101 → 29.67
B102 → 25.00
B103 → 20.00
B104 → 11.00
B105 → 35.00

Hive averages matched the MapReduce results.

For complete testing details, see:
- [Testing Documentation](docs/testing.md)
- [Architecture](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Deployment](docs/deployment.md)
📁 Project Structure
BUSBEST/
│
├── backend/
│   ├── src/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── telemetry/
│   │   └── server.js
│   │
│   └── scripts/
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── ...
│
├── data/
│   ├── raw/
│   ├── cleaned/
│   └── sample/
│
├── scripts/
│   ├── clean_gps.py
│   ├── load_latest_hbase.py
│   └── ...
│
├── src/
│   ├── cleaning.py
│   ├── traffic_eta.py
│   └── mapreduce/
│
├── queries/
│   └── hive_analytics.sql
│
├── config/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── deployment.md
│   ├── testing.md
│   ├── hive-analytics.md
│   ├── hbase-setup.md
│   └── traffic-eta.md
│
├── tests/
│
├── README.md
└── .gitignore

▶️ Run Locally
Prerequisites
- Node.js 18+
- MongoDB
- Ubuntu WSL2
- Hadoop / HDFS
- HBase
- Python
- Already configured BUSBEST environment
1. Configure Backend
Copy:
backend/.env.example

to:
backend/.env

Set a private:
JWT_SECRET

Use at least 32 random bytes.
2. Configure Frontend
Copy:
frontend/.env.example

to:
frontend/.env

Set:
VITE_API_URL=http://127.0.0.1:3001/api

3. Start MongoDB
wsl.exe -d Ubuntu --user root --exec systemctl start mongod

4. Start Hadoop / HDFS
From Ubuntu WSL:
source ~/.bashrc

hdfs --daemon start namenode
hdfs --daemon start datanode

5. Start HBase
hbase-daemon.sh autostart zookeeper
hbase-daemon.sh autostart master
hbase-daemon.sh autostart regionserver

6. Start Backend
From the BUSBEST project root:
npm.cmd --prefix backend start

The API normally runs on:
http://127.0.0.1:3001

7. Start Frontend
Open another terminal:
npm.cmd --prefix frontend run dev

The Vite development server normally runs on:
http://localhost:5173

👑 Bootstrap the First Admin
Create the first administrator only when required.
Temporarily set:
BOOTSTRAP_ADMIN_NAME
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD

in the ignored:
backend/.env

Then run:
npm.cmd --prefix backend run admin:bootstrap

After successful creation, remove the bootstrap password from the environment file.
🧹 GPS Data Cleaning
The original Python cleaner can be executed using:
python scripts/clean_gps.py

Run Python tests with:
python -m unittest discover -s tests -v

⚠️ Current Limitations
The current prototype has the following limitations:
1. The main GPS dataset is simulated demonstration data.
2. The five displayed bus locations are simulated.
3. Real passenger GPS telemetry has not yet been fully verified end-to-end on physical devices.
4. Mobile background location behavior depends on the browser and operating system.
5. ETA distances are demonstration estimates and are not verified road-network distances.
6. Hadoop, HDFS, Hive, and HBase run locally in Ubuntu WSL2.
7. The Big Data environment is a local academic/demo environment, not a cloud production cluster.
8. Final cross-device visual testing is still required for some responsive and mobile behaviors.
These limitations are intentionally documented so that simulated data is not presented as real-world transportation telemetry.
🔮 Future Scope
Future improvements could include:
- Real-world GPS deployment
- Android / mobile application
- Progressive Web App (PWA)
- Road-network routing
- Real road-distance ETA
- Machine-learning-based ETA prediction
- Larger real-world GPS datasets
- Distributed Hadoop cluster
- Cloud deployment
- Advanced traffic prediction
- Passenger demand prediction
- Route optimization
- Advanced anomaly detection
- Historical route intelligence
🎓 Academic Significance
BUSBEST demonstrates a complete Big Data workflow:
Data Collection
      ↓
Data Cleaning
      ↓
HDFS Storage
      ↓
MapReduce Processing
      ↓
Hive Analytics
      ↓
HBase Live State
      ↓
Traffic Classification
      ↓
ETA Calculation
      ↓
REST API
      ↓
Real-Time Visualization

The project demonstrates how Big Data technologies can be integrated with a modern full-stack application to address a practical public transportation problem.
👨‍💻 Project
BUSBEST — Crowdsourced Bus Tracking, Traffic Classification & ETA System
B.Tech Academic Project
Core Technologies
Hadoop HDFS MapReduce Hive HBase MongoDB Python Node.js Express React Vite WebSocket Leaflet OpenStreetMap                         
