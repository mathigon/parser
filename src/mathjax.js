// =============================================================================
// MathJax Parser Utilities
// (c) Mathigon
// =============================================================================



const entities = require('html-entities').AllHtmlEntities;
const MathJax = require('mathjax-node');
const grunt = require('grunt');


const cacheFile = __dirname + '/mathjax-cache.tmp';
const mathJaxStore = grunt.file.exists(cacheFile) ? grunt.file.readJSON(cacheFile) : {};


MathJax.config({
  displayErrors: false,
  MathJax: {
    SVG: {linebreaks: {automatic: true, width: '640px'}},
  }
});

MathJax.start();

const mathJaxCache = {};
let mathJaxCount = 0;

module.exports.makeTexPlaceholder = function(code, isInline = false) {
  code = entities.decode(code);

  if ((code + isInline) in mathJaxStore) return mathJaxStore[code + isInline];

  const id = `XEQUATIONX${mathJaxCount++}XEQUATIONX`;
  mathJaxCache[id] = [code, isInline];
  return id;
};

function cleanSvg(svg) {
  return svg.replace('role="img" focusable="false" ', '')
      .replace(' id="MathJax-SVG-1-Title"', '')
      .replace('aria-labelledby="MathJax-SVG-1-Title"', 'class="mathjax"');
}

function texToSvg(code, isInline) {
  return new Promise((resolve) => {
    const format = isInline ? 'inline-TeX' : 'TeX';
    MathJax.typeset({math: code, format, svg: true}, (data) => {
      if (data.errors) {
        console.warn(`\nMathJax Error: ${data.errors} at "${code}"`);
      }
      const svg = cleanSvg(data.svg || '');
      mathJaxStore[code + isInline] = svg;
      grunt.file.write(cacheFile, JSON.stringify(mathJaxStore));
      resolve(svg);
    });
  });
}

module.exports.fillTexPlaceholders = async function(doc) {
  const matches = doc.match(/XEQUATIONX[0-9]+XEQUATIONX/g) || [];
  for (const placeholder of matches) {
    const code = await texToSvg(...mathJaxCache[placeholder]);
    doc = doc.replace(placeholder, code);
  }
  return doc;
};
