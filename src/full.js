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


let bios = new Set();
let data = {sections: []};
let currentSection = null;
let currentDirectory = null;

// TODO Make this less hacky (don't parse paragraphs in blockquotes and HTML).
let originalP = null;
let isParsingHTML = false;


// -----------------------------------------------------------------------------
// Helper Functions

function decodeHTML(html) {
  let replacements = [['amp', '&'], ['quot', '"'], ['apos', '\''], ['lt', '<'], ['gt', '>']];
  for (let r of replacements) {
    html = html.replace(new RegExp('&' + r[0] + ';', 'g'), r[1]);
  }
  return html;
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
      result.push(c);
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
  let indent = 0;
  let closeTags = [];
  for (let i = 0; i < lines.length; ++i) {
    if (!lines[i]) continue;  // Skip empty lines
    if (lines[i].match(/^\s*/)[0].length < indent) {
      indent -= 2;
      lines[i-1] += '\n' + closeTags.pop();
    }
    lines[i] = lines[i].slice(indent);
    if (lines[i].startsWith('::: ')) {
      indent += 2;
      let tags = pug.render(lines[i].slice(4)).split('</');
      closeTags.push('</' + tags[1]);
      lines[i] = tags[0];
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
    for (let a of Array.from(replaced.attributes)) {
      node.setAttribute(a.name, a.value);
    }
  } else {
    node.parentNode.replaceChild(replaced, node);
    for (let c of node.childNodes) replaced.appendChild(c);
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
    .replace(/(?:\^)(?=\S)(\S*)(?:\^)/g, '<sup>$1</sup>')  // Superscripts
    .replace(/(?:\~)(?=\S)(\S*)(?:\~)/g, '<sub>$1</sub>')  // Subscripts
    .replace(/(\w)'(\w)/g, '$1’$2');  // Single quotes

  return emoji.emojify(text, x => x, emojiImg);
}


// -----------------------------------------------------------------------------
// Custom Marked Renderer

const renderer = new marked.Renderer();

// Glossary, bios and external links
renderer.link = function(href, title, text) {
  if (href.startsWith('gloss:')) {
    return `<x-gloss xid="${href.slice(6)}">${text}</x-gloss>`;
  }

  if (href.startsWith('bio:')) {
    let id = href.slice(4);
    bios.add(id);
    return `<x-bio xid="${id}">${text}</x-bio>`;
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
  let maths = ascii2mathml(decodeHTML(code), {bare: true});
  maths = maths.replace(/<mo>-<\/mo>/g, '<mo>–</mo>')
    .replace(/<mo>(.)<\/mo>/g, (_, mo) =>  `<mo value="${mo}">${mo}<\/mo>`);
  return `<span class="math">${maths}</span>`;
  // .replace(/<mrow>\s*<mo>\(<\/mo>/g, '<mfenced>')
  // .replace(/<mo>\)<\/mo>\s*<\/mrow>/g, '</mfenced>');
  // math = minify(math, { collapseWhitespace: true });
};

renderer.blockquote = function(quote) {
  const documentData = yaml.parse(originalP || quote);
  Object.assign(currentSection || data, documentData);
  return '';
};

renderer.hr = function() {
  let previous = currentSection;
  currentSection = {};
  data.sections.push(currentSection);
  return previous ? '</section><section>' : '<section>';
};

// Indented Puh HTML blocks
renderer.code = function(code) {
  return pug.render(code, {filename: currentDirectory + '/content.pug'});
};

// Parse markdown inside
renderer.html = function(html) {
  const body = (new JSDom(html)).window.document.body;

  isParsingHTML = true;
  for (let t of textNodes(body)) {
    t.textContent = marked(t.textContent, {renderer});
  }
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

module.exports = function(id, content, path) {
  bios = new Set();
  data = {sections: []};
  currentSection = null;
  currentDirectory = path;

  // Image URLs
  content = content
    .replace(/url\(images\//g, `url(/resources/${id}/images/`)
    .replace(/src="images\//g, `src="/resources/${id}/images/`);

  // Custom Markdown Extensions
  // TODO parse tables without headers
  // TODO parse subsections
  content = blockIndentation(content);

  const parsed = marked(content, {renderer}) + '</section>';
  const doc = (new JSDom(parsed)).window.document;

  // Parse element attributes
  // TODO parse attributes for <ul> and <table>
  for (let n of nodes(doc.body)) blockAttributes(n);

  // Add section IDs
  const $sections = doc.body.querySelectorAll('section');
  for (let i = 0; i < $sections.length; ++i) {
    if (data.sections[i].id) $sections[i].id = data.sections[i].id;
  }

  const html = minify(doc.body.innerHTML,
    {collapseWhitespace: true, conservativeCollapse: true});
  return {html, bios, data};
};
