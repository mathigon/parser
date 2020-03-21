// =============================================================================
// Custom MathML Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


const yaml = require('yamljs');
const marked = require('marked');
const pug = require('pug');
const emoji = require('node-emoji');
const entities = require('html-entities').AllHtmlEntities;

const {last} = require('@mathigon/core');
const {Expression} = require('@mathigon/hilbert');
const {makeTexPlaceholder} = require('./mathjax');


const codeBlocks = {
  py: 'language-python',
  js: 'language-js',
  c: 'language-clike',
  jl: 'language-julia',
  r: 'language-r',
  code: 'language-markup',
  sh: 'language-bash'
};

const customMathML = {
  pill: (expr, color, target) => {
    if (!target) return `<span class="pill ${color.val.s}">${expr}</span>`;
    return `<span class="pill step-target ${color.val.s}" data-to="${target.val.s}">${expr}</span>`;
  },
  target: (expr, target) => `<span class="step-target" tabindex="0" data-to="${target.val.s}">${expr}</span>`,
  reveal: (expr, when) => `<mrow class="reveal" data-when="${when.val.s}">${expr}</mrow>`,
  input: (value, placeholder) => `<x-blank-input solution="${value.val.n}" placeholder="${placeholder ? placeholder.val.s : '???'}"></x-blank-input>`,
  blank: (...values) => `<x-blank>${values.map(v => `<button class="choice">${v}</button>`).join('')}</x-blank>`,
  arc: (value) => `<mover>${value}<mo value="⌒">⌒</mo></mover>`,
  var: (value) => `<span class="var">\${${value.val.s}}</span>`
};


module.exports.getRenderer = function (course, directory) {
  const renderer = new marked.Renderer();

  let globalPug = '';  // Global Pug code at the beginning of chapters
  let originalP = '';  // Caching of unparsed paragraphs (for blockquotes)

  renderer.link = function (href, title, text) {
    if (href === 'btn:next') {
      return `<button class="next-step">${text}</button>`;
    }

    if (href.startsWith('gloss:')) {
      let id = href.slice(6);
      course.gloss.add(id);
      return `<x-gloss xid="${id}">${text}</x-gloss>`;
    }

    if (href.startsWith('bio:')) {
      let id = href.slice(4);
      course.bios.add(id);
      return `<x-bio xid="${id}">${text}</x-bio>`;
    }

    if (href.startsWith('target:')) {
      let id = href.slice(7);
      return `<span class="step-target" tabindex="0" data-to="${id}">${text}</span>`;
    }

    if (href.startsWith('action:')) {
      let id = href.slice(7);
      return `<button class="var-action" @click="${id}">${text}</button>`;
    }

    if (href.startsWith('pill:')) {
      let id = href.slice(5);
      return `<strong class="pill step-target" tabindex="0" data-to="${id}">${text}</strong>`;
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

  renderer.codespan = (code) => {
    code = entities.decode(code);

    for (let key of Object.keys(codeBlocks)) {
      if (code.startsWith(`{${key}}`)) {
        code = code.slice(key.length + 2).trim();
        return `<code class="${codeBlocks[key]}">${code}</code>`;
      }
    }

    const newRender = code.startsWith('§');
    if (newRender) code = code.slice(1);

    try {
      const expr = Expression.parse(code);
      const maths = expr.toMathML(customMathML);
      const voice = expr.toVoice({pill: '', target: '', input: '', blank: ''});
      return newRender ? `<x-math data-voice="${voice}">${maths}</x-math>` : `<span class="math" data-voice="${voice}">${maths}</span>`;
    } catch (e) {
      console.log(`Maths parsing error in "${code}":`, e.toString());
      return '<span class="math"></span>';
    }
  };

  renderer.heading = (text, level) => {
    if (level === 1) {
      course.title = text;
      return '';
    }
    return `<h${level - 1}>${text}</h${level - 1}>`;
  };

  renderer.blockquote = (quote) => {
    Object.assign(last(course.steps), yaml.parse(originalP || quote));
    return '';
  };

  renderer.hr = () => {
    course.steps.push({});
    return '</x-step><x-step>';
  };

  renderer.code = (code, name) => {
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
    // We store mixin code to a global variable, and then prepend it to all
    // following PUG blocks. This allows you to define file-level mixins.
    // TODO Also remove code that is not a mixin.
    const hasMixins = code.split('\n').find(line => line.startsWith('mixin'));
    if (hasMixins) globalPug += code + '\n\n';

    return pug.render(globalPug + code, {filename: directory + '/content.pug'});
  };

  renderer.listitem = (text) => {
    return '<li>' + parseParagraph(text) + '</li>';
  };

  renderer.tablecell = (text, flags) => {
    const tag = flags.header ? 'th' : 'td';
    const align = flags.align ? ` align="${flags.align}"` : '';
    return `<${tag}${align}>${parseParagraph(text)}</${tag}>`;
  };

  renderer.paragraph = (text) => {
    originalP = text;
    return '<p>' + parseParagraph(text) + '</p>';
  };

  return renderer;
};


// -----------------------------------------------------------------------------
// Helper Functions

function inlineBlanks(text) {
  return text.replace(/\[\[([^\]]+)]]/g, (x, body) => {
    const choices = body.split('|');

    if (choices.length === 1)
      return `<x-blank-input solution="${body}"></x-blank-input>`;

    const choiceEls = choices.map(c => `<button class="choice">${c}</button>`);
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
