const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const nls = require("vscode-nls-dev");
const gulpTs = require("gulp-typescript");
const gulp = require("gulp");
const filter = require("gulp-filter");
const sourcemaps = require("gulp-sourcemaps");
const es = require("event-stream");
const Vinyl = require("vinyl");

const defaultLanguages = [
    { id: "zh-tw", folderName: "cht", transifexId: "zh-hant" },
    { id: "zh-cn", folderName: "chs", transifexId: "zh-hans" },
    { id: "ja", folderName: "jpn" },
    { id: "ko", folderName: "kor" },
    { id: "de", folderName: "deu" },
    { id: "fr", folderName: "fra" },
    { id: "es", folderName: "esn" },
    { id: "ru", folderName: "rus" },
    { id: "it", folderName: "ita" },

    // These language-pack languages are included for VS but excluded from the vscode package
    { id: "cs", folderName: "csy" },
    { id: "tr", folderName: "trk" },
    { id: "pt-br", folderName: "ptb", transifexId: "pt-BR" },
    { id: "pl", folderName: "plk" },
];

/** @type {import('webpack').Configuration} */
const webpackConfig = {
    mode: "none",
    target: "node",
    entry: path.resolve(`./src/extension/rn-extension.ts`),
    output: {
        libraryTarget: "commonjs2",
        path: path.resolve("dist2"),
        filename: "rn-extension.js",
        // devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: "source-map",
    resolve: {
        extensions: [".js", ".ts", ".json"],
    },
    plugins: [],
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "vscode-nls-dev/lib/webpack-loader",
                        options: {
                            base: path.join(__dirname),
                        },
                    },
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                sourceMap: true,
                            },
                        },
                    },
                    { loader: "./loader.js" },
                ],
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    format: {
                        comments: /^\**!|@preserve/i,
                    },
                },
                extractComments: false,
            }),
        ],
    },
    node: {
        __dirname: false,
        __filename: false,
    },
    externals: {
        vscode: "commonjs vscode",
    },
};

module.exports = async (env, argv) => {
    // const tsProject = gulpTs.createProject("tsconfig.json");
    // Vinyl.es.tsProject
    //     .src()
    //     // .pipe(sourcemaps.init())
    //     .pipe(nls.createMetaDataFiles())
    //     .pipe(nls.createAdditionalLanguageFiles(defaultLanguages, "i18n"))
    //     // .pipe(nls.bundleMetaDataFiles("asdsadasda", "dist2"))
    //     .pipe(nls.bundleLanguageFiles())
    //     // .pipe(
    //     //     filter([
    //     //         "**/nls.bundle.*.json",
    //     //         "**/nls.metadata.header.json",
    //     //         "**/nls.metadata.json",
    //     //         "!src/**",
    //     //     ]),
    //     // )
    //     .pipe(gulp.dest("dist2"));

    // await new Promise(res => {
    //     setTimeout(res, 1225000);
    // });

    return webpackConfig;
};
