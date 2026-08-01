const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const generatedDirectories = ['dist'];

for (const directory of generatedDirectories) {
  fs.rmSync(path.join(projectRoot, directory), {
    force: true,
    recursive: true,
  });
}
