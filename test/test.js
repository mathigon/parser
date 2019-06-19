// =============================================================================
// Textbook Parser Tests
// (c) Mathigon
// =============================================================================



const fs = require('fs');
const path = require('path');
const {parse} = require('../src/parser');


async function run() {
  const dir = path.join(process.cwd(), 'test');

  const source = fs.readFileSync(dir + '/input.md', 'utf8');
  const output = await parse('test', source, dir);

  const html = output.data.steps.map(s => output.stepsHTML[s.id]).join('\n\n');
  fs.writeFileSync(dir + '/output.html', html);

  process.exit();
}

run();
