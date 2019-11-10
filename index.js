// =============================================================================
// Textbooks Parser Gulp Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const through2 = require('through2');
const yaml = require('yamljs');
const File = require('vinyl');

const {parse, parseSimple} = require('./src/parser');

const YAML_CACHE = new Map();


function loadFile(root, name, locale) {
  if (locale !== 'en') name = 'translations/' + name.replace('.', `_${locale}.`);
  const file = path.join(root, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

async function parseYAML(data, textField = null) {
  for (let d of Object.keys(data)) {
    if (textField) {
      // Used for bios and glossary.
      data[d][textField] = await parseSimple(data[d][textField]);
    } else if (Array.isArray(data[d]) && (typeof data[d][0] === 'string')) {
      // Used for hint arrays
      data[d] = await Promise.all(data[d].map(x => parseSimple(x)));
    } else if (typeof data[d][0] === 'string') {
      // Used for individual hints.
      data[d] = await parseSimple(data[d]);
    }
  }
}

async function loadYAML(base, name, textField = null, locale = 'en') {
  const id = base + '-' + name + '-' + locale;
  if (YAML_CACHE.has(id)) return YAML_CACHE.get(id);

  const text = loadFile(base, name, locale);
  const data = text ? yaml.parse(text) || {} : {};
  await parseYAML(data, textField);

  if (locale !== 'en') {
    const fallback = await loadYAML(base, name, textField, 'en');
    for (let d of Object.keys(fallback)) {
      if (!data[d]) data[d] = fallback[d];
    }
  }

  YAML_CACHE.set(id, data);
  return data;
}

// -----------------------------------------------------------------------------

function createFile(dest, name, content) {
  return new File({
    base: dest,
    path: path.join(dest, name),
    contents: Buffer.from(content)
  });
}

async function generate(content, base, id, locale) {
  const dest = path.join(base, '../');
  const shared = path.join(base, '../shared');

  const {bios, gloss, data} = await parse(id, content, base);

  const biosData = await loadYAML(shared, 'bios.yaml', 'bio', locale);
  const biosObj = {};
  for (let b of bios) {
    if (!(b in biosData)) console.warn('Missing bio: ' + b);
    biosObj[b] = biosData[b];
  }
  const biosFile = createFile(dest, `${id}/bios_${locale}.json`, JSON.stringify(biosObj));

  const glossData = await loadYAML(shared, 'glossary.yaml', 'text', locale);
  const glossObj = {};
  for (let g of gloss) {
    if (!(g in glossData)) console.warn('Missing glossary: ' + g);
    glossObj[g] = glossData[g];
  }
  const glossFile = createFile(dest, `${id}/glossary_${locale}.json`, JSON.stringify(glossObj));

  const courseHints = await loadYAML(base, 'hints.yaml', null, locale);
  const globalHints = await loadYAML(shared, 'hints.yaml', null, locale);
  const hintsObj = Object.assign({}, globalHints, courseHints);
  const hintsFile = createFile(dest, `${id}/hints_${locale}.json`, JSON.stringify(hintsObj));

  const dataFile = createFile(dest, `${id}/data_${locale}.json`, JSON.stringify(data));
  return [dataFile, biosFile, glossFile, hintsFile];
}

// -----------------------------------------------------------------------------

module.exports.gulp = (languages = ['en'], cacheFile = '') => {
  return through2.obj(async function (file, _, next) {
    const id = file.basename;

    const cacheData = cacheFile && fs.existsSync(cacheFile) ?
        JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

    const promises = [];
    for (let locale of languages) {
      const content = loadFile(file.path, 'content.md', locale);
      if (!content) continue;

      const hash = crypto.createHash('md5').update(content).digest('hex');
      if (cacheData[file.basename + '-' + locale] === hash) continue;
      cacheData[id + '-' + locale] = hash;

      console.log(`>> Parsing ${id} / ${locale}`);
      promises.push(generate(content, file.path, id, locale))
    }

    if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(cacheData));

    const fileSets = await Promise.all(promises);
    for (const files of fileSets) {
      for (const f of files) this.push(f);
    }

    next();
  });
};

module.exports.parseFull = parse;
module.exports.parseSimple = parseSimple;
module.exports.loadYAML = loadYAML;
