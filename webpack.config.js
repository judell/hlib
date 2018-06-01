var path = require('path')

module.exports = {
  entry: './hlib.js',
  output: {
    path: path.join(__dirname, '.'),
    filename: 'hlib.bundle.js',
    library: 'hlib',
  },
  //devtool: 'inline-source-map'
};