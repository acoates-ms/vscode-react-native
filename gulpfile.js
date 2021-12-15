// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

const gulp = require("gulp");
const vscodeTest = require("vscode-test");
const cp = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const languages = require("./i18n").languages;
const gulpTs = require("gulp-typescript");
const nls = require("vscode-nls-dev");
const filter = require("gulp-filter");
const { Writable } = require("stream");

const config = {
    extensionName: process.argv.includes("--nightly")
        ? "vscode-react-native-preview"
        : "vscode-react-native",

    dest: "./dist2",
    languages,
};

gulp.task("test", async () => {
    var wr = process.stdout.write;
    process.stdout.write = () => {};
    process.stdout.cork();
    console.log(42);
    process.stdout.uncork();
    process.stdout.write = wr;
});

const buildTranslation = async () => {
    {
        // disables useless logs
        let stdWrite = process.stdout.write;
        var stopOuput = () => (process.stdout.write = () => {});
        var resumeOutput = () => (process.stdout.write = stdWrite);
    }

    const tsProject = gulpTs.createProject("tsconfig.json");

    stopOuput();
    await new Promise(resolve => {
        tsProject
            .src()
            .pipe(nls.createMetaDataFiles())
            .pipe(nls.createAdditionalLanguageFiles(config.languages, "i18n"))
            .pipe(nls.bundleMetaDataFiles(config.extensionName, config.dest))
            .pipe(nls.bundleLanguageFiles())
            .pipe(
                filter([
                    "**/nls.bundle.*.json",
                    "**/nls.metadata.header.json",
                    "**/nls.metadata.json",
                    "!src/**",
                ]),
            )
            .pipe(gulp.dest(config.dest))
            .once("end", resolve);
    });
    resumeOutput();
};

gulp.task("full-build", async () => {
    await fs.rm(config.dest, { recursive: true, force: true });
    await buildTranslation();
    await promisify(cp.exec)(`npx webpack --mode production --output-path ${config.dest}`);
});
