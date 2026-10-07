# 🚌 BUSBEST

## Crowdsourced Bus Tracking, Traffic Classification & ETA System

**BUSBEST** is a B.Tech academic project combining Big Data
technologies, real-time web development, GPS analytics, traffic
classification, and ETA estimation.

> ⚠️ **Important:** The current GPS records are **SIMULATED DEMO DATA**.
> They are not real passenger or vehicle GPS.

## 📌 Overview

BUSBEST demonstrates: **Collect → Validate → Clean → Store → Process →
Analyze → Estimate ETA → Visualize**.

  Layer            Technologies
  ---------------- --------------------------------------
  Frontend         React, Vite, JavaScript, CSS
  Backend          Node.js, Express
  Database         MongoDB, Mongoose
  Big Data         Hadoop, HDFS, MapReduce, Hive, HBase
  Processing       Python
  Real-Time        WebSocket
  Maps             Leaflet, OpenStreetMap
  Authentication   JWT, bcrypt

## 🎯 Objectives

-   Process and clean GPS telemetry.
-   Store historical GPS data in HDFS.
-   Perform batch processing with MapReduce.
-   Perform SQL analytics with Hive.
-   Maintain latest bus state with HBase.
-   Calculate traffic-aware ETA with Python.
-   Support optional crowdsourced GPS contribution.
-   Provide real-time bus updates and role-based interfaces.

## 🏗️ System Architecture

``` mermaid
flowchart TD
 A[Simulated GPS Data] --> C[Validation & Cleaning]
 B[Crowdsourced GPS] --> C
 C --> D[HDFS]
 D --> E[MapReduce]
 D --> F[Hive]
 D --> G[HBase]
 E --> H[Historical Speed]
 F --> I[Historical Analytics]
 G --> J[Latest Bus State]
 H --> K[Python ETA Engine]
 I --> K
 J --> K
 K --> L[Traffic + ETA]
 L --> M[Express API]
 M --> N[React Dashboard]
 M --> O[WebSocket]
 O --> N
```

## 🔄 Big Data Workflow

``` mermaid
flowchart LR
 A[Raw GPS] --> B[Validation]
 B --> C[Cleaning]
 C --> D[HDFS]
 D --> E[MapReduce]
 D --> F[Hive]
 D --> G[HBase]
 E --> H[Average Speed]
 F --> I[Analytics]
 G --> J[Latest State]
 H --> K[Python ETA]
 I --> K
 J --> K
 K --> L[Traffic Classification]
 L --> M[ETA]
 M --> N[REST API]
 N --> O[React UI]
```

## 🧱 Technology Stack

### Frontend

  Technology      Purpose
  --------------- -----------------------
  React           User interface
  Vite            Build and development
  JavaScript      Application logic
  CSS             Responsive UI
  Leaflet         Interactive map
  OpenStreetMap   Map tiles

### Backend

  Technology   Purpose
  ------------ ----------------------
  Node.js      JavaScript runtime
  Express      REST API
  MongoDB      Application database
  Mongoose     Data modeling
  JWT          Authentication
  bcrypt       Password hashing
  WebSocket    Live updates

### Big Data

  Technology   BUSBEST Usage
  ------------ --------------------------
  Hadoop       Big Data ecosystem
  HDFS         Historical GPS storage
  MapReduce    Batch speed analysis
  Hive         SQL historical analytics
  HBase        Latest bus-state lookup

## 🗄️ HDFS

``` text
/busbest/
├── raw/
├── cleaned/
│   └── gps_cleaned.csv
├── processed/
└── output/
```

HDFS currently runs locally in Ubuntu WSL2 and is an academic/demo
environment, not a cloud production service.

## ⚙️ MapReduce

``` mermaid
flowchart LR
 A[HDFS GPS] --> B[Mapper]
 B --> C[Bus ID, Speed]
 C --> D[Shuffle]
 D --> E[Group by Bus]
 E --> F[Reducer]
 F --> G[Average Speed]
```

### Example

``` text
Input:   B101 → 28, 30, 31
Shuffle: B101 → [28, 30, 31]
Reduce:  (28 + 30 + 31) / 3 = 29.67 km/h
```

### Results

  Bus      Average Speed
  ------ ---------------
  B101        29.67 km/h
  B102        25.00 km/h
  B103        20.00 km/h
  B104        11.00 km/h
  B105        35.00 km/h

## 🔍 Hive Analytics

Hive performs SQL-based analysis of historical GPS records stored in
HDFS.

### Example Query

``` sql
SELECT bus_id,
       COUNT(*) AS records,
       AVG(speed) AS average_speed,
       MIN(speed) AS minimum_speed,
       MAX(speed) AS maximum_speed
FROM busbest_gps_records
GROUP BY bus_id
ORDER BY bus_id;
```

### Results

  Bus      Records   Average   Minimum   Maximum
  ------ --------- --------- --------- ---------
  B101           3     29.67        28        31
  B102           2     25.00        24        26
  B103           2     20.00        19        21
  B104           2     11.00         0        22
  B105           1     35.00        35        35

**Validation:** Tested Hive averages match the corresponding MapReduce
results.

## ⚡ HBase

HBase maintains the latest bus state for fast lookup.

**Table:** `busbest_bus_state`

  Component   Field
  ----------- -------------------------
  Row Key     `bus_id`
  info        `route_id`
  location    `latitude`, `longitude`
  telemetry   `speed`, `timestamp`

  Storage   Purpose
  --------- --------------------------
  HDFS      Historical GPS data
  HBase     Latest/current bus state

``` mermaid
flowchart TD
 A[GPS Observation] --> B[Validation]
 B --> C[Aggregation]
 C --> D[HBase]
 D --> E[Latest Bus State]
 E --> F[Express API]
 F --> G[Live Map]
```

## 📡 Crowdsourced GPS

``` mermaid
flowchart TD
 A[Passenger 1] --> D[Validation]
 B[Passenger 2] --> D
 C[Passenger 3] --> D
 D --> E[Outlier Filtering]
 E --> F[Accuracy + Recency Weighting]
 F --> G[Aggregation]
 G --> H[HBase]
 G --> I[HDFS]
 H --> J[WebSocket]
 J --> K[Public Map]
```

Users explicitly start sharing and can stop sharing. Individual
contributor identity and precise individual coordinates are not exposed
publicly.

## 🔐 Privacy & Consent

``` mermaid
flowchart TD
 A[User Login] --> B[Select Bus]
 B --> C[Start Sharing]
 C --> D[Location Permission]
 D --> E[GPS Telemetry]
 E --> F[Validation & Aggregation]
 F --> G[Stop Sharing]
```

-   Permission does not automatically start tracking.
-   Users explicitly start sharing.
-   Users can stop sharing.
-   Visitors are not automatically tracked.
-   Public users see aggregated bus state.

## 🚦 Traffic Classification

``` mermaid
flowchart LR
 A[Current Speed] --> D[Traffic Classification]
 B[Historical Speed] --> D
 C[Traffic Rules] --> D
 D --> E[Normal]
 D --> F[Moderate]
 D --> G[Heavy]
```

## 🕐 ETA Calculation

``` mermaid
flowchart TD
 A[Current Bus State] --> E[Python ETA Engine]
 B[Historical Speed] --> E
 C[Traffic Condition] --> E
 D[Estimated Distance] --> E
 E --> F[Traffic-Aware ETA]
```

> ⚠️ ETA distances are demonstration estimates and are not verified
> road-network distances.

## 📊 Demonstration Data Analysis

  Metric                Result
  ------------------- --------
  Raw records               17
  Valid records             10
  Invalid records            6
  Duplicate records          1

### Average Speed Visualization

``` text
B105  ████████████████████████████████ 35.00
B101  ███████████████████████████      29.67
B102  ███████████████████████          25.00
B103  ███████████████████              20.00
B104  ███████████                      11.00
                    km/h
```

## 🗺️ Map Visualization

Leaflet and OpenStreetMap provide the interactive map, bus markers, bus
details, route information, search, traffic status, and ETA. The current
five bus coordinates are simulated demonstration locations.

## 🔄 Real-Time Updates

``` mermaid
flowchart LR
 A[GPS Contributors] --> B[Validation]
 B --> C[Aggregation]
 C --> D[HBase]
 D --> E[WebSocket]
 E --> F[React Live Map]
```

## 👥 User Roles

### Visitor

  Feature                  Available
  ------------------------ -----------
  Public map               ✅
  Bus/route search         ✅
  Bus details              ✅
  ETA                      ✅
  Traffic information      ✅
  Automatic GPS tracking   ❌

### Registered User

  Feature              Available
  -------------------- -----------
  Registration/Login   ✅
  Profile              ✅
  Bus management       ✅
  Telemetry consent    ✅
  GPS contribution     ✅
  Issue reporting      ✅

### Administrator

  Feature                         Available
  ------------------------------- -----------
  User management                 ✅
  Bus management                  ✅
  Route management                ✅
  Report management               ✅
  Analytics                       ✅
  Aggregate tracking monitoring   ✅

## 🧪 Testing & Validation

  Component                            Result
  --------------------------- ---------------
  Backend tests                  **7 passed**
  API integration checks        **25 passed**
  Frontend production build        **Passed**
  Python tests --- Windows      **12 passed**
  Python tests --- Ubuntu       **12 passed**
  HDFS cleaned records                 **10**
  Hive vs MapReduce               **Matched**

## 📁 Project Structure

``` text
BUSBEST/
├── backend/
├── frontend/
├── data/
├── scripts/
├── src/
├── queries/
├── config/
├── docs/
├── tests/
├── README.md
└── .gitignore
```

## ▶️ Run Locally

### Prerequisites

-   Node.js 18+
-   MongoDB
-   Ubuntu WSL2
-   Hadoop / HDFS
-   HBase
-   Python

### Configure

``` powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set:

``` text
JWT_SECRET=<32+ random bytes>
VITE_API_URL=http://127.0.0.1:3001/api
```

### Start MongoDB

``` powershell
wsl.exe -d Ubuntu --user root --exec systemctl start mongod
```

### Start Hadoop/HDFS

``` bash
source ~/.bashrc
hdfs --daemon start namenode
hdfs --daemon start datanode
jps
```

### Start HBase

``` bash
hbase-daemon.sh autostart zookeeper
hbase-daemon.sh autostart master
hbase-daemon.sh autostart regionserver
```

### Start Backend

``` powershell
npm.cmd --prefix backend start
```

API: `http://127.0.0.1:3001`

### Start Frontend

``` powershell
npm.cmd --prefix frontend run dev
```

Frontend: `http://localhost:5173`

## 🧹 GPS Cleaning

``` bash
python scripts/clean_gps.py
python -m unittest discover -s tests -v
```

## ⚠️ Current Limitations

1.  The main GPS dataset is simulated demonstration data.
2.  The five displayed bus locations are simulated.
3.  Real passenger GPS telemetry has not yet been fully verified
    end-to-end on physical devices.
4.  Mobile background location depends on browser/OS behavior.
5.  ETA distances are demonstration estimates.
6.  Hadoop, HDFS, Hive, and HBase run locally in Ubuntu WSL2.
7.  The Big Data environment is a local academic/demo environment, not a
    cloud production cluster.

## 🔮 Future Scope

-   Real-world GPS deployment
-   Android/mobile application
-   Progressive Web App
-   Road-network routing
-   Real road-distance ETA
-   Machine-learning ETA prediction
-   Larger real-world GPS datasets
-   Distributed Hadoop cluster
-   Cloud deployment
-   Advanced traffic prediction
-   Passenger demand prediction
-   Route optimization
-   Advanced anomaly detection

## 🎓 Academic Significance

``` mermaid
flowchart LR
 A[Data Collection] --> B[Data Cleaning]
 B --> C[HDFS Storage]
 C --> D[MapReduce]
 C --> E[Hive Analytics]
 C --> F[HBase Live State]
 D --> G[Traffic Classification]
 E --> G
 F --> G
 G --> H[ETA Calculation]
 H --> I[REST API]
 I --> J[Real-Time Visualization]
```

## 📚 Big Data Technology Summary

  -----------------------------------------------------------------------
  Technology              Question                BUSBEST Role
  ----------------------- ----------------------- -----------------------
  **HDFS**                Where is historical     Historical GPS storage
                          data stored?            

  **MapReduce**           How is batch data       Average speed
                          processed?              

  **Hive**                How can historical data SQL analytics
                          be queried?             

  **HBase**               How can latest data be  Live bus state
                          retrieved quickly?      

  **Python**              How is intelligence     Traffic + ETA
                          calculated?             

  **MongoDB**             How are application     Users, buses, routes,
                          records stored?         reports

  **WebSocket**           How are live updates    Real-time UI
                          delivered?              
  -----------------------------------------------------------------------

## 🏆 Key Results

  Area                Result
  ------------------- -----------------------------------
  GPS dataset         **17 input → 10 cleaned records**
  MapReduce           **5 bus average-speed results**
  Hive                **Historical analytics executed**
  HBase               **Latest bus state maintained**
  Hive vs MapReduce   **Results matched**
  Backend testing     **7 passed**
  API integration     **25 checks passed**
  Python Windows      **12 passed**
  Python Ubuntu       **12 passed**
  Frontend build      **Passed**

------------------------------------------------------------------------

## 👨‍💻 Project

**BUSBEST --- Crowdsourced Bus Tracking, Traffic Classification & ETA
System**

**B.Tech Academic Project**

`Hadoop` · `HDFS` · `MapReduce` · `Hive` · `HBase` · `MongoDB` ·
`Python` · `Node.js` · `Express` · `React` · `Vite` · `WebSocket` ·
`Leaflet` · `OpenStreetMap`
