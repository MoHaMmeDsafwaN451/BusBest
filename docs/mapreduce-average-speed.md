# BUSBEST First MapReduce Job: Average Speed per Bus

**Status:** Executed successfully on 2026-10-04 against the existing HDFS input. Input is **SIMULATED DEMO DATA**, not real passenger GPS data.

## Input schema inspected in HDFS

The header read from `/busbest/cleaned/gps_cleaned.csv` was:

```text
bus_id,route_id,user_id,latitude,longitude,timestamp,speed
```

The seven fields are bus identifier, route identifier, synthetic contributor identifier, latitude, longitude, ISO local timestamp, and speed in km/h. `bus_id` is the grouping key and `speed` is the measured value. This job reads the cleaned CSV and does not change it.

The current rows are plain comma-separated fields without quoted commas. The Mapper expects this seven-column format. It checks required identifiers, coordinate ranges, ISO local timestamp syntax, and speed in `[0, 160]` km/h, matching the existing cleaner's rules.

## What the MapReduce stages do

1. **Input / Mapper:** Hadoop's `TextInputFormat` supplies a `LongWritable` byte offset and a `Text` containing one full input line. The Mapper ignores the row whose first field is `bus_id`. For each valid data row it emits `Text(bus_id)` as key and `DoubleWritable(speed)` as value. Rows with a wrong field count or invalid fields increment skip counters and produce no key/value pair.
2. **Shuffle and sort:** Hadoop groups values by the key and sorts keys. For example, the three B101 values are brought together under one key. This is Hadoop's actual shuffle path; the job log reported one shuffled map.
3. **Reducer:** The Reducer receives one `Text` bus ID and an iterable of its `DoubleWritable` speeds. It sums the speeds, counts them, and emits `(bus_id, arithmetic mean)` rounded to two decimal places.
4. **Output:** `TextOutputFormat` writes each key and value separated by a tab into `part-r-00000` under the HDFS output directory.

## Implementation

Source: `src/mapreduce/AverageSpeedByBus.java`.

The driver checks that the requested output path does not already exist and fails rather than overwriting it. The job uses one reducer so the demonstration produces one result file. The `HEADER_ROWS`, `SKIPPED_ROWS`, `WRONG_COLUMN_COUNT`, and `INVALID_FIELDS` counters summarize the input validation. Hadoop omits custom counters whose value is zero from its printed report.

## Build and run

The build used the existing Hadoop installation and JDK; it added no dependencies and installed no services. Commands below reflect the actual Ubuntu paths and output name used:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export HADOOP_HOME=/home/zabeer_karatt/opt/hadoop-3.5.0
export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"
export PATH="$HADOOP_HOME/bin:$HADOOP_HOME/sbin:$JAVA_HOME/bin:$PATH"

cd "/mnt/c/Users/ZABEER KARATT/BUSBEST"
mkdir -p "$HOME/busbest-mr-build/classes"
javac -classpath "$(hadoop classpath)" \
  -d "$HOME/busbest-mr-build/classes" \
  src/mapreduce/AverageSpeedByBus.java
jar cf "$HOME/busbest-mr-build/busbest-average-speed.jar" \
  -C "$HOME/busbest-mr-build/classes" .
hadoop jar "$HOME/busbest-mr-build/busbest-average-speed.jar" \
  busbest.mapreduce.AverageSpeedByBus \
  /busbest/cleaned/gps_cleaned.csv \
  /busbest/processed/average_speed_by_bus_milestone2
```

The HDFS output path was checked and absent before running. Build artifacts are in the Ubuntu user's home directory, outside the project. Hadoop reported `mapreduce.framework.name=local`: this is Hadoop's local MapReduce runner reading/writing HDFS. It demonstrates the Mapper, local shuffle/sort, and Reducer, but it is not parallel execution across worker nodes. YARN was not started.

## Actual run results

Hadoop 3.5.0 compiled the source successfully. The JAR contained the driver, `SpeedMapper`, `AverageReducer`, and input counter classes. Hadoop submitted and completed job `job_local513872554_0001` successfully.

Actual Hadoop job counters:

```text
Map input records=11
Map output records=10
HEADER_ROWS=1
Reduce input groups=5
Reduce input records=10
Reduce output records=5
Shuffled Maps =1
HDFS: Number of bytes read=1194
HDFS: Number of bytes written=55
```

The input line count includes the header, so 11 lines became 10 emitted key/value pairs. No invalid rows were skipped: the job emitted 10 pairs from the 10 data rows, and the `SKIPPED_ROWS` counter was zero (therefore omitted from the counters display).

The exact key/value pairs produced by the Mapper for those 10 rows, in input order, are:

```text
(B101, 28.0)  (B101, 31.0)  (B101, 30.0)
(B102, 24.0)  (B102, 26.0)
(B103, 19.0)  (B103, 21.0)
(B104, 0.0)   (B104, 22.0)
(B105, 35.0)
```

Hadoop keeps these Mapper pairs in its internal shuffle rather than printing each payload to the console. The job's actual counters report ten Mapper outputs; the pair list above is the direct application of the compiled Mapper to each row displayed from the HDFS source.

## Actual HDFS verification

Commands run:

```bash
hdfs dfs -ls /busbest/processed/average_speed_by_bus_milestone2
hdfs dfs -cat /busbest/processed/average_speed_by_bus_milestone2/part-r-00000
hdfs dfs -count /busbest/processed/average_speed_by_bus_milestone2
```

The listing contained `_SUCCESS` (0 bytes) and `part-r-00000` (55 bytes). The actual result file contents were:

```text
B101	29.67
B102	25.00
B103	20.00
B104	11.00
B105	35.00
```

HDFS `-count` returned 1 directory, 2 files, and 55 total bytes for the output directory. The two files are the zero-byte success marker and the 55-byte reducer output.

## Independent calculation

Separately, the same local cleaned CSV was grouped by `bus_id` in PowerShell and each speed was parsed and averaged directly. This calculation did not call the Java Mapper or Reducer. It matched the HDFS output:

| bus_id | Speeds (km/h) | Independent mean (km/h) | Hadoop output (km/h) |
|---|---:|---:|---:|
| B101 | 28, 31, 30 | 29.67 | 29.67 |
| B102 | 24, 26 | 25.00 | 25.00 |
| B103 | 19, 21 | 20.00 | 20.00 |
| B104 | 0, 22 | 11.00 | 11.00 |
| B105 | 35 | 35.00 | 35.00 |

For example, B101 is `(28 + 31 + 30) / 3 = 29.666…`, formatted to `29.67` km/h. The stationary B104 observation with speed `0.0` is valid under the cleaner's rule and participates in the average.

## Issues encountered

- A noninteractive WSL shell did not load the interactive `.bashrc` Hadoop exports. The commands were run with the verified Java/Hadoop paths exported for that shell; no shell configuration was changed.
- `hadoop getconf` is not a valid Hadoop 3.5.0 subcommand. `hdfs getconf -confKey mapreduce.framework.name` returned `local`.
- The first independent PowerShell aggregation attempt used a `Measure-Object` property form that returned null. It was replaced by explicit invariant-culture parsing and arithmetic; the resulting means matched all five HDFS output rows.

## Concepts demonstrated

- **Mapper:** converts each GPS row into a bus key and speed value.
- **Shuffle/sort:** brings all speed values for the same bus ID to the same Reducer call.
- **Reducer:** calculates the arithmetic mean for each bus.
- **HDFS input/output:** the source remained at `/busbest/cleaned/gps_cleaned.csv`; results were written to a new path under `/busbest/processed/`.

This completes only the first MapReduce job. Hive, Pig, HBase, Spark, and YARN were not installed or started.
