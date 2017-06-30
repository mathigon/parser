// =============================================================================
// Textbooks Parser Grunt Plugin
// (c) Mathigon
// =============================================================================


const full = require('./src/full');
const text = require('./src/text');

module.exports = function(grunt) {
  grunt.registerMultiTask('textbooksParser',
    'Custom markdown parser for Mathigon textbooks.',
    function() {

      const options = this.options({
        full: true,
        text: false,
        root: '../../textbooks'
      });

      const chapters = this.files.map(function({src, dest}) {
        src = path.join(__dirname, '../', src[0]);
        let tasks = [];
        if (options.full) tasks.push(full(src, dest, options.root));
        if (options.text) tasks.push(text(src, dest, options.root));
        return Promise.all(tasks);
      });

      let done = this.async();
      return Promise.all(chapters).then(done).catch(grunt.fail.warn);
    });
};
