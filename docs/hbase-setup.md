# BUSBEST HBase Setup and Lookup

## Environment and compatibility

- Ubuntu 24.04.4 LTS on WSL2; Java 17.0.20.1; Hadoop 3.5.0.
- Installed Apache HBase `2.6.7-hadoop3` from the official binary archive at `~/opt/hbase-2.6.7`.
- Apache's compatibility guide lists Java 17 support for HBase 2.6 and Hadoop 3.4.0+ support for HBase 2.6.2+. This covers the project's Hadoop 3.5.0. The downloaded archive's SHA-512 matched Apache's published `2E0835A3...454ED82D` checksum.
- Downloads were kept in `~/Downloads`; HBase is installed under the Ubuntu Linux home, not Windows or `/mnt/c`.

References: [Apache HBase downloads](https://hbase.apache.org/downloads/), [HBase compatibility guide](https://hbase.apache.org/docs/configuration/basic-prerequisites/), [official HBase 2.6.7 archive and checksums](https://downloads.apache.org/hbase/2.6.7/).

## Configuration

Backups of the original configuration are beside the active files:

- `~/opt/hbase-2.6.7/conf/hbase-site.xml.bak`
- `~/opt/hbase-2.6.7/conf/hbase-env.sh.bak`

`hbase-site.xml` configures:

- `hbase.rootdir=hdfs://localhost:9000/hbase` so HBase table files use the existing HDFS NameNode. HBase created `/hbase`; it did not touch `/busbest/cleaned`.
- `hbase.cluster.distributed=true` for the one-host pseudo-distributed HBase services.
- `hbase.zookeeper.quorum=localhost` and ZooKeeper state at `/home/zabeer_karatt/.busbest/hbase-zookeeper`.
- `hbase.unsafe.stream.capability.enforce=true`, retaining HBase's normal safety check because the backing filesystem is HDFS.

`hbase-env.sh` sets the existing Java 17 `JAVA_HOME`, `HBASE_HEAPSIZE=512`, and user-local PID/log directories. HBase status reported a 512 MB RegionServer heap. Its bundled ZooKeeper was used; YARN and SSH were not used.

The Ubuntu user's `~/.bashrc` now persists `HBASE_HOME`, `HBASE_CONF_DIR`, and the HBase `bin` path. A new interactive shell resolved `hbase` to `~/opt/hbase-2.6.7/bin/hbase` and reported `HBase 2.6.7-hadoop3`.

The WSL command environment used for the checks was:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export HADOOP_HOME=$HOME/opt/hadoop-3.5.0
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop
export HBASE_HOME=$HOME/opt/hbase-2.6.7
export HBASE_CONF_DIR=$HBASE_HOME/conf
export HBASE_HEAPSIZE=512 HBASE_MANAGES_ZK=true
export HBASE_PID_DIR=$HOME/.busbest/hbase/pids
export HBASE_LOG_DIR=$HOME/.busbest/hbase/logs
export PATH=$HBASE_HOME/bin:$HADOOP_HOME/bin:$HADOOP_HOME/sbin:$PATH
```

## Start and verification commands

The daemon `autostart` mode kept services alive after a WSL command shell exited. Started as the normal Ubuntu user, from the Linux home:

```bash
hbase-daemon.sh autostart zookeeper
hbase-daemon.sh autostart master
hbase-daemon.sh autostart regionserver
jps
hbase shell -n
```

Actual process listing included `HQuorumPeer`, `HMaster`, and `HRegionServer`, alongside the already-running HDFS `NameNode` and `DataNode`. HBase `status 'simple'` reported one active master, one live server, zero dead servers, and a 512 MB max RegionServer heap. `hdfs dfs -ls /hbase` showed HBase's metadata, WAL, and table-data directories.

An initial direct `start` attempt lost ZooKeeper when the WSL shell ended; HBase logs then showed `Connection refused` to `localhost:2181`. Switching to the launcher's `autostart` mode resolved this; the services persisted and status checks passed. HBase and Hadoop also emitted an SLF4J multiple-binding warning; the selected binding was Log4j and the HBase operations below succeeded.

## Table and data loading

The input is the existing cleaned **SIMULATED DEMO GPS** CSV at `/busbest/cleaned/gps_cleaned.csv` (10 data rows), with header:

```text
bus_id,route_id,user_id,latitude,longitude,timestamp,speed
```

The table was created with:

```text
create 'busbest_bus_state', {NAME=>'info', VERSIONS=>1}, {NAME=>'location', VERSIONS=>1}, {NAME=>'telemetry', VERSIONS=>1}
```

Row key is `bus_id`. Qualifiers are `info:route_id`, `location:latitude`, `location:longitude`, `telemetry:speed`, and `telemetry:timestamp`. `user_id` is not copied into the lookup table.

[`scripts/load_latest_hbase.py`](../scripts/load_latest_hbase.py) reads the CSV from HDFS with `hdfs dfs -cat`, chooses the greatest ISO timestamp per bus, and writes those five qualifiers per row through one HBase Shell session. Preview and load commands (with the environment above):

```bash
cd /mnt/c/Users/ZABEER\ KARATT/BUSBEST
python3 scripts/load_latest_hbase.py --show-latest
python3 scripts/load_latest_hbase.py
```

Actual latest source rows selected:

| Row key | Route | Latitude | Longitude | Source timestamp | Speed |
|---|---|---:|---:|---|---:|
| B101 | R01 | 9.593 | 76.5241 | 2026-10-01T10:00:10 | 30.0 |
| B102 | R02 | 9.6018 | 76.532 | 2026-10-01T10:00:07 | 26.0 |
| B103 | R03 | 9.6128 | 76.541 | 2026-10-01T10:01:08 | 21.0 |
| B104 | R04 | 9.621 | 76.5511 | 2026-10-01T10:02:09 | 22.0 |
| B105 | R05 | 9.63 | 76.561 | 2026-10-01T10:03:00 | 35.0 |

The loader reported: `Loaded 5 latest bus rows from /busbest/cleaned/gps_cleaned.csv into busbest_bus_state.`

## Actual HBase verification

Commands run in the HBase shell:

```text
exists 'busbest_bus_state'
describe 'busbest_bus_state'
count 'busbest_bus_state'
scan 'busbest_bus_state'
get 'busbest_bus_state', 'B101'
```

Results: the table exists and is enabled; `describe` showed the three column families `info`, `location`, and `telemetry`; `count` returned `5`; `scan` returned exactly B101 through B105 with the values in the table above. `get` for B101 returned route R01, latitude 9.593, longitude 76.5241, speed 30.0, and source timestamp `2026-10-01T10:00:10`.

HBase's cell timestamps in `scan`/`get` are write times on 2026-10-05. The original GPS observation time is stored as the `telemetry:timestamp` cell value and matches the source CSV.

The HDFS source checksum after loading was still:

```text
0000020000000000000000002124f50ef1da2c921e0100bd00253c1b
```

This matches the checksum recorded before HBase work; the source CSV was not edited or overwritten.

## Role in BUSBEST

- **HDFS** stores large files such as the full cleaned GPS history.
- **Hive** runs SQL-style scans and grouped analytics over that history.
- **HBase** stores the compact latest state keyed by `bus_id`, so an application can fetch a bus row directly without scanning the CSV.

The HBase table is a fast lookup view of the five latest bus observations in this small simulated dataset; it is not a real passenger tracking feed.
