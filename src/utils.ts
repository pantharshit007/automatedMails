import path from "path";
import { promises as fs } from "fs";

// Timestamp management
async function getLastProcessedTime(): Promise<number> {
  const timestampPath = path.join(process.cwd(), "last_processed.txt");
  try {
    const timestamp = await fs.readFile(timestampPath, "utf8");
    return parseInt(timestamp);
  } catch (err) {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    await fs.writeFile(timestampPath, fiveMinutesAgo.toString());
    return fiveMinutesAgo;
  }
}

async function updateLastProcessedTime(timestamp: number): Promise<void> {
  const timestampPath = path.join(process.cwd(), "last_processed.txt");
  await fs.writeFile(timestampPath, timestamp.toString());
}

export { getLastProcessedTime, updateLastProcessedTime };
