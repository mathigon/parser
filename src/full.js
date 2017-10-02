// =============================================================================
// Full Interactive Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


const fs = require('fs');
const path = require('path');
const yaml = require('yamljs');
const grunt = require('grunt');
const jade = require('jade');
const marked = require('marked');
const ascii2mathml = require("ascii2mathml");


const intro = '<div class="chapter-intro"><span class="user">Remember to <x-target to=".nav-link.dropdown-title">login</x-target> to save your progress and get personalised content.</span> <span class="size">This textbook works best on larger devices like tablets or laptops.</span></div>';

let bios = [];

// -----------------------------------------------------------------------------

function repeat(text, n) {
  let result = text;
  for (let i=1; i<n; ++i) result += text;
  return result;
}

function decodeHTML(html) {
  let replacements = [['amp', '&'], ['quot', '"'], ['apos', '\''], ['lt', '<'], ['gt', '>']];
  for (let r of replacements) {
    html = html.replace(new RegExp('&' + r[0] + ';', 'g'), r[1]);
  }
  return html;
}

function parseJade(text, path, directory) {
  // Jade code is indented by two spaces, which we need to remove.
  text = text.slice(2).replace(/\n\s\s/g, '\n')
    .replace(/(images)\//g, (x, f) => `/resources/${path}/${f}/` );
  return jade.render(text, {filename: directory + '/content.jade'});
}

function parseSection(text) {
  let tags = text.match('\-*(\{(.+)\})?')[2] || '';
  return jade.render('section' + tags).replace('</section>', '');
}

// -----------------------------------------------------------------------------

const renderer = new marked.Renderer();

renderer.link = function(href, title, text) {
  if (href.startsWith('gloss:')) return `<x-gloss xid="${href.slice(6)}">${text}</x-gloss>`;
  if (href.startsWith('bio:')) {
    let id = href.slice(4);
    if (!bios.includes(id)) bios.push(id);
    return `<x-bio xid="${id}">${text}</x-bio>`;
  }
  return `<a href="${href}" target="_blank">${text}</a>`;
};

renderer.code = renderer.codespan = function(code) {
  let maths = ascii2mathml(decodeHTML(code), {bare: true});
  maths = maths.replace(/<mo>-<\/mo>/, '<mo>–</mo>');
  return '<span class="math">' + maths + '</span>';
  // .replace(/<mrow>\s*<mo>\(<\/mo>/g, '<mfenced>')
  // .replace(/<mo>\)<\/mo>\s*<\/mrow>/g, '</mfenced>');
  // math = minify(math, { collapseWhitespace: true });
};

function parseMarkdown(text, path, directory) {
  text = text
    .replace(/\[\[([^\]]+)\]\]/g, function(x, body) {
      if (body.split('|').length > 1) return `<x-blank choices="${body}"></x-blank>`;
      return `<x-blank input="${body}"></x-blank>`;
    })
    .replace(/\:(\w+)\:/g, function(x, key) {
      // TODO Use the emoji description, not the key.
      return `<img class="emoji" width="20" height="20" src="/images/emoji/${key}.png"/>`;
    })
    .replace(/\[([\w\s\-]+)\]\(->([^\)]+)\)/g, function(x, text, target) {
      return `<x-target to="${target}">${text}</x-target>`
    })
    .replace(/\.subsection\(([\w\s\-]+)\)/g, function(x, text) {
      return `.subsection(data-needs="${text}")`;
    })
    .replace(/\.gloss\(([\w\s\-]+)\)/g, function(x, text) {
      return `(data-gloss="${text}")`;
    })
    .replace(/n't/g, 'n’t')
    .replace(/t's/g, 't’s');

  // Add classes to entire blocks
  let rows = text.split('\n');
  let blockTag = null;
  if (rows[0].match(/^\{([^\}]+)\}$/)) {
    blockTag = rows[0].slice(1, rows[0].length - 1).trim();
    text = rows.slice(1).join('\n');
  }

  // Support tables without headers
  if (text.startsWith('| ')) {
    let columns = Math.max(...text.split('\n').map(row => row.split(' | ').length));
    let header = `${repeat('| ', columns)}|\n${repeat('| --- ', columns)}|\n`;
    text = header + text;
  }

  let result = marked(text, {renderer/*, sanitize: true, smartypants: true*/})
    .replace(/<([\w\-]+)>\{([^\}]+)\}\s*/g, function(x, tag, options) {
      // expand <p>{.x}</p> to <p class="x"></p>
      return jade.render(tag + decodeHTML(options)).replace(/<\/.+>/, '');
    })
    .replace(/\$\{([^\}]+)\}\{([^\}]+)\}/g, function(x, body, slider) {
      return `<x-var bind="${slider}">\$\{${body}\}</x-var>`;
    })
    .replace(/\$\{([^\}]+)\}(?!\<\/x\-var\>)/g, function(x, body) {
      return `<span class="var">\$\{${body}\}</span>`;
    })
    .replace(/\[\{([^\}]+)\}\s*([^\]]*)\]/g, function(x, options, body) {
      // expand [{.x}] to <span class="x"></span>
      let tag = '.#('.includes(options[0]) ? 'span' : '';
      return jade.render(decodeHTML(tag + options + ' ' + body));
    });

  if (blockTag) {
    result = result.replace(/^<([\w\-]+)>/g, function(x, tag) {
      return jade.render(tag + decodeHTML(blockTag)).replace(/<\/.+>/, '');
    });
  }

  return result;
}

// -----------------------------------------------------------------------------

function parsePart(part, path, directory) {
  return (part.startsWith('  ') ? parseJade : parseMarkdown)(part, path, directory);
}

function generate(path, text, allBios, directory) {
  // Filter out all comment lines:
  text = text.replace(/\n\s*\/\/[^\n]*\n/g, '\n');

  let result = '';
  let part = '';

  bios = [];
  let data = {};

  for (let p of text.split(/\n\s*\n/)) {

    if (p.startsWith('---')) {
      // Section dividers
      let showIntro = result ? '' : intro;
      if (part) result += parsePart(part, path, directory);
      part = '';
      if (result) result += '</section>';
      result += parseSection(p) + showIntro;

    } else if (!result) {
      // Into content that is not rendered
      if (p.startsWith('#')) {
        data.title = p.slice(2);
      } else {
        Object.assign(data, yaml.parse(p));
      }

    } else {
      // Actual content
      if (p.startsWith('  ')) {
        if (part.startsWith('  ')) {
          part += '\n' + p;
        } else {
          result += parseMarkdown(part, path);
          part = p;
        }
      } else {
        result += parsePart(part, path, directory);
        part = p;
      }
    }
  }

  result += parsePart(part, path, directory) + '</section>';
  result = result.replace(/[\n\s]+/g, ' ');  // minify html

  let fullBios = {};
  for (let b of bios) fullBios[b] = allBios[b];

  return {html: result, bios: JSON.stringify(fullBios), data: JSON.stringify(data)};
}


module.exports = function(src, dest, root) {
  // TODO convert allBios to YAML and parse here
  const allBios = require(root + '/shared/bios.json');

  let id = src.split('/')[src.split('/').length - 1];

  // DEPRECATED Old chapters that have JADE rather than Markdown.
  if (!fs.existsSync(path.join(src, 'content.md'))) {
    let content = fs.readFileSync(path.join(src, 'content.jade'), 'utf8');
    let html = jade.render(content, {filename: src + '/content.jade'});

    let bios = {};
    for (let b of content.match(/bio\(xid=['"]\w*['"]/g).map(b => b.slice(9, -1))) {
      bios[b] = allBios[b];
    }

    grunt.file.write(path.join(dest, 'content.html'), html);
    grunt.file.write(path.join(dest, 'bios.json'), JSON.stringify(bios));
    return;
  }

  // TODO convert glossary to YAML and parse here
  let content = fs.readFileSync(path.join(src, 'content.md'), 'utf8');
  let {html, bios, data} = generate(id, content, allBios, src);

  grunt.file.write(path.join(dest, 'content.html'), html);
  grunt.file.write(path.join(dest, 'bios.json'), bios);
  grunt.file.write(path.join(dest, 'data.json'), data);
};
