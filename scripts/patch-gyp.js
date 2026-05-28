// Patch script: remove "SpectreMitigation: 'Spectre'" from node-pty .gyp files
// to allow building without Spectre-mitigated libs from Visual Studio.
const fs = require('node:fs');
const path = require('node:path');

const files = [
  'node_modules/@homebridge/node-pty-prebuilt-multiarch/binding.gyp',
  'node_modules/@homebridge/node-pty-prebuilt-multiarch/deps/winpty/src/winpty.gyp',
];

for (const rel of files) {
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) {
    console.log(`[patch-gyp] skip (not found): ${rel}`);
    continue;
  }
  const before = fs.readFileSync(file, 'utf-8');
  // Remove the SpectreMitigation entry from msvs_configuration_attributes.
  // Match the line and delete the whole property line.
  const after = before.replace(/^\s*['"]SpectreMitigation['"]\s*:\s*['"]Spectre['"]\s*,?\s*\r?\n/gm, '');
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf-8');
    console.log(`[patch-gyp] patched: ${rel}`);
  } else {
    console.log(`[patch-gyp] already patched or no match: ${rel}`);
  }
}
