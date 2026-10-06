# BUSBEST HDFS Setup — Milestone 2

**Status:** Complete for the local pseudo-distributed HDFS foundation. Results below are actual command output captured on 2026-10-04. GPS rows are the existing BUSBEST cleaned dataset; that dataset is simulated demo data, not real passenger GPS data.

## Environment

- Ubuntu 24.04.4 LTS (Noble), WSL2, x86_64
- Linux user: `zabeer_karatt`
- Java / Javac: OpenJDK 17.0.20.1
- Hadoop: Apache Hadoop 3.5.0
- `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`
- `HADOOP_HOME=/home/zabeer_karatt/opt/hadoop-3.5.0`
- `HADOOP_CONF_DIR=/home/zabeer_karatt/opt/hadoop-3.5.0/etc/hadoop`
- Hadoop is installed in the Linux home filesystem, not system-wide and not under `/mnt/c`.
- WSL memory available at setup: approximately 7.7 GiB.
- YARN was not configured or started.

## Configuration and backup

Before editing, the original Hadoop config files were copied to:

`/home/zabeer_karatt/hadoop-config-backup-20261004-163620/`

SHA-256 values for each original and its backup matched.

`$HADOOP_CONF_DIR/core-site.xml`:

- `fs.defaultFS=hdfs://localhost:9000` — directs Hadoop filesystem clients to this machine's NameNode RPC endpoint.

`$HADOOP_CONF_DIR/hdfs-site.xml`:

- `dfs.replication=1` — stores one copy of each HDFS block because this demo has one DataNode.
- `dfs.namenode.name.dir=file:///home/zabeer_karatt/hadoopdata/hdfs/namenode` — NameNode namespace and block metadata on the Ubuntu filesystem.
- `dfs.datanode.data.dir=file:///home/zabeer_karatt/hadoopdata/hdfs/datanode` — HDFS block files on the Ubuntu filesystem.

`$HADOOP_CONF_DIR/hadoop-env.sh`:

- `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`
- NameNode options: `-Xms256m -Xmx512m`
- DataNode options: `-Xms256m -Xmx512m`

The NameNode and DataNode storage paths were confirmed absent before creation. Both were then created and confirmed empty, with no `current/VERSION` marker, before the single NameNode format operation.

## Commands used

Preflight included version/environment checks, `jps`, inspection of the original XML files, and `hdfs getconf -confKey` for the default filesystem and storage paths. The original files were backed up before configuration changes.

The configured XML files parsed successfully with Python's standard XML parser. `hdfs getconf` returned:

```text
fs.defaultFS                         hdfs://localhost:9000
dfs.replication                      1
dfs.namenode.name.dir                file:///home/zabeer_karatt/hadoopdata/hdfs/namenode
dfs.datanode.data.dir                file:///home/zabeer_karatt/hadoopdata/hdfs/datanode
```

After confirming the target storage directories were new and empty, the following initialization/start commands were run as `zabeer_karatt`:

```bash
hdfs namenode -format
hdfs --daemon start namenode
hdfs --daemon start datanode
```

YARN was not started. HDFS was verified with:

```bash
jps
hdfs dfsadmin -report
hdfs dfs -ls /
hdfs dfs -mkdir -p /busbest/raw /busbest/cleaned /busbest/processed /busbest/output
hdfs dfs -ls -R /busbest
hdfs dfs -put "$HOME/busbest-upload.3SVZxR/gps_cleaned.csv" /busbest/cleaned/
hdfs dfs -cat /busbest/cleaned/gps_cleaned.csv
hdfs dfs -count /busbest/cleaned/gps_cleaned.csv
```

The upload staging copy was made from the existing file at:

`/mnt/c/Users/ZABEER KARATT/BUSBEST/data/cleaned/gps_cleaned.csv`

The staged file was compared byte-for-byte with the source before upload.

## Actual verification results

`jps` showed:

```text
3617 DataNode
3542 NameNode
4796 Jps
```

`hdfs dfsadmin -report` reported **one live DataNode** at `127.0.0.1:9866` (`localhost`). It showed 0 missing blocks, 0 corrupt replicas, and 1 block after the CSV upload. Reported configured capacity was 1006.85 GB; reported DFS remaining capacity was 951.90 GB.

HDFS directories created:

```text
/busbest/raw/
/busbest/cleaned/
/busbest/processed/
/busbest/output/
```

`hdfs dfs -ls -R /busbest` showed those four directories and:

```text
/busbest/cleaned/gps_cleaned.csv  597 bytes
```

`hdfs dfs -count /busbest/cleaned/gps_cleaned.csv` returned 0 directories, 1 file, and 597 bytes. CSV parsing of `hdfs dfs -cat` output counted **10 data records**, excluding the header. The local source also had 10 data records. SHA-256 of the local source and HDFS-read bytes matched:

```text
2509445a677a580a125201e61dc2c0229f2f5dcc5a4ac0c802f110541d64d272
```

The uploaded file's contents were displayed successfully with `hdfs dfs -cat` and contained the header plus 10 cleaned simulated records.

## Problems and solutions

- `hdfs dfs -put` from the readable `/mnt/c/.../gps_cleaned.csv` source reported `No such file or directory`. Bash `stat`, Python reading, and the source checksum all succeeded. The file was copied into a temporary staging directory under Ubuntu home; `cmp` and SHA-256 confirmed it was byte-identical, and upload from the Linux filesystem succeeded. The original project file was not changed.
- `hdfs dfs -ls -l` returned `Illegal option -l` in Hadoop 3.5.0. The supported `hdfs dfs -ls` / `-ls -R` forms were used instead.
- An initial XML validation command passed a literal `$HADOOP_CONF_DIR` into Python and failed to find that literal path. The validation was rerun with explicit config paths and both XML files parsed successfully; no configuration changes were needed to resolve it.

## Concepts demonstrated

- **NameNode:** keeps HDFS namespace metadata, including directories, file-to-block mappings, and block locations. It does not hold the CSV's block bytes.
- **DataNode:** stores HDFS block bytes and reports its blocks to the NameNode. Here one DataNode is running on the same WSL machine as the NameNode.
- **Replication:** HDFS can maintain multiple block copies on separate DataNodes for resilience. Replication is set to 1 for this one-DataNode demo, so the setup has no second copy and does not demonstrate fault tolerance.

This is a single-machine teaching environment. It demonstrates HDFS commands and storage, not a multi-host cluster or production resilience.
