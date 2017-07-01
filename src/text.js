// =============================================================================
// Plain Text Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


const fs = require('fs');
const path = require('path');
const grunt = require('grunt');
const marked = require('marked');


const renderer = new marked.Renderer();
renderer.link = function(href, title, text) { return text; };
renderer.heading = function(text) { return `\n\n${text}\n\n`; };
renderer.listitem = function(text) { return `* ${text}\n`; };
renderer.hr = function() { return `\n\n`; };
renderer.br = function() { return `\n`; };
renderer.code = renderer.paragraph = renderer.list = (text => `${text}\n\n`);
renderer.codespan = renderer.strong = renderer.em = renderer.del = (code => code);
renderer.image = (() => '');

function generate(text) {
  let result = text
    .replace(/\n\s*\/\/[^\n]*\n/g, '\n')  // Remove Comments.
    .replace(/\n\|\s[^\n]*\n/g, '\n')  // Remove Tables.
    .split(/\n\s*\n/)
    .splice(1, 1)  // Remove the second paragraph, which is data.
    .filter(p => !p.startsWith('---'))  // Remove section dividers.
    .filter(p => !p.startsWith('  '))  // Remove Jade code.
    .join('\n\n')
    .replace(/\[\[([^\]]+)\]\]/g, (x, body) => body.split('|')[0])  // Blanks.
    .replace(/\[([\w\s\-]+)\]\(->([^\)]+)\)/g, (x, text) => `${text}`)
    .replace(/\n\{([^\}]+)\}\n/g, '\n');  // Paragraph tags.

  return marked(result, {renderer})
    .replace(/\{([^\}]+)\}\s*/g, () => '')
    .replace(/\$\{([^\}]+)\}\{([^\}]+)\}/g, (x, body) => body)
    .replace(/\$\{([^\}]+)\}(?!\<\/x\-var\>)/g, (x, body) => body)
    .replace(/\[\{([^\}]+)\}\s*([^\]]*)\]/g, (x, options, body) => body)
    .trim();
}

module.exports = function(src, dest) {
  if (!fs.existsSync(path.join(src, 'content.md'))) return;
  const text = generate(fs.readFileSync(path.join(src, 'content.md'), 'utf8'));
  grunt.file.write(path.join(dest, 'content.txt'), text);
};
