import { readFile, writeFile } from 'node:fs/promises';
import { uprightPdf } from './upright.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node bot/upright-cli.js <pdf>');
  process.exit(1);
}

const input = await readFile(file);
const output = await uprightPdf(input);
if (Buffer.compare(input, output) === 0) {
  console.log(`Pages already upright: ${file}`);
} else {
  await writeFile(file, output);
  console.log(`Turned pages upright: ${file}`);
}
