// =============================================================================
// MathJax Parser Utilities
// (c) Mathigon
// =============================================================================


const fs = require('fs');
const entities = require('html-entities').AllHtmlEntities;
const mathjax = require('mathjax');

const cacheFile = __dirname + '/mathjax-cache.tmp';
const mathJaxStore = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) : {};


const placeholders = {};
let placeholderCount = 0;
let promise = undefined;

module.exports.makeTexPlaceholder = function(code, isInline = false) {
  const id = entities.decode(code) + (isInline || false);
  if (id in mathJaxStore) return mathJaxStore[id];

  const placeholder = `XEQUATIONX${placeholderCount++}XEQUATIONX`;
  placeholders[placeholder] = [code, isInline];
  return placeholder;
};

async function texToSvg(code, isInline) {
  const id = entities.decode(code) + (isInline || false);
  if (mathJaxStore[id]) return mathJaxStore[id];

  if (!promise) promise = mathjax.init({
    loader: {load: ['input/tex', 'output/svg']},
    svg: {}  // http://docs.mathjax.org/en/latest/options/output/svg.html#the-configuration-block
  });

  let output = '';

  try {
    const MathJax = await promise;
    const svg = await MathJax.tex2svg(code, {display: !isInline});
    output = MathJax.startup.adaptor.innerHTML(svg)
        .replace('role="img" focusable="false"', 'class="mathjax"')
        .replace(/ xmlns(:xlink)?="[^"]+"/g, '');
  } catch(e) {
    console.warn(`MathJax Error: ${e.message} at "${code}"`);
  }

  mathJaxStore[id] = output;
  fs.writeFileSync(cacheFile, JSON.stringify(mathJaxStore));
  return output;
}

module.exports.fillTexPlaceholders = async function(doc) {
  const matches = doc.match(/XEQUATIONX[0-9]+XEQUATIONX/g) || [];
  for (const placeholder of matches) {
    const code = await texToSvg(...placeholders[placeholder]);
    doc = doc.replace(placeholder, code);
  }
  return doc;
};
