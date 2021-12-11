const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");

/** @type {import('webpack').Configuration} */
const webpackConfig = {
    mode: "none",
    target: "node",
    entry: path.resolve(`./src/extension/rn-extension.ts`),
    output: {
        clean: true,
        libraryTarget: "commonjs2",
        path: path.resolve("dist"),
        filename: "rn-extension.js",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: "source-map",
    resolve: {
        extensions: [".js", ".ts", ".json"],
    },
    plugins: [require("vscode-nls-dev/lib/webpack-bundler").NLSBundlePlugin],
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "vscode-nls-dev/lib/webpack-loader",
                        options: {
                            base: __dirname,
                        },
                    },
                    {
                        // configure TypeScript loader:
                        // * enable sources maps for end-to-end source maps
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                sourceMap: true,
                            },
                        },
                    },
                ],
            },
        ],
    },
    optimization: {
        minimize: false,
    },
    node: {
        __dirname: false,
        __filename: false,
    },
    externals: {
        vscode: "commonjs vscode",
    },
};

module.exports = (env, argv) => {
    return webpackConfig;
};
