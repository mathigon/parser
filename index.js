// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const path = require('path');
const full = require('./src/full');
const text = require('./src/text');

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooks',
    'Custom markdown parser for Mathigon textbooks.',
    function() {

      const options = this.options({
        full: true,
        text: false,
        root: '../textbooks'
      });

      this.files.map(function({src, dest}) {
        let root = path.join(process.cwd(), options.root);
        src = path.join(process.cwd(), src[0]);
        dest = path.join(process.cwd(), dest);

        if (options.full) full(src, dest, root);
        if (options.text) text(src, dest, root);
      });
    });
};
