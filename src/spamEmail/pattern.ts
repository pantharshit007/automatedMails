import path from "path";
import { promises as fs } from "fs";

// fetch Ignore email pattern
async function getIgnorePatterns(): Promise<string[]> {
  const ignorePatternPath = path.join(process.cwd(), "src/spamEmail", "ignore_patterns.json");

  try {
    const content = await fs.readFile(ignorePatternPath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading ignore patterns:", err);
    return [];
  }
}

// Email filtering
function shouldIgnoreEmail(emailFrom: string): Promise<boolean> {
  return (async () => {
    const ignoreDomains: string[] = (await getIgnorePatterns()) || [];
    return ignoreDomains.some((pattern) => emailFrom.toLowerCase().includes(pattern.toLowerCase()));
  })();
}

// Ignore list management
async function updateIgnoreList(newPatterns: string[]): Promise<string[]> {
  try {
    const ignorePatternsPath = path.join(process.cwd(), "src/spamEmail", "ignore_patterns.json");

    let currentPatterns: string[] = [];
    try {
      const content = await fs.readFile(ignorePatternsPath, "utf8");
      currentPatterns = JSON.parse(content);
    } catch (err) {
      await fs.writeFile(ignorePatternsPath, JSON.stringify(newPatterns, null, 2));
      console.log("> New ignored patterns file created:", ignorePatternsPath);
    }

    const updatedPatterns = [...new Set([...currentPatterns, ...newPatterns])];
    await fs.writeFile(ignorePatternsPath, JSON.stringify(updatedPatterns, null, 2));

    console.log("> Updated ignore patterns:", updatedPatterns);
    return updatedPatterns;
  } catch (error) {
    console.error("Error updating ignore patterns:", error);
    throw error;
  }
}

export { getIgnorePatterns, shouldIgnoreEmail, updateIgnoreList };
