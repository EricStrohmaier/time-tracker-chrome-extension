const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  // Use a CSP-compatible devtool option
  devtool: 'inline-source-map',
  entry: {
    popup: './src/popup.ts',
    background: './src/background.ts',
    content: './src/content.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
      ],
    }),
  ],
};
