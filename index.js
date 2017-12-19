// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const marked = require('marked');
const yaml = require('yamljs');
const pug = require('pug');

const {parseFull, renderer} = require('./src/full');
// const parseText = require('./src/text');


// -----------------------------------------------------------------------------

function generate(grunt, src, dest, id, allBios, allGloss) {
  let content = fs.readFileSync(src + '/content.md', 'utf8');

  let {html, bios, gloss, data} = parseFull(id, content, src);
  grunt.file.write(dest + '/content.html', html);
  grunt.file.write(dest + '/data.json', JSON.stringify(data));

  let biosObj = {};
  for (let b of bios) biosObj[b] = allBios[b];
  grunt.file.write(dest + '/bios.json', JSON.stringify(biosObj));

  let glossObj = {};
  for (let g of gloss) glossObj[g] = allGloss[g];
  grunt.file.write(dest + '/glossary.json', JSON.stringify(glossObj));

  // let text = parseText(id, content);
  // grunt.file.write(dest + '/content.txt', text);
}

// DEPRECATED Old chapters that have Pug rather than Markdown.
function generateOld(grunt, src, dest, allBios) {
  let content = fs.readFileSync(src + '/content.pug', 'utf8');
  let html = pug.render(content, {filename: src + '/content.pug'});

  let bios = {};
  for (let b of content.match(/bio\(xid=['"]\w*['"]/g).map(b => b.slice(9, -1))) {
    bios[b] = allBios[b];
  }

  grunt.file.write(dest + '/content.html', html);
  grunt.file.write(dest + '/bios.json', JSON.stringify(bios));
}

// -----------------------------------------------------------------------------

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooks',
    'Custom markdown parser for Mathigon textbooks.',
    function() {
      const options = this.options({root: '../textbooks'});
      const root = path.join(process.cwd(), options.root);

      const bios = yaml.load(root + '/shared/bios.yaml');
      for (let b of Object.keys(bios)) bios[b].bio = marked(bios[b].bio, {renderer});

      const gloss = yaml.load(root + '/shared/glossary.yaml');
      for (let g of Object.keys(gloss)) gloss[g] = marked(gloss[g], {renderer});

      for (let file of this.files) {
        const id = file.src[0].split('/')[file.src[0].split('/').length - 1];
        const src = path.join(process.cwd(), file.src[0]);
        const dest = path.join(process.cwd(), file.dest);

        if (fs.existsSync(src + '/content.md')) {
          generate(grunt, src, dest, id, bios, gloss)
        } else {
          generateOld(grunt, src, dest, bios);
        }
      }
    });
};
