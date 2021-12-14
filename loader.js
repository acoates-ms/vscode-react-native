const nls = require("vscode-nls-dev");
const Vinyl = require("vinyl");
const gulp = require("gulp");
const th2 = require("through2");
const eventStream = require("event-stream");
const vinylfs = require("vinyl-fs");
const filter = require("gulp-filter");

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

module.exports = function (content, map, meta) {
    const src = this.resourcePath;
    const callback = this.async();
    const options = this.getOptions();

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
        .on("data", vinylFile => {
            this.emitFile(vinylFile.basename, vinylFile.contents);
        })
        .once("end", () => {
            callback(null, content, map, meta);
        });
};
