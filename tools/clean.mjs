// Removes all build output. Kept as a script (rather than an inline `node -e`)
// so it behaves identically on Windows, macOS and Linux.
import { rmSync } from 'node:fs';

for (const dir of ['dist', 'dist-dev']) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`removed ${dir}/`);
}
