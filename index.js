// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const fs = require('fs');
const marked = require('marked');
const yaml = require('yamljs');

const {parseFull, renderer} = require('./src/full');
// const parseText = require('./src/text');


// -----------------------------------------------------------------------------

function generate(grunt, src, dest, id, allBios, allGloss) {
  let content = fs.readFileSync(src + '/content.md', 'utf8');

  let {bios, gloss, data, stepsHTML, sectionsHTML} = parseFull(id, content, src);
  grunt.file.write(dest + '/data.json', JSON.stringify(data));

  let biosObj = {};
  for (let b of bios) {
    if (!(b in allBios)) grunt.log.error('Missing bio: ' + b);
    biosObj[b] = allBios[b];
  }
  grunt.file.write(dest + '/bios.json', JSON.stringify(biosObj));

  let glossObj = {};
  for (let g of gloss) {
    if (!(g in allGloss)) grunt.log.error('Missing glossary: ' + g);
    glossObj[g] = allGloss[g];
  }
  grunt.file.write(dest + '/glossary.json', JSON.stringify(glossObj));

  const hintsObj = {};
  if (fs.existsSync(src + '/hints.yaml')) {
    const hints = yaml.load(src + '/hints.yaml');
    for (let h of Object.keys(hints)) hintsObj[h] = marked(hints[h], {renderer});
  }
  grunt.file.write(dest + '/hints.json', JSON.stringify(hintsObj));

  for (let s of Object.keys(stepsHTML)) {
    grunt.file.write(dest + `/steps/${s}.html`, stepsHTML[s]);
  }

  for (let s of Object.keys(sectionsHTML)) {
    grunt.file.write(dest + `/sections/${s}.html`, sectionsHTML[s]);
  }
}

// -----------------------------------------------------------------------------

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooks', 'Mathigon Markdown parser.', function() {
    const options = this.options({root: 'content'});
    const root = path.join(process.cwd(), options.root);

    const bios = yaml.load(root + '/shared/bios.yaml');
    for (let b of Object.keys(bios)) bios[b].bio = marked(bios[b].bio, {renderer});

    const gloss = yaml.load(root + '/shared/glossary.yaml');
    for (let g of Object.keys(gloss)) gloss[g].text = marked(gloss[g].text, {renderer});

    for (let file of this.files) {
      const id = file.src[0].split('/')[file.src[0].split('/').length - 1];
      const src = path.join(process.cwd(), file.src[0]);
      const dest = path.join(process.cwd(), file.dest);
      generate(grunt, src, dest, id, bios, gloss)
    }
  });
};
