package busbest.mapreduce;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Locale;

import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.io.LongWritable;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Job;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;
import org.apache.hadoop.mapreduce.lib.input.FileInputFormat;
import org.apache.hadoop.mapreduce.lib.output.FileOutputFormat;

/** Calculate mean GPS speed in km/h per bus from the cleaned BUSBEST CSV. */
public final class AverageSpeedByBus {
    private static final int EXPECTED_COLUMNS = 7;
    private static final double MAX_SPEED_KMH = 160.0;

    private AverageSpeedByBus() { }

    public enum InputCounters {
        HEADER_ROWS,
        SKIPPED_ROWS,
        WRONG_COLUMN_COUNT,
        INVALID_FIELDS
    }

    public static final class SpeedMapper extends Mapper<LongWritable, Text, Text, org.apache.hadoop.io.DoubleWritable> {
        private final Text busId = new Text();
        private final org.apache.hadoop.io.DoubleWritable speedValue = new org.apache.hadoop.io.DoubleWritable();

        @Override
        protected void map(LongWritable offset, Text line, Context context) throws IOException, InterruptedException {
            String[] columns = line.toString().split(",", -1);
            if (columns.length > 0 && "bus_id".equalsIgnoreCase(columns[0].trim())) {
                context.getCounter(InputCounters.HEADER_ROWS).increment(1);
                return;
            }
            if (columns.length != EXPECTED_COLUMNS) {
                context.getCounter(InputCounters.SKIPPED_ROWS).increment(1);
                context.getCounter(InputCounters.WRONG_COLUMN_COUNT).increment(1);
                return;
            }

            String id = columns[0].trim();
            try {
                double latitude = Double.parseDouble(columns[3].trim());
                double longitude = Double.parseDouble(columns[4].trim());
                double speed = Double.parseDouble(columns[6].trim());
                LocalDateTime.parse(columns[5].trim());
                boolean requiredPresent = !id.isEmpty()
                        && !columns[1].trim().isEmpty()
                        && !columns[2].trim().isEmpty();
                boolean validNumbers = Double.isFinite(latitude) && latitude >= -90 && latitude <= 90
                        && Double.isFinite(longitude) && longitude >= -180 && longitude <= 180
                        && Double.isFinite(speed) && speed >= 0 && speed <= MAX_SPEED_KMH;
                if (!requiredPresent || !validNumbers) {
                    skipInvalid(context);
                    return;
                }
                busId.set(id);
                speedValue.set(speed);
                context.write(busId, speedValue);
            } catch (NumberFormatException | DateTimeParseException ex) {
                skipInvalid(context);
            }
        }

        private static void skipInvalid(Context context) {
            context.getCounter(InputCounters.SKIPPED_ROWS).increment(1);
            context.getCounter(InputCounters.INVALID_FIELDS).increment(1);
        }
    }

    public static final class AverageReducer extends Reducer<Text, org.apache.hadoop.io.DoubleWritable, Text, Text> {
        private final Text averageText = new Text();

        @Override
        protected void reduce(Text busId, Iterable<org.apache.hadoop.io.DoubleWritable> speeds, Context context)
                throws IOException, InterruptedException {
            double total = 0.0;
            long count = 0;
            for (org.apache.hadoop.io.DoubleWritable speed : speeds) {
                total += speed.get();
                count++;
            }
            if (count > 0) {
                averageText.set(String.format(Locale.ROOT, "%.2f", total / count));
                context.write(busId, averageText);
            }
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("Usage: AverageSpeedByBus <hdfs-input-csv> <new-hdfs-output-dir>");
            System.exit(2);
        }

        Configuration configuration = new Configuration();
        Path output = new Path(args[1]);
        FileSystem fileSystem = output.getFileSystem(configuration);
        if (fileSystem.exists(output)) {
            throw new IOException("Refusing to overwrite existing output path: " + output);
        }

        Job job = Job.getInstance(configuration, "BUSBEST average speed per bus");
        job.setJarByClass(AverageSpeedByBus.class);
        job.setMapperClass(SpeedMapper.class);
        job.setReducerClass(AverageReducer.class);
        job.setMapOutputKeyClass(Text.class);
        job.setMapOutputValueClass(org.apache.hadoop.io.DoubleWritable.class);
        job.setOutputKeyClass(Text.class);
        job.setOutputValueClass(Text.class);
        job.setNumReduceTasks(1);

        FileInputFormat.addInputPath(job, new Path(args[0]));
        FileOutputFormat.setOutputPath(job, output);

        System.exit(job.waitForCompletion(true) ? 0 : 1);
    }
}
