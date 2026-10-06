-- BUSBEST cleaned GPS data is SIMULATED DEMO DATA.
-- This is an external table over the existing HDFS directory; it does not copy rows.

CREATE EXTERNAL TABLE IF NOT EXISTS busbest_gps (
  bus_id STRING,
  route_id STRING,
  user_id STRING,
  latitude DOUBLE,
  longitude DOUBLE,
  `timestamp` STRING,
  speed DOUBLE
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ','
STORED AS TEXTFILE
LOCATION 'hdfs://localhost:9000/busbest/cleaned'
TBLPROPERTIES ('skip.header.line.count'='1');

-- In this Hive/Hadoop local-runner combination the table header property was
-- retained in metadata but did not skip the header at read time. Filter it in
-- a view so analytics operate on data records without copying or editing HDFS.
CREATE OR REPLACE VIEW busbest_gps_records AS
SELECT bus_id, route_id, user_id, latitude, longitude, `timestamp`, speed
FROM busbest_gps
WHERE bus_id IS NOT NULL
  AND bus_id <> 'bus_id'
  AND speed IS NOT NULL;

-- Table validation: expected 10 data rows, excluding the CSV header.
SELECT COUNT(*) AS gps_record_count FROM busbest_gps_records;

-- 1. Average speed by bus.
SELECT bus_id, ROUND(AVG(speed), 2) AS average_speed_kmh
 FROM busbest_gps_records
GROUP BY bus_id
ORDER BY bus_id;

-- 2. Average speed by route.
SELECT route_id, ROUND(AVG(speed), 2) AS average_speed_kmh
FROM busbest_gps_records
GROUP BY route_id
ORDER BY route_id;

-- 3. GPS records per bus.
SELECT bus_id, COUNT(*) AS gps_record_count
FROM busbest_gps_records
GROUP BY bus_id
ORDER BY bus_id;

-- 4. Maximum speed by bus.
SELECT bus_id, MAX(speed) AS max_speed_kmh
FROM busbest_gps_records
GROUP BY bus_id
ORDER BY bus_id;

-- 5. Minimum speed by bus.
SELECT bus_id, MIN(speed) AS min_speed_kmh
FROM busbest_gps_records
GROUP BY bus_id
ORDER BY bus_id;
