// =============================================================================
// Full Interactive Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


const yaml = require('yamljs');
const marked = require('marked');
const ascii2mathml = require('ascii2mathml');
const pug = require('pug');
const JSDom = require('jsdom').JSDOM;
const minify = require('html-minifier').minify;
const emoji = require('node-emoji');
const entities = require('html-entities').AllHtmlEntities;

let bios = new Set();
let gloss = new Set();
let data = {steps: []};
let currentStep = null;
let currentDirectory = null;

// TODO Make this less hacky (don't parse paragraphs in blockquotes and HTML).
let originalP = null;
let isParsingHTML = false;


// -----------------------------------------------------------------------------
// Helper Functions

function last(x) {
  return x[x.length - 1];
}

function emojiImg(symbol, name) {
  const code = symbol.codePointAt(0).toString(16);
  return `<img class="emoji" width="20" height="20" src="/images/emoji/${code}.png" alt="${name}"/>`;
}

function nodes(element) {
  let result = [];
  for (let c of element.children) {
    result.push(...nodes(c));
    result.push(c);
  }
  return result;
}

function textNodes(element) {
  let result = [];
  for (let c of element.childNodes) {
    if (c.nodeType === 3) {
      if (c.textContent.trim()) result.push(c);
    } else {
      result.push(...textNodes(c));
    }
  }
  return result;
}


// -----------------------------------------------------------------------------
// Markdown Extensions

// HTML Tag Wrappers using ::: and indentation.
function blockIndentation(source) {
  const lines = source.split('\n');
  let closeTags = [];
  let nested = [];

  for (let i = 0; i < lines.length; ++i) {
    if (!lines[i].startsWith(':::')) continue;
    const tag = lines[i].slice(4);

    if (!tag) {
      lines[i] = '\n' + closeTags.pop() + '\n';
      nested.pop();
      continue;
    }

    if (tag.startsWith('column')) {
      let col = pug.render(tag.replace('column', 'div')).split('</')[0];
      col = col.replace(/width="([0-9]+)"/, 'style="width: $1px"');
      if (last(nested) === 'column') {
        lines[i] = '\n</div>' + col + '\n';
      } else {
        lines[i] = '<div class="row padded">' + col + '\n';
        nested.push('column');
        closeTags.push('</div></div>')
      }
    } else if (tag.startsWith('tab')) {
      let col = pug.render(tag.replace('tab', '.tab')).split('</')[0];
      if (last(nested) === 'tab') {
        lines[i] = '\n</div>' + col + '\n';
      } else {
        lines[i] = '<x-tabbox>' + col + '\n';
        nested.push('tab');
        closeTags.push('</div></x-tabbox>')
      }
    } else {
      let wrap = pug.render(tag).split('</');
      closeTags.push('</' + wrap[1]);
      lines[i] = wrap[0] + '\n';
      nested.push('');
    }

  }

  return lines.join('\n');
}

function blockAttributes(node) {
  let lastChild = node.childNodes[0]; //[node.childNodes.length - 1];
  if (!lastChild || lastChild.nodeType !== 3) return;

  let match = lastChild.textContent.match(/^\{([^\}]+)\}/);
  if (!match) return;

  lastChild.textContent = lastChild.textContent.replace(match[0], '');

  let div = node.ownerDocument.createElement('div');
  div.innerHTML = pug.render(match[1]);

  let replaced = div.children[0];

  if (replaced.tagName === 'DIV') {
    const attributes = Array.from(replaced.attributes);
    for (let a of attributes) node.setAttribute(a.name, a.value);
  } else {
    while (node.firstChild) replaced.appendChild(node.firstChild);
    node.parentNode.replaceChild(replaced, node);
  }
}

function parseParagraph(text) {
  text = text
    .replace(/\[\[([^\]]+)\]\]/g, function(x, body) {
      if (body.split('|').length > 1) return `<x-blank choices="${body}"></x-blank>`;
      return `<x-blank input="${body}"></x-blank>`;
    })
    .replace(/\[([\w\s\-]+)\]\(->([^\)]+)\)/g, '<x-target to="$2">$1</x-target>')  // Targets
    .replace(/\$\{([^\}]+)\}\{([^\}]+)\}/g, '<x-var bind="$2">${$1}</x-var>')  // Variables
    .replace(/\$\{([^\}]+)\}(?!\<\/x\-var\>)/g, '<span class="var">${$1}</span>')  // Variables
    .replace(/(?:\^\^)(?=\S)(\S*)(?:\^\^)/g, '<sup>$1</sup>')  // Superscripts
    .replace(/(?:~~)(?=\S)(\S*)(?:~~)/g, '<sub>$1</sub>')  // Subscripts
    .replace(/(\w)'(\w)/g, '$1’$2');  // Single quotes

  return emoji.emojify(text, x => x, emojiImg);
}


// -----------------------------------------------------------------------------
// Custom Marked Renderer

const renderer = new marked.Renderer();

// Glossary, bios and external links
renderer.link = function(href, title, text) {
  if (href.startsWith('gloss:')) {
    let id = href.slice(6);
    gloss.add(id);
    return `<x-gloss xid="${id}">${text}</x-gloss>`;
  }

  if (href.startsWith('bio:')) {
    let id = href.slice(4);
    bios.add(id);
    return `<x-bio xid="${id}">${text}</x-bio>`;
  }

  if (href.startsWith('target:')) {
    let id = href.slice(7);
    return `<span class="step-target" data-to="${id}">${text}</span>`;
  }

  return `<a href="${href}" target="_blank">${text}</a>`;
};

renderer.heading = function (text, level) {
  if (level === 1) {
    data.title = text;
    return '';
  }
  return `<h${level}>${text}</h${level}>`;
};

renderer.codespan = function(code) {
  let maths = ascii2mathml(entities.decode(code), {bare: true});
  maths = maths.replace(/<mo>-<\/mo>/g, '<mo>−</mo>')
    .replace(/\s*accent="true"/g, '')
    .replace(/lspace="0" rspace="0">′/g, '>′')
    .replace(/>(.)<\/mo>/g, (_, mo) =>  ` value="${mo}">${mo}</mo>`);
  return `<span class="math">${maths}</span>`;
  // .replace(/<mrow>\s*<mo>\(<\/mo>/g, '<mfenced>')
  // .replace(/<mo>\)<\/mo>\s*<\/mrow>/g, '</mfenced>');
  // math = minify(math, { collapseWhitespace: true });
};

renderer.blockquote = function(quote) {
  const documentData = yaml.parse(originalP || quote);
  Object.assign(currentStep || data, documentData);
  return '';
};

renderer.hr = function() {
  let previous = currentStep;
  currentStep = {};
  data.steps.push(currentStep);
  return previous ? '</x-step><x-step>' : '<x-step>';
};

// Indented Puh HTML blocks
renderer.code = function(code) {
  return pug.render(code, {filename: currentDirectory + '/content.pug'});
};

// Parse markdown inside
renderer.html = function(html) {
  const body = (new JSDom(html)).window.document.body;
  const text = textNodes(body);

  // Don't parse HTML if it doesn't contain text (e.g. just an open/close tag).
  if (!text.length) return html;

  isParsingHTML = true;
  for (let t of text) t.textContent = marked(t.textContent, {renderer});
  isParsingHTML = false;

  return body.innerHTML.trim();
};

renderer.listitem = function(text) {
  return '<li>' + parseParagraph(text) + '</li>';
};

renderer.paragraph = function(text) {
  originalP = text;
  if (isParsingHTML) return parseParagraph(text);
  return '<p>' + parseParagraph(text) + '</p>';
};


// -----------------------------------------------------------------------------
// Run Markdown Parser

module.exports.renderer = renderer;
module.exports.parseFull = function(id, content, path) {
  bios = new Set();
  gloss = new Set();
  data = {steps: []};
  currentStep = null;
  currentDirectory = path;

  // Image URLs
  content = content
    .replace(/url\(images\//g, `url(/resources/${id}/images/`)
    .replace(/src="images\//g, `src="/resources/${id}/images/`)
    .replace(/href="images\//g, `href="/resources/${id}/images/`);

  // Replace reveal goals
  content = content.replace(/when=/g, 'data-when=');

  // Custom Markdown Extensions
  // TODO parse tables without headers
  content = blockIndentation(content);

  // TODO fix consecutive HTML detection in marked.js
  const lexer = new marked.Lexer();
  lexer.rules.html = /^<.*[\n]{2,}/;
  const tokens = lexer.lex(content);
  const parsed = marked.Parser.parse(tokens, {renderer});

  const doc = (new JSDom(parsed + '</x-step>')).window.document;

  // Parse element attributes
  // TODO parse attributes for <ul> and <table>
  for (let n of nodes(doc.body)) blockAttributes(n);

  // Add step IDs
  const $steps = doc.body.querySelectorAll('x-step');
  for (let i = 0; i < $steps.length; ++i) {
    let d = data.steps[i];
    $steps[i].id = d.id || 'step-' + i;
    if (d.class) $steps[i].setAttribute('class', d.class);
  }

  const html = minify(doc.body.innerHTML,
    {collapseWhitespace: true, conservativeCollapse: true});
  return {html, bios, gloss, data};
};
