// =============================================================================
// Custom MathML Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================



const yaml = require('yamljs');
const marked = require('marked');
const ascii2mathml = require('ascii2mathml');
const pug = require('pug');
const emoji = require('node-emoji');
const entities = require('html-entities').AllHtmlEntities;
const Expression = require('@mathigon/hilbert').Expression;
const {makeTexPlaceholder, fillTexPlaceholders} = require('./mathjax');
const JSDom = require('jsdom').JSDOM;
const minify = require('html-minifier').minify;


// -----------------------------------------------------------------------------
// Configuration

let bios, gloss, steps, directory, title;
let globalPug = '';  // Global Pug code at the beginning of chapters
let originalP = '';  // Caching of unparsed paragraphs (for blockquotes)

const minifyOptions = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true
};

const autoGoals = ['x-blank', 'x-blank-input', 'x-equation', 'x-var',
  'x-slider', '.next-step', 'x-sortable', 'x-gameplay', 'x-slideshow .slide',
  'x-slideshow .legend', 'x-picker .item:not([data-error])', 'x-code-checker',
  'x-quill'].join(', ');


// -----------------------------------------------------------------------------
// Exported Functions

const renderer = new marked.Renderer();

module.exports.parse = async function(id, content, path) {
  // Reset all global variables.
  bios = new Set();
  gloss = new Set();
  steps = [{}];
  directory = path;
  globalPug = title = originalP = '';

  // Replace relative image URLs
  content = content.replace(/(url\(|src="|href="|background="|poster=")images\//g,
      `$1/resources/${id}/images/`);

  // Rename special data attributes
  content = content.replace(/(when|delay|animation|duration)=/g, 'data-$1=');

  // Custom Markdown Extensions
  content = blockIndentation(content);

  // Circumvent Markdown Inline escaping of \$s.
  content = content.replace(/\\\$/g, '\\\\$');

  // Add headers to tables without header
  content = content.replace(/\n\n\|(.*)\n\|(.*)\n/g, (m, row1, row2) => {
    const cols = row1.split(' | ').length;
    const header = row2.match(/^[\s|:-]+$/) ? ''
        : `|${' |'.repeat(cols)}\n|${' - |'.repeat(cols)}\n`;
    return `\n\n${header}|${row1}\n|${row2}\n`
  });

  // Disable $ escaping, so that we can do \$.
  const inlineRules = marked.InlineLexer.rules.normal;
  inlineRules.escape = new RegExp(inlineRules.escape.source.replace('$', ''));

  // Actually Parse the Markdown
  const lexer = new marked.Lexer();
  lexer.rules.html = /^<.*[\n]{2,}/;
  const tokens = lexer.lex(content);
  let result = marked.Parser.parse(tokens, {renderer});

  // Asynchronously replace all LaTeX Equation placeholders.
  result = await fillTexPlaceholders(result);

  // Replace non-breaking space and escaped $s.
  result = result.replace(/\\\s/g, '&nbsp;').replace(/\\\$/g, '$');

  const doc = (new JSDom('<x-step>' + result + '</x-step>')).window.document.body;

  // Parse custom element attributess
  // TODO Parse attributes for <ul> and <table>
  for (let n of nodes(doc)) blockAttributes(n);

  // Parse markdown inside HTML elements with .md class
  const $md = doc.querySelectorAll('.md');
  for (let i = 0; i < $md.length; ++i) {
    $md[i].classList.remove('md');
    let html = marked($md[i].innerHTML, {renderer}).replace(/^<p>|<\/p>$/g, '');
    html = await fillTexPlaceholders(html);
    $md[i].innerHTML = html;
  }

  // Add the [parent] attribute as class to all elements parents
  const $parents = doc.querySelectorAll('[parent]');
  for (let $p of $parents) {
    const classes = $p.getAttribute('parent').split(' ');
    $p.removeAttribute('parent');
    $p.parentNode.classList.add(...classes);
  }

  // Remove empty table headers
  for (let $th of doc.querySelectorAll('thead')) {
    if (!$th.textContent.trim()) $th.remove();
  }

  // Allow setting a class attribute in the last row of a table
  for (let $td of doc.querySelectorAll('td[class]')) {
    if (!$td.parentElement.textContent.trim()) {
      const $table = $td.parentElement.parentElement.parentElement;
      $table.setAttribute('class', $td.getAttribute('class'));
      $td.parentElement.remove();
    }
  }

  const {sectionsHTML, stepsHTML, sections, goals} = extractSectionData(doc);

  return {
    bios,
    gloss,
    data: {sections, steps, goals, title},
    stepsHTML,
    sectionsHTML
  };
};

module.exports.parseSimple = async function (text) {
  let result = marked(text, {renderer});
  result = await fillTexPlaceholders(result);
  const doc = (new JSDom(result)).window.document.body;
  for (let n of nodes(doc)) blockAttributes(n);
  return minify(doc.innerHTML, minifyOptions);
};


// -----------------------------------------------------------------------------
// Section and Step Configuration

function extractSectionData(doc) {
  const sectionsHTML = {};
  const stepsHTML = {};
  const sections = [];
  let goals = 0;

  const $steps = doc.querySelectorAll('x-step');
  for (let i = 0; i < $steps.length; ++i) {
    let step = steps[i];
    if (!step.id) step.id = 'step-' + i;
    $steps[i].id = step.id;
    if (step.goals) $steps[i].setAttribute('goals', step.goals);
    if (step.class) $steps[i].setAttribute('class', step.class);

    const $h1 = $steps[i].querySelector('h1');
    if ($h1) {
      const sectionId = step.section || $h1.textContent.toLowerCase()
          .replace(/\s/g, '-').replace(/[^\w-]/g, '');
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

  return {sectionsHTML, stepsHTML, sections, goals};
}


// -----------------------------------------------------------------------------
// Custom Paragraph Renderer

function nowrap(str) {
  // This prevents line breaks between inline-block elements and punctuation.
  return `<span class="nowrap">${str}</span>`;
}

function inlineBlanks(text) {
  return text.replace(/\[\[([^\]]+)]]/g, (x, body) => {
    const choices = body.split('|');

    if (choices.length === 1)
      return nowrap(`<x-blank-input solution="${body}"></x-blank-input>`);

    const choiceEls = choices.map(c => `<span class="choice">${c}</span>`);
    return nowrap(`<x-blank>${choiceEls.join('')}</x-blank>`);
  });
}

function inlineEquations(text) {
  // We want to match $a$ strings, except when they are prefixed with a \$
  // e.g. for currencies, or when they start with ${} (for variables).
  return text.replace(/(^|[^\\])\$([^{][^$]*?)\$/g, (x, prefix, body) => {
    return prefix + nowrap(makeTexPlaceholder(body, true));
  })
}

function inlineVariables(text) {
  return text.replace(/\${([^}]+)}{([^}]+)}/g, nowrap('<x-var bind="$2">${$1}</x-var>'))
      .replace(/\${([^}]+)}(?!<\/x-var>)/g, '<span class="var">${$1}</span>');
}

function emojiImg(symbol, name) {
  const code = symbol.codePointAt(0).toString(16);
  return `<img class="emoji" width="20" height="20" src="/images/emoji/${code}.png" alt="${name}"/>`;
}

function parseParagraph(text) {
  // TODO Find a way to directly override the MarkedJS lexer.
  text = inlineBlanks(text);
  text = inlineEquations(text);
  text = inlineVariables(text);
  return emoji.emojify(text, x => x, emojiImg);
}


// -----------------------------------------------------------------------------
// Marked JS Renderer

renderer.link = function (href, title, text) {
  if (href === 'btn:next') {
    return `<button class="next-step">${text}</button>`;
  }

  if (href.startsWith('gloss:')) {
    let id = href.slice(6);
    gloss.add(id);
    return nowrap(`<x-gloss xid="${id}">${text}</x-gloss>`);
  }

  if (href.startsWith('bio:')) {
    let id = href.slice(4);
    bios.add(id);
    return nowrap(`<x-bio xid="${id}">${text}</x-bio>`);
  }

  if (href.startsWith('target:')) {
    let id = href.slice(7);
    return `<span class="step-target" data-to="${id}">${text}</span>`;
  }

  if (href.startsWith('pill:')) {
    let id = href.slice(5);
    return `<strong class="pill step-target" data-to="${id}">${text}</strong>`;
  }

  if (href === 'pill') {
    return `<strong class="pill">${text}</strong>`;
  }

  const href1 = entities.decode(href);
  if (href1.startsWith('->')) {
    return nowrap(`<x-target to="${href1.slice(2).replace(/_/g, ' ')}">${text}</x-target>`);
  }

  return `<a href="${href}" target="_blank">${text}</a>`;
};

renderer.codespan = function (code) {
  code = entities.decode(code);

  if (code.startsWith('{py}')) {
    code = code.slice(4).trim();
    return `<code class="language-python">${code}</code>`

  } else if (code.startsWith('{jl}')) {
    code = code.slice(4).trim();
    return `<code class="language-julia">${code}</code>`

  } else if (code.startsWith('{r}')) {
    code = code.slice(3).trim();
    return `<code class="language-r">${code}</code>`

  } else if (code.startsWith('{code}')) {
    code = code.slice(6).trim();
    return `<code class="language-markup">${code}</code>`

  } else if (code.startsWith('§')) {
    // TODO Make native expression parsing the default, remove § prefix.
    const expr = Expression.parse(code.slice(1));
    const maths = expr.toMathML({
      pill: (expr, color, target) => `<span class="pill step-target ${color.val.s}" data-to="${target.val.s}">${expr}</span>`,
      input: (value) => `<x-blank-input solution="${value.val.n}"></x-blank-input>`,
      blank: (...values) => `<x-blank>${values.map(v => `<span class="choice">${v}</span>`).join('')}</x-blank>`,
      arc: (value) => `<mover>${value}<mo value="⌒">⌒</mo></mover>`
    });
    return `<span class="math">${maths}</span>`;
  }

  const maths = ascii2mathml(code, {bare: true})
      .replace(/<mo>-<\/mo>/g, '<mo>−</mo>')
      .replace(/\s*accent="true"/g, '')
      .replace(/lspace="0" rspace="0">′/g, '>′')
      .replace(/>(.)<\/mo>/g, (_, mo) => ` value="${mo}">${mo}</mo>`);
  return `<span class="math">${maths}</span>`;
};

renderer.heading = function (text, level) {
  if (level === 1) {
    title = text;
    return '';
  }
  return `<h${level - 1}>${text}</h${level - 1}>`;
};

renderer.blockquote = function (quote) {
  Object.assign(last(steps), yaml.parse(originalP || quote));
  return '';
};

renderer.hr = function () {
  steps.push({});
  return '</x-step><x-step>';
};

renderer.code = function(code, name) {
  if (name === 'latex') {
    const eqn = '\\begin{align*}' + entities.decode(code) + '\\end{align*}';
    return `<p class="text-center">${makeTexPlaceholder(eqn, false)}</p>`;
  }

  if (name) {
    code = entities.decode(code);
    return `<pre class="language-${name}"><code>${code}</code></pre>`;
  }

  // Indented Pug HTML blocks
  if (code.indexOf('mixin ') >= 0) globalPug += code + '\n\n';
  return pug.render(globalPug + code, {filename: directory + '/content.pug'});
};

renderer.listitem = function (text) {
  return '<li>' + parseParagraph(text) + '</li>';
};

renderer.tablecell = function (text, flags) {
  const tag = flags.header ? 'th' : 'td';
  const align = flags.align ? ` align="${flags.align}"` : '';
  return `<${tag}${align}>${parseParagraph(text)}</${tag}>`;
};

renderer.paragraph = function (text) {
  originalP = text;
  return '<p>' + parseParagraph(text) + '</p>';
};


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
  if (!replaced) return console.warn(`Invalid attribute: {${match[1]}}`);

  if (replaced.tagName === 'DIV' && !match[1].startsWith('div')) {
    const attributes = Array.from(replaced.attributes);
    for (let a of attributes) {
      if (a.name === 'class') {
        node.classList.add(...a.value.split(' '));
      } else {
        node.setAttribute(a.name, a.value);
      }
    }
  } else {
    while (node.firstChild) replaced.appendChild(node.firstChild);
    node.parentNode.replaceChild(replaced, node);
  }
}


// -----------------------------------------------------------------------------
// Utility Functions

function last(x) {
  return x[x.length - 1];
}

function nodes(element) {
  if (element.tagName === 'SVG') return [];
  let result = [];
  for (let c of element.children) {
    result.push(...nodes(c));
    result.push(c);
  }
  return result;
}
