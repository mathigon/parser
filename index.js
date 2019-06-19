// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const yaml = require('yamljs');

const {parse, parseSimple} = require('./src/parser');


// -----------------------------------------------------------------------------

function loadFile(root, name, locale) {
  if (locale !== 'en') name = 'translations/' + name.replace('.', `_${locale}.`);
  const file = path.join(root, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

async function loadYAML(path, name, textField = null, locale = 'en', fallback = {}) {
  const text = loadFile(path, name, locale);
  const data = text ? yaml.parse(text) || {} : {};

  for (let d of Object.keys(data)) {
    if (textField) {
      // Used for bios and glossary.
      data[d][textField] = await parseSimple(data[d][textField]);
    } else if (Array.isArray(data[d])) {
      // Used for hint arrays
      data[d] = await Promise.all(data[d].map(x => parseSimple(x)));
    } else {
      // Used for individual hints.
      data[d] = await parseSimple(data[d]);
    }
  }

  for (let d of Object.keys(fallback)) {
    if (!data[d]) data[d] = fallback[d];
  }

  return data;
}

// -----------------------------------------------------------------------------

async function generate(grunt, content, src, dest, id, allBios, allGloss, sharedHints, locale) {
  let {bios, gloss, data, stepsHTML, sectionsHTML} = await parse(id, content, src);
  grunt.file.write(dest + '/data.json', JSON.stringify(data));

  let biosObj = {};
  for (let b of bios) {
    if (!(b in allBios)) grunt.log.error('Missing bio: ' + b);
    biosObj[b] = allBios[b];
  }
  grunt.file.write(dest + '/bios.json', JSON.stringify(biosObj));

  let glossObj = {};
  for (let g of gloss) {
    if (!(g in allGloss)) grunt.log.error('Missing glossary: ' + g);
    glossObj[g] = allGloss[g];
  }
  grunt.file.write(dest + '/glossary.json', JSON.stringify(glossObj));

  // TODO Fall back to the English hints if missing!
  const hints = await loadYAML(src, 'hints.yaml', null, locale, sharedHints);
  grunt.file.write(dest + '/hints.json', JSON.stringify(hints));

  for (let s of Object.keys(stepsHTML)) {
    grunt.file.write(dest + `/steps/${s}.html`, stepsHTML[s]);
  }

  for (let s of Object.keys(sectionsHTML)) {
    grunt.file.write(dest + `/sections/${s}.html`, sectionsHTML[s]);
  }
}

// -----------------------------------------------------------------------------

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooks', 'Mathigon Markdown parser.', async function() {
    const options = this.options({root: 'content', languages: ['en'], cache: false});
    const done = this.async();

    const root = path.join(process.cwd(), options.root);
    const shared = root + '/shared';

    const cacheFile = path.join(process.cwd(), this.files[0].dest, '../cache.json');
    const cache = grunt.file.exists(cacheFile) ? grunt.file.readJSON(cacheFile) : {};

    const bios = await loadYAML(shared, 'bios.yaml', 'bio');
    const gloss = await loadYAML(shared, 'glossary.yaml', 'text');
    const hints = await loadYAML(shared, 'hints.yaml');

    for (let locale of options.languages) {
      const localBios = await loadYAML(shared, 'bios.yaml', 'bio', locale, bios);
      const localGloss = await loadYAML(shared, 'glossary.yaml', 'text', locale, gloss);
      const localHints = await loadYAML(shared, 'hints.yaml', null, locale, hints);

      for (let file of this.files) {
        const id = file.src[0].split('/')[file.src[0].split('/').length - 1];
        const src = path.join(process.cwd(), file.src[0]);
        const dest = path.join(process.cwd(), file.dest, locale);

        const content = loadFile(src, 'content.md', locale);
        if (!content) continue;

        if (options.cache) {
          const hash = crypto.createHash('md5').update(content).digest('hex');
          if (cache[id + '-' + locale] === hash) continue;
          cache[id + '-' + locale] = hash;
          console.log(`>> Parsing ${id} / ${locale}`);
        }

        await generate(grunt, content, src, dest, id, localBios, localGloss, localHints, locale)
      }
    }

    if (options.cache) grunt.file.write(cacheFile, JSON.stringify(cache));
    done();
  });
};

module.exports.parseFull = parse;
module.exports.parseSimple = parseSimple;
