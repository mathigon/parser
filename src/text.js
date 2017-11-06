// =============================================================================
// Plain Text Parser for Mathigon Textbooks
// (c) Mathigon
// =============================================================================


const marked = require('marked');
const renderer = new marked.Renderer();

renderer.link = function(href, title, text) { return text; };
renderer.heading = function(text) { return `\n\n${text}\n\n`; };
renderer.listitem = function(text) { return `* ${text}\n`; };
renderer.hr = function() { return `\n\n`; };
renderer.br = function() { return `\n`; };
renderer.code = renderer.blockquote = function() { return ''; };
renderer.paragraph = renderer.list = (text => text + '\n\n');
renderer.codespan = renderer.strong = renderer.em = renderer.del = (code => code);
renderer.image = (() => '');

// -----------------------------------------------------------------------------

module.exports = function(id, content, _src) {
  let text = content
    .replace(/\n\s*\/\/[^\n]*\n/g, '\n')  // Remove Comments.
    .replace(/\n\|\s[^\n]*\n/g, '\n')  // Remove Tables.
    .replace(/\[\[([^\]]+)\]\]/g, (x, body) => body.split('|')[0])  // Blanks.
    .replace(/\[([\w\s\-]+)\]\(->([^\)]+)\)/g, (x, text) => text)  // Targets.
    .replace(/\n\{([^\}]+)\}\n/g, '\n');  // Paragraph tags.

  text = marked(text)
    .replace(/\{([^\}]+)\}\s*/g, () => '')
    .replace(/\$\{([^\}]+)\}\{([^\}]+)\}/g, (x, body) => body)
    .replace(/\$\{([^\}]+)\}(?!\<\/x\-var\>)/g, (x, body) => body)
    .replace(/\[\{([^\}]+)\}\s*([^\]]*)\]/g, (x, options, body) => body)
    .trim();

    return text;
};
