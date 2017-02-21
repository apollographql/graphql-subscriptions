var path = require('path');

module.exports = {
  context: path.join(__dirname, '/dist'),
  entry: './index.js',
  output: {
    path: path.join(__dirname, '/browser'),
    filename: 'index.js',
    library: 'GraphQLSubscriptions'
  }
}
