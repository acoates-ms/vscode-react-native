## Development setup

We welcome any quality bugfixes or contributions!

To avoid conflicts with your existing installation, it is recommended to delete the installed extension at:

- **Linux and macOS**: `~/.vscode/extensions/msjsdiag.vscode-react-native-<version>`
- **Windows**: `C:\Users\<username>\.vscode\extensions\msjsdiag.vscode-react-native-<version>`

## Build the project

- `git clone https://github.com/microsoft/vscode-react-native.git`
- `cd vscode-react-native`
- Run `npm ci`
- Run `npm install -g gulp` and add `"gulp.autoDetect": "on"` to your VS Code settings
- Run `gulp` and check `dist` folder for extension files

## Debugging

There are currently 2 components to our extension: The extension running in the VS Code process with the debug adapter, and some code wrapping the user React Native code which is launched by the debug adapter. These are all debugged in different ways:

- To debug the extension process itself and the debug adapter it provides, in VS Code run the `Launch Extension` debug target which will spawn a new instance of VS Code with the extension installed. You can set breakpoints in the Typescript and debug things such as extension activation and the command palette.

- To debug the code running in the same process as the React Native code, open up an instance of VS Code running the extension on a React Native project. From this instance, open up the Typescript file in the extension codebase that you wish to debug and add breakpoints. Now, when you launch the React Native project, you should hit breakpoints in the extension code wrapper.

- In addition you can also debug the functional indirectly by debugging the `debuggerWorker.js` file which is generated by Metro bundler, but modified by extension and saved in your React Native `.vscode/.react` folder locally. This file is created only when you start debugging against your React Native application and the debugger is already attached to it. The `debuggerWorker.js` is launched in `--inspect-brk` mode so it will wait until debugger is attached to the app.

## Testing

There is a set of Mocha tests for the extesnion and extension localization which can be run with `npm test` and `npm test-localization` or by `Launch Extension Tests` and `Launch Localization Tests`. Also there are e2e smoke tests placed in [`test/smoke`](https://github.com/microsoft/vscode-react-native/tree/master/test/smoke) folder that can be launched by `npm smoke-tests` command or by `Launch All Smoke Tests` command. Make sure to [prepare test environment](https://github.com/microsoft/vscode-react-native/blob/master/test/smoke/docs/run-locally.md) before launching e2e tests.

Run `gulp lint` to check your code against our linting rules or `gulp format` to try to autofix all linting problems with Prettier.

## Legal

You must complete a Contributor License Agreement (CLA). Briefly, this agreement testifies that you are granting us permission to use the submitted change according to the terms of the project's license, and that the work being submitted is under appropriate copyright.

Please submit a Contributor License Agreement (CLA) before submitting a pull request. You may visit [https://cla.microsoft.com](https://cla.microsoft.com) to sign the agreement digitally. Alternatively, download the agreement from ([Microsoft Contribution License Agreement.docx](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=822190) or [Microsoft Contribution License Agreement.pdf](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=921298)), sign, scan, and email it back to <cla@microsoft.com>. Be sure to include your github user name along with a copy of the signed agreement. Once we have received the signed CLA, we'll review the request.

## Sending a PR

Pull requests should:

- Include a clear description of the proposed change
- Be a child commit of a reasonably recent commit in the **master** branch
  - Requests need not be a single commit, but should be a linear sequence of commits (i.e. no merge commits in your PR)
- Have clear commit messages
  - e.g. "Refactor feature", "Fix issue", "Add tests for issue"
- Include adequate tests
  - At least one test should fail in the absence of your non-test code changes. If your PR does not match this criteria, please specify why
  - Tests should include reasonable permutations of the target fix/change
  - Include baseline changes with your change
- Have linting issues (`gulp lint`)

It is desirable, but not necessary, for the tests to pass at each commit.

To avoid line ending issues, set `autocrlf = input` and `whitespace = cr-at-eol` in your system's git configuration.
