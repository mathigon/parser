// =============================================================================
// Full Interactive Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


// TODO Parse tables without headers
// TODO Parse attributes for <ul> and <table>
// TODO Use Mathigon's custom expression parsing instead of AsciiMath


const yaml = require('yamljs');
const marked = require('marked');
const ascii2mathml = require('ascii2mathml');
const pug = require('pug');
const JSDom = require('jsdom').JSDOM;
const minify = require('html-minifier').minify;
const emoji = require('node-emoji');
const entities = require('html-entities').AllHtmlEntities;
const Expression = require('@mathigon/hilbert').Expression;

const minifyOptions = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true
};

let bios, gloss, steps, directory, title;
let globalPug = '';  // Global Pug code at the beginning of chapters
let originalP = null;  // Caching of unparsed paragraphs (for blockquotes)


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

  if (replaced.tagName === 'DIV' && !match[1].startsWith('div')) {
    const attributes = Array.from(replaced.attributes);
    for (let a of attributes) node.setAttribute(a.name, a.value);
  } else {
    while (node.firstChild) replaced.appendChild(node.firstChild);
    node.parentNode.replaceChild(replaced, node);
  }
}

function parseParagraph(text) {
  text = text
    .replace(/\[\[([^\]]+)]]/g, function(x, body) {
      body = body.replace(/"/g, '&quot;');
      if (body.split('|').length > 1) return `<span class="nowrap"><x-blank choices="${body}"></x-blank></span>`;
      return `<span class="nowrap"><x-blank-input solution="${body}"></x-blank-input></span>`;
    })
    .replace(/\${([^}]+)}{([^}]+)}/g, '<span class="nowrap"><x-var bind="$2">${$1}</x-var></span>')
    .replace(/\${([^}]+)}(?!<\/x-var>)/g, '<span class="var">${$1}</span>');
  return emoji.emojify(text, x => x, emojiImg);
}


// -----------------------------------------------------------------------------
// Custom Marked Renderer

const renderer = new marked.Renderer();

renderer.link = function(href, title, text) {
  // Note: The .nowrap elements prevent line breaks between inline-block
  // elements and punctuation.

  if (href.startsWith('gloss:')) {
    let id = href.slice(6);
    gloss.add(id);
    return `<span class="nowrap"><x-gloss xid="${id}">${text}</x-gloss></span>`;
  }

  if (href.startsWith('bio:')) {
    let id = href.slice(4);
    bios.add(id);
    return `<span class="nowrap"><x-bio xid="${id}">${text}</x-bio></span>`;
  }

  if (href.startsWith('target:')) {
    let id = href.slice(7);
    return `<span class="step-target" data-to="${id}">${text}</span>`;
  }

  const href1 = entities.decode(href);
  if (href1.startsWith('->')) {
    return `<span class="nowrap"><x-target to="${href1.slice(2).replace(/_/g, ' ')}">${text}</x-target></span>`;
  }

  return `<a href="${href}" target="_blank">${text}</a>`;
};

renderer.heading = function (text, level) {
  if (level === 1) {
    title = text;
    return '';
  }
  return `<h${level-1}>${text}</h${level}>`;
};

renderer.codespan = function(code) {
  code = entities.decode(code);

  // TODO Make native expression parsing the default, remove § prefix.
  if (code[0] === '§') {
    const expr = Expression.parse(code.slice(1));
    const maths = expr.toMathML({
      pill: (expr, color, target) => `<span class="pill step-target ${color.val.s}" data-to="${target.val.s}">${expr}</span>`,
      input: (value) => `<x-blank-input solution="${value.val.n}"></x-blank-input>`,
      blank: (...values) => `<x-blank choices="${values.join('|')}"></x-blank>`
  });
    return `<span class="math">${maths}</span>`;
  }

  const maths = ascii2mathml(code, {bare: true})
      .replace(/<mo>-<\/mo>/g, '<mo>−</mo>')
      .replace(/\s*accent="true"/g, '')
      .replace(/lspace="0" rspace="0">′/g, '>′')
      .replace(/>(.)<\/mo>/g, (_, mo) =>  ` value="${mo}">${mo}</mo>`);
  return `<span class="math">${maths}</span>`;
};

renderer.blockquote = function(quote) {
  Object.assign(last(steps), yaml.parse(originalP || quote));
  return '';
};

renderer.hr = function() {
  steps.push({});
  return '</x-step><x-step>';
};

// Indented Pug HTML blocks
renderer.code = function(code) {
  if (code.indexOf('mixin ') >= 0) globalPug += code + '\n\n';
  return pug.render(globalPug + code, {filename: directory + '/content.pug'});
};

renderer.listitem = function(text) {
  return '<li>' + parseParagraph(text) + '</li>';
};

renderer.tablecell = function(text, flags) {
  const tag = flags.header ? 'th' : 'td';
  const align = flags.align ? ` align="${flags.align}"` : '';
  return `<${tag}${align}>${parseParagraph(text)}</${tag}>`;
};

renderer.paragraph = function(text) {
  originalP = text;
  return '<p>' + parseParagraph(text) + '</p>';
};


// -----------------------------------------------------------------------------
// Run Markdown Parser

module.exports.parseFull = function(id, content, path) {
  bios = new Set();
  gloss = new Set();
  steps = [{}];
  directory = path;
  globalPug = title = '';

  // Replace relative image URLs
  content = content.replace(/(url\(|src="|href="|background="|poster=")images\//g, `$1/resources/${id}/images/`);

  // Rename special attributes
  content = content.replace(/(when|delay|animation|duration)=/g, 'data-$1=');

  // Replace non-breaking space
  content = content.replace(/\\\s/g, '&nbsp;');

  // Custom Markdown Extensions
  content = blockIndentation(content);

  // Add headers to tables without header
  content = content.replace(/\n\n\|(.*)\n\|(.*)\n/g, (m, row1, row2) => {
    const cols = row1.split(' | ').length;
    const header = row2.match(/^[\s|:-]+$/) ? ''
        : `|${' |'.repeat(cols)}\n|${' - |'.repeat(cols)}\n`;
    return `\n\n${header}|${row1}\n|${row2}\n`
  });

  // Parse Markdown (but override HTML detection)
  const lexer = new marked.Lexer();
  lexer.rules.html = /^<.*[\n]{2,}/;
  const tokens = lexer.lex(content);
  const parsed = marked.Parser.parse(tokens, {renderer});

  const doc = (new JSDom('<x-step>' + parsed + '</x-step>')).window.document;

  // Parse custom element attributess
  for (let n of nodes(doc.body)) blockAttributes(n);

  // Parse markdown inside HTML elements with .md class
  const $md = doc.body.querySelectorAll('.md');
  for (let i = 0; i < $md.length; ++i) {
    $md[i].classList.remove('md');
    $md[i].innerHTML = marked($md[i].innerHTML, {renderer})
      .replace(/^<p>|<\/p>$/g, '');
  }

  // Add the [parent] attribute as class to all elements parents
  const $parents = doc.body.querySelectorAll('[parent]');
  for (let $p of $parents) {
    const classes = $p.getAttribute('parent').split(' ');
    $p.removeAttribute('parent');
    $p.parentNode.classList.add(...classes);
  }

  // Remove empty table headers
  for (let $th of doc.body.querySelectorAll('thead')) {
    if (!$th.textContent.trim()) $th.remove();
  }

  // Allow setting a class attribute in the last row of a table
  for (let $td of doc.body.querySelectorAll('td[class]')) {
    if (!$td.parentElement.textContent.trim()) {
      const $table = $td.parentElement.parentElement.parentElement;
      $table.setAttribute('class', $td.getAttribute('class'));
      $td.parentElement.remove();
    }
  }

  const sectionsHTML = {};
  const stepsHTML = {};
  const sections = [];
  let goals = 0;

  const autoGoals = 'x-blank, x-blank-input, x-equation, x-var, x-slider, .next-step, x-sortable, x-gameplay, x-slideshow .slide, x-slideshow .legend, x-picker .item:not([data-error])';

  const $steps = doc.body.querySelectorAll('x-step');
  for (let i = 0; i < $steps.length; ++i) {
    let step = steps[i];
    if (!step.id) step.id = 'step-' + i;
    $steps[i].id = step.id;
    if (step.goals) $steps[i].setAttribute('goals', step.goals);
    if (step.class) $steps[i].setAttribute('class', step.class);

    const $h1 = $steps[i].querySelector('h1');
    if ($h1) {
      const sectionId = step.section || $h1.textContent.toLowerCase().replace(/\s/g, '-').replace(/[^\w-]/g, '');
      const sectionStatus = step.sectionStatus || '';
      sections.push({title: $h1.textContent, id: sectionId, goals: 0, status: sectionStatus});
      sectionsHTML[sectionId] = '';
      $h1.remove();
    }

    if (step.sectionBackground) last(sections).background = step.sectionBackground;
    step.section = last(sections).id;

    const html = minify($steps[i].outerHTML, minifyOptions);
    stepsHTML[step.id] = html;
    sectionsHTML[last(sections).id] += html;

    // Some elements automatically generate goals (e.g. blanks).
    // The last item in slideshows doesn't count, so we have to subtract those.
    step.goals = (step.goals ? step.goals.split(' ').length : 0) +
        $steps[i].querySelectorAll(autoGoals).length -
        $steps[i].querySelectorAll('x-slideshow').length;
    last(sections).goals += step.goals;
    goals += step.goals;
  }

  return {bios, gloss, data: {sections, steps, goals, title}, stepsHTML, sectionsHTML};
};

module.exports.parseSimple = function(text) {
  const md = marked(text, {renderer});
  const doc = (new JSDom(md)).window.document;
  for (let n of nodes(doc.body)) blockAttributes(n);
  return minify(doc.body.innerHTML, minifyOptions);
};
