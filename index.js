// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const yaml = require('yamljs');

const {parseFull, parseSimple} = require('./src/full');
// const parseText = require('./src/text');


// -----------------------------------------------------------------------------

function loadFile(src, name, locale) {
  const localFile = name.replace('.', `_${locale}.`);
  const localPath = path.join(src, 'translations', localFile);
  if (fs.existsSync(localPath)) return fs.readFileSync(localPath, 'utf8');

  const defaultPath = path.join(src, name);
  if (fs.existsSync(defaultPath)) return fs.readFileSync(defaultPath, 'utf8');

  return '';
}

function generate(grunt, src, dest, id, allBios, allGloss, sharedHints, locale, cache) {
  let content = loadFile(src, 'content.md', locale);

  // Only parse files that changed.
  if (cache) {
    const hash = crypto.createHash('md5').update(content).digest('hex');
    if (cache[id + '-' + locale] === hash) return;
    cache[id + '-' + locale] = hash;
    console.log(`>> Parsing ${id} / ${locale}`);
  }

  let {bios, gloss, data, stepsHTML, sectionsHTML} = parseFull(id, content, src);
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

  const hintsObj = {};
  const hints = yaml.parse(loadFile(src, 'hints.yaml', locale) || '{}');
  for (let h of Object.keys(hints)) hintsObj[h] = parseSimple(hints[h]);
  Object.assign(hintsObj, sharedHints);
  grunt.file.write(dest + '/hints.json', JSON.stringify(hintsObj));

  for (let s of Object.keys(stepsHTML)) {
    grunt.file.write(dest + `/steps/${s}.html`, stepsHTML[s]);
  }

  for (let s of Object.keys(sectionsHTML)) {
    grunt.file.write(dest + `/sections/${s}.html`, sectionsHTML[s]);
  }
}

// -----------------------------------------------------------------------------

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooks', 'Mathigon Markdown parser.', function() {
    const options = this.options({root: 'content', languages: ['en'], cache: false});
    const root = path.join(process.cwd(), options.root);

    const cacheFile = path.join(process.cwd(), this.files[0].dest, '../cache.json');
    const cache = options.cache ? (grunt.file.exists(cacheFile) ? grunt.file.readJSON(cacheFile) : {}) : null;

    for (let locale of options.languages) {

      const bios = yaml.parse(loadFile(root + '/shared', 'bios.yaml', locale));
      for (let b of Object.keys(bios)) bios[b].bio = parseSimple(bios[b].bio);

      const gloss = yaml.parse(loadFile(root + '/shared', 'glossary.yaml', locale));
      for (let g of Object.keys(gloss)) gloss[g].text = parseSimple(gloss[g].text);

      const hints = yaml.parse(loadFile(root + '/shared', 'hints.yaml', locale));
      for (let h of Object.keys(hints)) {
        if (Array.isArray(hints[h])) {
          hints[h] = hints[h].map(h => parseSimple(h));
        } else {
          hints[h] = parseSimple(hints[h]);
        }
      }

      for (let file of this.files) {
        const id = file.src[0].split('/')[file.src[0].split('/').length - 1];
        const src = path.join(process.cwd(), file.src[0]);
        const dest = path.join(process.cwd(), file.dest, locale);
        generate(grunt, src, dest, id, bios, gloss, hints, locale, cache)
      }
    }

    if (options.cache) grunt.file.write(cacheFile, JSON.stringify(cache));
  });
};
