// =============================================================================
// Custom MathML Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================



const yaml = require('yamljs');
const marked = require('marked');
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

  const doc = (new JSDom('<x-step>' + result + '</x-step>')).window.document.body;

  // Parse custom element attributess
  // TODO Parse attributes for <ul> and <table>
  for (let n of nodes(doc)) blockAttributes(n);

  // Add <nowrap> elements around inline-block elements.
  lineBreaks(doc);

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

  const sections = extractSectionData(doc);
  const goals = steps.map(s => s.goals.length).reduce((a, b) => a + b);
  const data = {sections, steps, goals, title};

  return {bios, gloss, data};
};

module.exports.parseSimple = async function (text) {
  let result = marked(text, {renderer});
  result = await fillTexPlaceholders(result);
  const doc = (new JSDom(result)).window.document.body;
  for (let n of nodes(doc)) blockAttributes(n);
  lineBreaks(doc);
  return minify(doc.innerHTML, minifyOptions);
};


// -----------------------------------------------------------------------------
// Section and Step Configuration

function checkId(sectionId) {
  if (sectionId && sectionId.includes('.'))
    throw new Error(`Step and section IDs cannot contain dots: ${sectionId}`);
  return sectionId
}

function getGoals($step, query, goalName, drop=0) {
  const items = Array.from($step.querySelectorAll(query)).slice(drop);
  return items.map((_,i) => goalName + '-' + i);
}

function extractSectionData(doc) {
  const sections = [];

  const $steps = doc.querySelectorAll('x-step');
  for (const [i, $step] of $steps.entries()) {
    let step = steps[i];

    step.id = checkId(step.id) || 'step-' + i;
    $steps[i].id = step.id;

    if (step.class) $step.setAttribute('class', step.class);

    const $h1 = $step.querySelector('h1');
    if ($h1) {
      sections.push({
        id: checkId(step.section) || $h1.textContent.toLowerCase().replace(/\s/g, '-').replace(/[^\w-]/g, ''),
        title: $h1.textContent,
        status: step.sectionStatus || '',
        background: step.sectionBackground || '',
        goals: 0,  duration: 1, steps: []
      });
      $h1.remove();
    }

    step.section = last(sections).id;
    last(sections).steps.push(step.id);

    // Generate the required goals for all built-in components
    // TODO Find a more generic solution to handle all this!
    step.goals = step.goals ? step.goals.split(' ') : [];
    step.goals.push(...getGoals($step, 'x-blank, x-blank-input', 'blank'));
    step.goals.push(...getGoals($step, '.next-step', 'next'));
    step.goals.push(...getGoals($step, 'x-var', 'var'));
    step.goals.push(...getGoals($step, 'x-slider', 'slider'));
    step.goals.push(...getGoals($step, 'x-sortable', 'sortable'));
    step.goals.push(...getGoals($step, 'x-equation', 'eqn'));
    step.goals.push(...getGoals($step, 'x-slideshow .legend', 'slide', 1));
    if ($step.querySelector('x-quill')) step.goals.push('quill');
    if ($step.querySelector('x-gameplay')) step.goals.push('gameplay');
    Array.from($step.querySelectorAll('x-picker .item')).forEach(($i, i) => {
      if (!$i.hasAttribute('data-error')) step.goals.push('picker-' + i);
    });
    $step.setAttribute('goals', step.goals.join(' '));
    last(sections).goals += step.goals.length;

    // Calculate the reading time per section using 75 words per minute and
    // 30s per interactive goal (plus 1 minutes added above);
    last(sections).duration += $step.textContent.split(/\s+/).length / 75;
    last(sections).duration += step.goals.length / 2;

    // Generate the Step HTML
    step.html = minify($step.outerHTML, minifyOptions);
  }

  // Round the duration to the nearest multiple of 5.
  for (const s of sections) {
    s.duration = Math.max(5, 5 * Math.ceil(s.duration / 5));
  }

  return sections;
}


// -----------------------------------------------------------------------------
// Custom Paragraph Renderer

function inlineBlanks(text) {
  return text.replace(/\[\[([^\]]+)]]/g, (x, body) => {
    const choices = body.split('|');

    if (choices.length === 1)
      return `<x-blank-input solution="${body}"></x-blank-input>`;

    const choiceEls = choices.map(c => `<span class="choice">${c}</span>`);
    return `<x-blank>${choiceEls.join('')}</x-blank>`;
  });
}

function inlineEquations(text) {
  // We want to match $a$ strings, except when they are prefixed with a \$
  // e.g. for currencies, or when they start with ${} (for variables).
  return text.replace(/(^|[^\\])\$([^{][^$]*?)\$/g, (x, prefix, body) => {
    return prefix + makeTexPlaceholder(body, true);
  })
}

function inlineVariables(text) {
  return text.replace(/\${([^}]+)}{([^}]+)}/g, '<x-var bind="$2">${$1}</x-var>')
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

  // Replace non-breaking space and escaped $s.
  text = text.replace(/\\ /g, '&nbsp;').replace(/\\\$/g, '$');

  return emoji.emojify(text, x => x, emojiImg);
}


// -----------------------------------------------------------------------------
// Marked JS Renderer

const codeBlocks = {
  py: 'language-python',
  js: 'language-js',
  c: 'language-clike',
  jl: 'language-julia',
  r: 'language-r',
  code: 'language-markup',
  sh: 'language-bash'
};

renderer.link = function (href, title, text) {
  if (href === 'btn:next') {
    return `<button class="next-step">${text}</button>`;
  }

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

  if (href.startsWith('pill:')) {
    let id = href.slice(5);
    return `<strong class="pill step-target" data-to="${id}">${text}</strong>`;
  }

  if (href === 'pill') {
    return `<strong class="pill">${text}</strong>`;
  }

  const href1 = entities.decode(href);
  if (href1.startsWith('->')) {
    return `<x-target to="${href1.slice(2).replace(/_/g, ' ')}">${text}</x-target>`;
  }

  return `<a href="${href}" target="_blank">${text}</a>`;
};

renderer.codespan = function (code) {
  code = entities.decode(code);

  for (let key of Object.keys(codeBlocks)) {
    if (code.startsWith(`{${key}}`)) {
      code = code.slice(key.length + 2).trim();
      return `<code class="${codeBlocks[key]}">${code}</code>`;
    }
  }

  try {
    const expr = Expression.parse(code);
    const maths = expr.toMathML({
      pill: (expr, color, target) => `<span class="pill step-target ${color.val.s}" data-to="${target.val.s}">${expr}</span>`,
      target: (expr, target) => `<span class="step-target" data-to="${target.val.s}">${expr}</span>`,
      input: (value) => `<x-blank-input solution="${value.val.n}"></x-blank-input>`,
      blank: (...values) => `<x-blank>${values.map(v => `<span class="choice">${v}</span>`).join('')}</x-blank>`,
      arc: (value) => `<mover>${value}<mo value="⌒">⌒</mo></mover>`,
      var: (value) => `<span class="var">\${${value.val.s}}</span>`
    });
    return `<span class="math">${maths}</span>`;
  } catch(e) {
    console.log(`Maths parsing error in "${code}":`, e.toString());
    return '<span class="math"></span>';
  }
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
    name = codeBlocks[name] || name;
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

const NOWRAP_QUERY = 'code, x-blank-input, x-blank, x-var, svg.mathjax, x-gloss, x-bio, span.step-target, span.pill, x-target, span.math';

// This prevents line breaks between inline-block elements and punctuation.
// Note the NOWRAP characters are removed later, after trailing punctuation
// is added *inside* the <span> element.
function lineBreaks(dom) {
  for (const el of dom.querySelectorAll(NOWRAP_QUERY)) {
    if (!el.nextSibling || el.nextSibling.nodeName !== '#text') continue;
    const text = el.nextSibling.textContent;
    if (!text[0].match(/[:.,!?°]/)) continue;

    el.nextSibling.textContent = text.slice(1);
    const nowrap = el.ownerDocument.createElement('span');
    nowrap.classList.add('nowrap');
    el.replaceWith(nowrap);
    nowrap.appendChild(el);
    nowrap.innerHTML += text[0];
  }
}

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
