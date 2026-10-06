# BUSBEST Hive Analytics — Milestone 2, Step 7

**Status:** Hive analytics executed successfully on 2026-10-04. The HDFS input is **SIMULATED DEMO DATA**, not real passenger GPS data.

## Version and compatibility

- Hive was not installed before this milestone.
- Installed Apache Hive **4.1.0** at `/home/zabeer_karatt/opt/apache-hive-4.1.0-bin`.
- The official Hive download page says Hive 4.1.x adds JDK 17 support and works with Hadoop 3.4.1. Current Hive 4.2.1 requires JDK 21, so it does not match the existing Java 17. This 4.1.0 tarball is now in Apache's historical archive. Hadoop 3.5.0 is not named in Hive's release note; compatibility with this local workload was verified by successful metastore, Beeline, and query execution against the existing Hadoop 3.5.0 installation. This is an observed result, not an Apache compatibility guarantee.
- The binary was downloaded from Apache's archive and verified against its published SHA-256: `9d160af85f0f44ea7e0ccaf0a8c876e36ac35abfd9f8c506504a11e6daaff9aa`.
- Java 17 and Hadoop were not reinstalled or changed. Hive, the metastore, and build/config files are inside the Ubuntu/Linux environment or BUSBEST project; nothing was installed under `/mnt/c`.

Official references: [Apache Hive Downloads](https://hive.apache.org/general/downloads/) and [Hive 4.1.0 archive checksum](https://archive.apache.org/dist/hive/hive-4.1.0/apache-hive-4.1.0-bin.tar.gz.sha256). Apache describes archived releases as historical and potentially unsupported.

## Configuration

Project configuration: `config/hive-site.xml`, copied to `$HIVE_HOME/conf/hive-site.xml`.

- Embedded Derby metastore: `/home/zabeer_karatt/.busbest/hive/metastore_db`; schema and distribution were both verified as 4.1.0.
- HDFS warehouse: `hdfs://localhost:9000/user/hive/warehouse`.
- Query engine: Hive MapReduce engine with `mapreduce.framework.name=local`; no YARN, Tez, or other compute service was installed or started.
- `hive.server2.enable.doAs=false` for this single-user local setup. The default impersonation setting was rejected by Hadoop simple authentication.
- `/tmp` and `/user/hive/warehouse` were confirmed absent, then created in HDFS with mode `1777` as Hive's working directories.
- Hive 4.1's `hive` command launches Beeline. One temporary local HiveServer2 process was therefore needed for queries. It used `HADOOP_CLIENT_OPTS=-Xmx1024m` and was stopped after verification. Final `jps` showed only the pre-existing NameNode and DataNode (plus Jps); port 10000 was no longer listening.

Schema initialization and verification commands:

```bash
schematool -dbType derby -initSchema
schematool -dbType derby -info
```

Actual result: `Hive distribution version: 4.1.0`; `Metastore schema version: 4.1.0`.

## Table and CSV header handling

The HDFS CSV header inspected for the table was:

```text
bus_id,route_id,user_id,latitude,longitude,timestamp,speed
```

`busbest_gps` is an **external** Hive table over `hdfs://localhost:9000/busbest/cleaned`. Its column types are `STRING, STRING, STRING, DOUBLE, DOUBLE, STRING, DOUBLE`; timestamp remains a string to preserve the actual ISO value. The external table references the existing file and does not duplicate or move it.

On the first run, `TBLPROPERTIES ('skip.header.line.count'='1')` was present in the table metadata, but Hive still read the header as an 11th row in this local setup. I verified the property with `SHOW TBLPROPERTIES`; the actual count query exposed the issue (11 rows and a NULL group). I fixed the analytics by creating the `busbest_gps_records` view, filtering `bus_id <> 'bus_id'` and `speed IS NOT NULL`. The corrected count was 10, and grouped results no longer contained a NULL/header group. No HDFS row or source file was edited.

The executable DDL, view, and analytics SQL are in `queries/hive_analytics.sql`.

## Run commands

Set the environment in Ubuntu and start the temporary local query service:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export HADOOP_HOME=/home/zabeer_karatt/opt/hadoop-3.5.0
export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"
export HIVE_HOME=/home/zabeer_karatt/opt/apache-hive-4.1.0-bin
export HIVE_CONF_DIR="$HIVE_HOME/conf"
export PATH="$HIVE_HOME/bin:$HADOOP_HOME/bin:$HADOOP_HOME/sbin:$JAVA_HOME/bin:$PATH"
export HADOOP_CLIENT_OPTS=-Xmx1024m
cd "$HOME"
$HIVE_HOME/bin/hiveserver2
```

In a second Ubuntu shell, export the same paths, then run:

```bash
cd "/mnt/c/Users/ZABEER KARATT/BUSBEST"
beeline --silent=true --outputformat=tsv2 \
  -u jdbc:hive2://localhost:10000/default \
  -n zabeer_karatt -f queries/hive_analytics.sql
```

Stop the temporary HiveServer2 foreground process with Ctrl+C after use. The script uses `CREATE EXTERNAL TABLE IF NOT EXISTS` and `CREATE OR REPLACE VIEW`; it writes neither a second copy of the CSV nor an analytics output dataset.

## Queries and actual results

The script ran a total record count and the requested five group-by analytics. The corrected total was **10**. Hive's actual results were:

**Average speed by bus (km/h)**

| bus_id | average |
|---|---:|
| B101 | 29.67 |
| B102 | 25.0 |
| B103 | 20.0 |
| B104 | 11.0 |
| B105 | 35.0 |

**Average speed by route (km/h)**

| route_id | average |
|---|---:|
| R01 | 29.67 |
| R02 | 25.0 |
| R03 | 20.0 |
| R04 | 11.0 |
| R05 | 35.0 |

Each route in this small sample contains one bus, so route averages equal the corresponding bus averages.

**Records per bus**

| bus_id | records |
|---|---:|
| B101 | 3 |
| B102 | 2 |
| B103 | 2 |
| B104 | 2 |
| B105 | 1 |

**Maximum speed by bus (km/h)**

| bus_id | maximum |
|---|---:|
| B101 | 31.0 |
| B102 | 26.0 |
| B103 | 21.0 |
| B104 | 22.0 |
| B105 | 35.0 |

**Minimum speed by bus (km/h)**

| bus_id | minimum |
|---|---:|
| B101 | 28.0 |
| B102 | 24.0 |
| B103 | 19.0 |
| B104 | 0.0 |
| B105 | 35.0 |

Hive logs confirmed query stages ran as `Job running in-process (local Hadoop)` and completed successfully. No YARN was used.

## MapReduce comparison and source integrity

Hive average-speed-by-bus results match the earlier MapReduce output at `/busbest/processed/average_speed_by_bus_milestone2/part-r-00000`:

```text
B101  29.67
B102  25.00
B103  20.00
B104  11.00
B105  35.00
```

The HDFS input remained one file, 597 bytes, at `/busbest/cleaned/gps_cleaned.csv`. Its `hdfs dfs -checksum` output before and after Hive was identical:

```text
MD5-of-0MD5-of-512CRC32C  0000020000000000000000002124f50ef1da2c921e0100bd00253c1b
```

The existing MapReduce result directory and contents were also unchanged.

## Problems and fixes

- Hive 4's `hive -S` attempt failed because `hive` invokes Beeline and does not accept the legacy `-S` option. Used Beeline with a temporary local HiveServer2 instead.
- Beeline initially failed with `User ... is not allowed to impersonate ...`; set `hive.server2.enable.doAs=false` for the single-user local configuration.
- The CSV header property was visible in metadata but did not exclude the row in actual reads. Added an explicit header-filtering view and reran all queries; the corrected record count was 10.
- Hive/Hadoop emitted duplicate SLF4J binding and Log4j package-scanning warnings. The metastore, service, and queries nevertheless completed successfully; no Hadoop JARs were removed or modified.
- Embedded Derby writes `derby.log` in the process working directory. The first service run created this diagnostic log in the BUSBEST root; it was removed after confirming it was generated by this task. Start HiveServer2 from `$HOME` (as shown above) so future logs remain in the Linux filesystem.

## Learning summary

Hive maps a schema onto files already in HDFS, stores table metadata in the metastore, translates SQL into a query plan, runs that plan through Hadoop's configured local MapReduce path, and returns grouped results. It makes BUSBEST's GPS history queryable with SQL without loading a duplicate dataset into an application database. These results are from ten simulated records and demonstrate the pipeline, not real traffic analytics.
