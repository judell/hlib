var path = require('path')

module.exports = {
  entry: './hlib.js',
  output: {
    path: path.join(__dirname, '.'),
    filename: 'hlib.bundle.js',
    library: 'hlib',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
       use: ['source-map-loader'],
      }
    ]
  }
};