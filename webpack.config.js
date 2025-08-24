const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    main: "./src/main.ts",
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: "[name]-bundle.js",
  },
  resolve: {
    // Add ".ts" and ".tsx" as resolvable extensions.
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: "ts-loader" },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: './html' },
        { from: './resources', to: './resources' },

        { from: './node_modules/katex/dist/katex.min.css', to: 'lib/katex/' },
        { from: './node_modules/katex/dist/fonts/', to: 'lib/katex/fonts/' },

        { from: './node_modules/bootstrap-icons/font/fonts/', to: 'lib/bootstrap-icons/font/fonts/'},
        { from: './node_modules/bootstrap-icons/font/bootstrap-icons.min.css', to: 'lib/bootstrap-icons/font/'},
      ],
    }),
  ],
  watchOptions: {
    ignored: /node_modules/,
    poll: 500,
  },
};
