const fs = require('fs').promises;
const path = require('path');

const IGNORE_DIRS = ['node_modules', 'dist', '.git'];

async function findEmptyFiles(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      await findEmptyFiles(fullPath);
    } else if (entry.isFile()) {
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size === 0) {
          console.log(fullPath);
        }
      } catch (e) {
        // ignore errors
      }
    }
  }
}

(async () => {
  const startDir = process.cwd();
  await findEmptyFiles(startDir);
})();

