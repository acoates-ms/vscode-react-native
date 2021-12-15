// doesnt work because bundleLanguageFiles
// expects a buffer of all files. too bad

const nls = require("vscode-nls-dev");
const Vinyl = require("vinyl");
const gulp = require("gulp");
const th2 = require("through2");
const eventStream = require("event-stream");
const vinylfs = require("vinyl-fs");
const filter = require("gulp-filter");

module.exports = function (content, map, meta) {
    // console.log(this._compilation);
    const src = this.resourcePath;
    const callback = this.async();
    const { defaultLanguages } = this.getOptions();
    const outputPath = this._compilation.runtimeTemplate.outputOptions.path;

    console.log(ouputPath);

    console.log(defaultLanguages);

    vinylfs
        .src(src)
        .pipe(nls.createMetaDataFiles())
        .pipe(nls.createAdditionalLanguageFiles(defaultLanguages, "i18n"))
        .pipe(nls.bundleMetaDataFiles("asdasdasdas", "dist2"))
        .pipe(nls.bundleLanguageFiles())
        .pipe(
            filter(["**/nls.bundle.*.json", "**/nls.metadata.header.json", "**/nls.metadata.json"]),
        )
        .pipe(gulp.dest("dist2"))
        // .on("data", vinylFile => {
        //     // this.emitFile(vinylFile.basename, vinylFile.contents);
        // })
        .once("end", () => {
            console.log("end");
            callback(null, content, map, meta);
        });
};
