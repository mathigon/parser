// =============================================================================
// MathJax Parser Utilities
// (c) Mathigon
// =============================================================================



const entities = require('html-entities').AllHtmlEntities;
const MathJax = require('mathjax-node');


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
  const id = `XEQUATIONX${mathJaxCount++}XEQUATIONX`;
  mathJaxCache[id] = [entities.decode(code), isInline];
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
      resolve(cleanSvg(data.svg || ''));
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
