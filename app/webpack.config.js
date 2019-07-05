/* eslint-env node */

const path = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const webpack = require('webpack')

const mode = process.env.NODE_ENV || 'development'
const prod = mode === 'production'
const dev = !prod

module.exports = {
  // context is needed so that we are not dependent on working dir
  context: __dirname,
  entry: {
    bundle: ['./src/main.js'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.svelte'],
  },
  output: {
    path: __dirname + '/public',
    filename: '[name].js',
    chunkFilename: '[name].[id].js',
  },
  module: {
    rules: [
      {
        test: /\.svelte$/,
        exclude: /node_modules/,
        use: {
          loader: 'svelte-loader',
          options: {
            emitCss: true,
            hotReload: true,
            hotOptions: {
              // will display compile error in the client, avoiding page
              // reload on error
              optimistic: true,
            },
            dev,
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          /**
           * MiniCssExtractPlugin doesn't support HMR.
           * For developing, use 'style-loader' instead.
           * */
          prod ? MiniCssExtractPlugin.loader : 'style-loader',
          'css-loader',
        ],
      },
    ],
  },
  mode,
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new webpack.HotModuleReplacementPlugin(),
  ],
  devtool: prod ? false : 'source-map',
  devServer: {
    hot: true,
    contentBase: path.join(__dirname, 'public'),
  },
  optimization: {
    minimize: false,
  },
}
