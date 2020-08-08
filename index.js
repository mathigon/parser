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
const {getAudioTimings, writeAudioTimings, extractText, textHash} = require('./src/audio');

const YAML_CACHE = new Map();


function warning(...msg) {
  console.warn('\x1b[31m', ...msg, '\x1b[0m');
}

function loadFile(root, name, locale) {
  if (locale !== 'en') name = 'translations/' + name.replace('.', `_${locale}.`);
  const file = path.join(root, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function replaceMarkdown(data) {
  // If data is an array, we replace all items in the array.
  if (Array.isArray(data)) {
    return Promise.all(data.map(x => parseSimple(x)));
  } else {
    return parseSimple(data);
  }
}

async function parseYAML(data, markdownFields) {
  if (markdownFields === '*') {
    // Hints: we replace all top-level values
    for (const key of Object.keys(data)) {
      data[key] = await replaceMarkdown(data[key]);
    }
  } else if (markdownFields) {
    // Bio, Gloss and Quiz: we loop over all object and replace specific fields.
    for (const obj of Object.values(data)) {  // data can be an object or array!
      for (const field of markdownFields.split(',')) {
        obj[field] = obj[field] ? await replaceMarkdown(obj[field]) : '';
      }
    }
  }
}

async function loadYAML(base, name, markdownFields, locale = 'en') {
  const id = base + '-' + name + '-' + locale;
  if (YAML_CACHE.has(id)) return YAML_CACHE.get(id);

  const text = loadFile(base, name, locale);
  const data = text ? yaml.parse(text) || {} : {};
  await parseYAML(data, markdownFields);

  if (locale !== 'en') {
    const fallback = await loadYAML(base, name, markdownFields, 'en');
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

async function combineData(name, parsed, dest, courseId, textField, locale) {
  const missing = [];
  const data = await loadYAML(dest + 'shared', name + '.yaml', textField, locale);
  const obj = {};

  for (let id of parsed) {
    if (id in data) {
      obj[id] = data[id];
    } else {
      missing.push(id);
    }
  }

  if (locale === 'en' && missing.length) {
    warning(`  Missing ${name}: ${missing.join(', ')}`);
  }

  return createFile(dest, `${courseId}/${name}_${locale}.json`, JSON.stringify(obj));
}

async function generate(content, base, id, locale) {
  const {bios, gloss, data} = await parse(id, content, base, locale);
  const dest = path.join(base, '../');

  const biosFile = await combineData('bios', bios, dest, id, 'bio', locale);
  const glossFile = await combineData('glossary', gloss, dest, id, 'text', locale);

  const quizObj = await loadYAML(base, 'quiz.yaml', 'text,choices,hints', locale);
  const quizFile = createFile(dest, `${id}/quiz_${locale}.json`, JSON.stringify(quizObj));

  const courseHints = await loadYAML(base, 'hints.yaml', '*', locale);
  const globalHints = await loadYAML(dest + 'shared', 'hints.yaml', '*', locale);
  const hintsObj = Object.assign({}, globalHints, courseHints);
  const hintsFile = createFile(dest, `${id}/hints_${locale}.json`, JSON.stringify(hintsObj));

  const dataFile = createFile(dest, `${id}/data_${locale}.json`, JSON.stringify(data));
  return [dataFile, biosFile, glossFile, hintsFile, quizFile];
}

// -----------------------------------------------------------------------------

module.exports.gulp = (languages = ['en'], cacheFile = '') => {
  return through2.obj(async function (file, _, next) {
    const id = file.basename;

    const cacheData = cacheFile && fs.existsSync(cacheFile) ?
        JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

    const promises = [];
    const locales = [];

    for (let locale of languages) {
      const content = loadFile(file.path, 'content.md', locale);
      if (!content) continue;

      const hash = crypto.createHash('md5').update(content).digest('hex');
      if (cacheData[file.basename + '-' + locale] === hash) continue;
      cacheData[id + '-' + locale] = hash;

      locales.push(locale);
      promises.push(generate(content, file.path, id, locale).catch((error) => {
        warning(`Failed to parse ${id} [${locale}]:`, error.message);
      }));
    }

    if (locales.length) console.log(`>> Parsing ${id} [${locales.join(', ')}]`);

    if (cacheFile) {
      const dir = path.dirname(cacheFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
    }

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
module.exports.getAudioTimings = getAudioTimings;
module.exports.writeAudioTimings = writeAudioTimings;
module.exports.extractText = extractText;
module.exports.textHash = textHash;
