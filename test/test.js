// =============================================================================
// Textbook Parser Tests
// (c) Mathigon
// =============================================================================



const fs = require('fs');
const path = require('path');
const parseFull = require('../src/full');


const dir = path.join(process.cwd(), 'test');

const source = fs.readFileSync(dir + '/input.md', 'utf8');
const output = parseFull('test', source, dir);

console.log('Biographies:', output.bios);
console.log('Data:', output.data);
fs.writeFileSync(dir + '/output.html', output.html);
