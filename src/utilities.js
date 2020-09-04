// =============================================================================
// Textbooks Parser Utilities
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const yaml = require('yamljs');
const File = require('vinyl');

const {textHash} = require('./audio');
const {parseSimple} = require('./parser');

const YAML_CACHE = new Map();


function warning(...msg) {
  console.warn('\x1b[31m', ...msg, '\x1b[0m');
}

function safeReadFile(file, fallback = '') {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback;
}

function safeWriteFile(file, content) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
  return fs.writeFileSync(file, content);
}

function createFile(dest, name, content) {
  return new File({
    base: dest,
    path: path.join(dest, name),
    contents: Buffer.from(content)
  });
}

function loadFile(root, name, locale) {
  if (locale !== 'en') name = 'translations/' + name.replace('.', `_${locale}.`);
  return safeReadFile(path.join(root, name));
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

function markdownHash(markdown, dir) {
  let pugImports = markdown.split('\n')
      .filter(l => l.match(/^\s{4,}include /))
      .map(c => c.trim().slice(8))
      .map(c => path.join(dir, c.match(/\.\w+$/) ? c : c + '.pug'))
      .map(c => safeReadFile(c));
  return textHash(markdown + pugImports.join(''));
}

function loadFromCache(cacheFile, id) {
  return cacheFile && JSON.parse(safeReadFile(cacheFile, '{}'))[id];
}

function writeToCache(cacheFile, id, hash) {
  if (!cacheFile) return;
  const json = JSON.parse(safeReadFile(cacheFile, '{}'));
  json[id] = hash;
  safeWriteFile(cacheFile, JSON.stringify(json));
}


module.exports.warning = warning;
module.exports.createFile = createFile;
module.exports.loadFile = loadFile;
module.exports.replaceMarkdown = replaceMarkdown;
module.exports.loadYAML = loadYAML;
module.exports.parseYAML = parseYAML;
module.exports.markdownHash = markdownHash;
module.exports.loadFromCache = loadFromCache;
module.exports.writeToCache = writeToCache;
