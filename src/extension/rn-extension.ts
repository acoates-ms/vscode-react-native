// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
// @ifdef DEBUG
try {
    /* tslint:disable:no-var-requires */
    require("fs").statSync(`${__filename}.map`); // We check if source maps are available
    require("source-map-support").install(); // If they are, we enable stack traces translation to typescript
    /* tslint:enable:no-var-requires */
} catch (exceptions) {
    // If something goes wrong, we just ignore the errors
}
// @endif
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import * as semver from "semver";
import * as nls from "vscode-nls";
import { EntryPointHandler, ProcessType } from "../common/entryPointHandler";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalError } from "../common/error/internalError";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { ProjectVersionHelper } from "../common/projectVersionHelper";
import { Telemetry } from "../common/telemetry";
import { TelemetryHelper, ICommandTelemetryProperties } from "../common/telemetryHelper";
import { DebugSessionBase } from "../debugger/debugSessionBase";
import { CONTEXT_VARIABLES_NAMES } from "../common/contextVariablesNames";
import { CommandPaletteHandler } from "./commandPaletteHandler";
import { SettingsHelper } from "./settingsHelper";
import { ReactDirManager } from "./reactDirManager";
import { OutputChannelLogger } from "./log/OutputChannelLogger";
import { ReactNativeDebugConfigProvider } from "./debuggingConfiguration/reactNativeDebugConfigProvider";
import { ReactNativeDebugDynamicConfigProvider } from "./debuggingConfiguration/reactNativeDebugDynamicConfigProvider";
import {
    DEBUG_CONFIGURATION_NAMES,
    DEBUG_TYPES,
} from "./debuggingConfiguration/debugConfigTypesAndConstants";
import {
    LaunchJsonCompletionProvider,
    JsonLanguages,
} from "./debuggingConfiguration/launchJsonCompletionProvider";
import { ReactNativeSessionManager } from "./reactNativeSessionManager";
import { ProjectsStorage } from "./projectsStorage";
import { AppLauncher } from "./appLauncher";
import {
    getExtensionVersion,
    getExtensionName,
    findFileInFolderHierarchy,
} from "../common/extensionHelper";
import { LogCatMonitorManager } from "./android/logCatMonitorManager";
import { ExtensionConfigManager } from "./extensionConfigManager";
import { TipNotificationService } from "./tipsNotificationsService/tipsNotificationService";
import { RNProjectObserver } from "./rnProjectObserver";
import { TargetType } from "./generalPlatform";
nls.config({
    messageFormat: nls.MessageFormat.bundle,
    bundleFormat: nls.BundleFormat.standalone,
})();
const localize = nls.loadMessageBundle();

/* all components use the same packager instance */
const outputChannelLogger = OutputChannelLogger.getMainChannel();
const entryPointHandler = new EntryPointHandler(ProcessType.Extension, outputChannelLogger);
let debugConfigProvider: ReactNativeDebugConfigProvider | null;
let dynamicDebugConfigProvider: ReactNativeDebugDynamicConfigProvider | null;

const APP_NAME = "react-native-tools";

interface ISetupableDisposable extends vscode.Disposable {
    setup(): Promise<any>;
}

let EXTENSION_CONTEXT: vscode.ExtensionContext;
/**
 * We initialize the counter starting with a large value in order
 * to not overlap indices of the workspace folders originally generated by VS Code
 * {@link https://code.visualstudio.com/api/references/vscode-api#WorkspaceFolder}
 */
let COUNT_WORKSPACE_FOLDERS = 9000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const extensionName = getExtensionName();
    const appVersion = getExtensionVersion();
    if (!appVersion) {
        throw new Error(localize("ExtensionVersionNotFound", "Extension version is not found"));
    }

    if (extensionName) {
        const isUpdatedExtension = isUpdatedVersion(appVersion);

        if (extensionName.includes("preview")) {
            if (showTwoVersionFoundNotification()) {
                return;
            }
        } else if (isUpdatedExtension) {
            showChangelogNotificationOnUpdate(appVersion);
        }

        if (isUpdatedExtension) {
            TipNotificationService.getInstance().updateTipsConfig();
        }

        TipNotificationService.getInstance().showTipNotification();
    }

    outputChannelLogger.debug("Begin to activate...");
    outputChannelLogger.debug(`Extension version: ${appVersion}`);
    const ExtensionTelemetryReporter = require("vscode-extension-telemetry").default;
    const reporter = new ExtensionTelemetryReporter(
        APP_NAME,
        appVersion,
        Telemetry.APPINSIGHTS_INSTRUMENTATIONKEY,
    );
    const configProvider = (debugConfigProvider = new ReactNativeDebugConfigProvider());
    const dymConfigProvider = (dynamicDebugConfigProvider = new ReactNativeDebugDynamicConfigProvider());
    const completionItemProviderInst = new LaunchJsonCompletionProvider();
    const workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
        vscode.workspace.workspaceFolders;
    let extProps: ICommandTelemetryProperties = {};
    if (workspaceFolders) {
        extProps = {
            ["workspaceFoldersCount"]: { value: workspaceFolders.length, isPii: false },
        };
    }

    EXTENSION_CONTEXT = context;

    return entryPointHandler.runApp(
        APP_NAME,
        appVersion,
        ErrorHelper.getInternalError(InternalErrorCode.ExtensionActivationFailed),
        reporter,
        async function activateRunApp() {
            EXTENSION_CONTEXT.subscriptions.push(
                vscode.workspace.onDidChangeWorkspaceFolders(event =>
                    onChangeWorkspaceFolders(event),
                ),
            );
            EXTENSION_CONTEXT.subscriptions.push(
                vscode.workspace.onDidChangeConfiguration(() => onChangeConfiguration()),
            );
            EXTENSION_CONTEXT.subscriptions.push(TipNotificationService.getInstance());

            EXTENSION_CONTEXT.subscriptions.push(
                vscode.debug.registerDebugConfigurationProvider(
                    DEBUG_TYPES.REACT_NATIVE,
                    configProvider,
                ),
            );

            EXTENSION_CONTEXT.subscriptions.push(
                vscode.debug.registerDebugConfigurationProvider(
                    DEBUG_TYPES.REACT_NATIVE,
                    dymConfigProvider,
                    vscode.DebugConfigurationProviderTriggerKind.Dynamic,
                ),
            );
            EXTENSION_CONTEXT.subscriptions.push(
                vscode.debug.registerDebugConfigurationProvider(
                    DEBUG_TYPES.REACT_NATIVE_DIRECT,
                    dymConfigProvider,
                    vscode.DebugConfigurationProviderTriggerKind.Dynamic,
                ),
            );

            EXTENSION_CONTEXT.subscriptions.push(
                vscode.languages.registerCompletionItemProvider(
                    { language: JsonLanguages.json },
                    completionItemProviderInst,
                ),
            );
            EXTENSION_CONTEXT.subscriptions.push(
                vscode.languages.registerCompletionItemProvider(
                    { language: JsonLanguages.jsonWithComments },
                    completionItemProviderInst,
                ),
            );

            const sessionManager = new ReactNativeSessionManager();

            EXTENSION_CONTEXT.subscriptions.push(
                vscode.debug.registerDebugAdapterDescriptorFactory(
                    DEBUG_TYPES.REACT_NATIVE,
                    sessionManager,
                ),
            );
            EXTENSION_CONTEXT.subscriptions.push(
                vscode.debug.registerDebugAdapterDescriptorFactory(
                    DEBUG_TYPES.REACT_NATIVE_DIRECT,
                    sessionManager,
                ),
            );

            EXTENSION_CONTEXT.subscriptions.push(sessionManager);

            EXTENSION_CONTEXT.subscriptions.push(
                DebugSessionBase.onDidTerminateRootDebugSession(terminateEvent => {
                    sessionManager.terminate(terminateEvent);
                }),
            );

            const activateExtensionEvent = TelemetryHelper.createTelemetryEvent("activate");
            Telemetry.send(activateExtensionEvent);
            const promises: Promise<void>[] = [];
            if (workspaceFolders) {
                outputChannelLogger.debug(`Projects found: ${workspaceFolders.length}`);
                workspaceFolders.forEach((folder: vscode.WorkspaceFolder) => {
                    promises.push(onFolderAdded(folder));
                });
            } else {
                outputChannelLogger.warning("Could not find workspace while activating");
                TelemetryHelper.sendErrorEvent(
                    "ActivateCouldNotFindWorkspace",
                    ErrorHelper.getInternalError(InternalErrorCode.CouldNotFindWorkspace),
                );
            }

            await Promise.all(promises);
            registerReactNativeCommandPaletteCommands();
            registerReactNativeSpecialCommands();
        },
        extProps,
    );
}

export function deactivate(): Promise<void> {
    return new Promise<void>(function (resolve) {
        // Kill any packager processes that we spawned
        entryPointHandler.runFunction(
            "extension.deactivate",
            ErrorHelper.getInternalError(InternalErrorCode.FailedToStopPackagerOnExit),
            () => {
                if (debugConfigProvider) {
                    debugConfigProvider = null;
                }
                if (dynamicDebugConfigProvider) {
                    dynamicDebugConfigProvider = null;
                }
                CommandPaletteHandler.stopAllPackagers()
                    .then(() => {
                        return CommandPaletteHandler.stopElementInspector();
                    })
                    .then(() => {
                        LogCatMonitorManager.cleanUp();
                        // Tell vscode that we are done with deactivation
                        resolve();
                    });
            },
            /* errorsAreFatal*/ true,
        );
    });
}

function onChangeWorkspaceFolders(event: vscode.WorkspaceFoldersChangeEvent) {
    if (event.removed.length) {
        event.removed.forEach(folder => {
            onFolderRemoved(folder);
        });
    }

    if (event.added.length) {
        event.added.forEach(folder => {
            onFolderAdded(folder);
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onChangeConfiguration() {
    // TODO implements
}

export function createAdditionalWorkspaceFolder(folderPath: string): vscode.WorkspaceFolder | null {
    if (fs.existsSync(folderPath)) {
        const folderUri = vscode.Uri.file(folderPath);
        const folderName = path.basename(folderPath);
        const newFolder = {
            uri: folderUri,
            name: folderName,
            index: ++COUNT_WORKSPACE_FOLDERS,
        };
        return newFolder;
    }
    return null;
}

export function getCountOfWorkspaceFolders(): number {
    return COUNT_WORKSPACE_FOLDERS;
}

export async function onFolderAdded(folder: vscode.WorkspaceFolder): Promise<void> {
    const rootPath = folder.uri.fsPath;
    const projectRootPath = SettingsHelper.getReactNativeProjectRoot(rootPath);
    outputChannelLogger.debug(`Add project: ${projectRootPath}`);
    const versions = await ProjectVersionHelper.tryToGetRNSemverValidVersionsFromProjectPackage(
        projectRootPath,
        ProjectVersionHelper.generateAllAdditionalPackages(),
        projectRootPath,
    );
    outputChannelLogger.debug(`React Native version: ${versions.reactNativeVersion}`);
    const promises = [];
    if (ProjectVersionHelper.isVersionError(versions.reactNativeVersion)) {
        outputChannelLogger.debug(
            `react-native package version is not found in ${projectRootPath}. Reason: ${versions.reactNativeVersion}`,
        );
        TelemetryHelper.sendErrorEvent(
            "AddProjectReactNativeVersionIsEmpty",
            ErrorHelper.getInternalError(InternalErrorCode.CouldNotFindProjectVersion),
            versions.reactNativeVersion,
        );
    } else if (isSupportedVersion(versions.reactNativeVersion)) {
        activateCommands();

        promises.push(
            entryPointHandler.runFunction(
                "debugger.setupLauncherStub",
                ErrorHelper.getInternalError(InternalErrorCode.DebuggerStubLauncherFailed),
                async () => {
                    const reactDirManager = new ReactDirManager(rootPath);
                    const projectObserver = new RNProjectObserver(projectRootPath, versions);
                    await setupAndDispose(reactDirManager);
                    ProjectsStorage.addFolder(
                        projectRootPath,
                        new AppLauncher(reactDirManager, projectObserver, folder),
                    );
                    COUNT_WORKSPACE_FOLDERS++;
                },
            ),
        );
    } else {
        outputChannelLogger.debug(`react-native@${versions.reactNativeVersion} isn't supported`);
    }
    await Promise.all(promises);
}

function activateCommands(): void {
    vscode.commands.executeCommand("setContext", CONTEXT_VARIABLES_NAMES.IS_RN_PROJECT, true);
}

function onFolderRemoved(folder: vscode.WorkspaceFolder): void {
    const appLauncher = ProjectsStorage.getFolder(folder);
    Object.keys(appLauncher).forEach(key => {
        if (appLauncher[key].dispose) {
            appLauncher[key].dispose();
        }
    });
    outputChannelLogger.debug(`Delete project: ${folder.uri.fsPath}`);
    ProjectsStorage.delFolder(folder);

    try {
        // Preventing memory leaks
        EXTENSION_CONTEXT.subscriptions.forEach((element: any, index: number) => {
            if (element.isDisposed) {
                EXTENSION_CONTEXT.subscriptions.splice(index, 1); // Array.prototype.filter doesn't work, "context.subscriptions" is read only
            }
        });
    } catch (err) {
        // Ignore
    }
}

async function setupAndDispose<T extends ISetupableDisposable>(
    setuptableDisposable: T,
): Promise<T> {
    await setuptableDisposable.setup();
    EXTENSION_CONTEXT.subscriptions.push(setuptableDisposable);
    return setuptableDisposable;
}

function isSupportedVersion(version: string): boolean {
    if (!!semver.valid(version) && !semver.gte(version, "0.19.0")) {
        TelemetryHelper.sendSimpleEvent("unsupportedRNVersion", { rnVersion: version });
        const shortMessage = localize(
            "ReactNativeToolsRequiresMoreRecentVersionThan019",
            "React Native Tools need React Native version 0.19.0 or later to be installed in <PROJECT_ROOT>/node_modules/",
        );
        const longMessage = `${shortMessage}: ${version}`;
        vscode.window.showWarningMessage(shortMessage);
        outputChannelLogger.warning(longMessage);
        return false;
    }
    // !!semver.valid(version) === false is OK for us, someone can use custom RN implementation with custom version e.g. -> "0.2018.0107-v1"
    return true;
}

function registerReactNativeCommandPaletteCommands(): void {
    registerVSCodeCommand(
        "launchAndroidSimulator",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToStartAndroidEmulator),
        () => CommandPaletteHandler.launchAndroidEmulator(),
    );
    registerVSCodeCommand(
        "launchIOSSimulator",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToStartIOSSimulator),
        () => CommandPaletteHandler.launchIOSSimulator(),
    );
    registerVSCodeCommand(
        "runAndroidSimulator",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnAndroid),
        () => CommandPaletteHandler.runAndroid(TargetType.Simulator),
    );
    registerVSCodeCommand(
        "runAndroidDevice",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnAndroid),
        () => CommandPaletteHandler.runAndroid(TargetType.Device),
    );
    registerVSCodeCommand(
        "runIosSimulator",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnIos),
        () => CommandPaletteHandler.runIos(TargetType.Simulator),
    );
    registerVSCodeCommand(
        "runIosDevice",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnIos),
        () => CommandPaletteHandler.runIos(TargetType.Device),
    );
    registerVSCodeCommand(
        "runExponent",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunExponent),
        () => CommandPaletteHandler.runExponent(),
    );
    registerVSCodeCommand(
        "runWindows",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnWindows),
        () => CommandPaletteHandler.runWindows(),
    );
    registerVSCodeCommand(
        "runMacOS",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRunOnMacOS),
        () => CommandPaletteHandler.runMacOS(),
    );
    registerVSCodeCommand(
        "startPackager",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToStartPackager),
        () => CommandPaletteHandler.startPackager(),
    );
    registerVSCodeCommand(
        "stopPackager",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToStopPackager),
        () => CommandPaletteHandler.stopPackager(),
    );
    registerVSCodeCommand(
        "restartPackager",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToRestartPackager),
        () => CommandPaletteHandler.restartPackager(),
    );
    registerVSCodeCommand(
        "publishToExpHost",
        ErrorHelper.getInternalError(InternalErrorCode.FailedToPublishToExpHost),
        () => CommandPaletteHandler.publishToExpHost(),
    );
    registerVSCodeCommand(
        "startLogCatMonitor",
        ErrorHelper.getInternalError(InternalErrorCode.AndroidCouldNotStartLogCatMonitor),
        () => CommandPaletteHandler.startLogCatMonitor(),
    );
    registerVSCodeCommand(
        "stopLogCatMonitor",
        ErrorHelper.getInternalError(InternalErrorCode.AndroidCouldNotStopLogCatMonitor),
        () => CommandPaletteHandler.stopLogCatMonitor(),
    );
    registerVSCodeCommand(
        "startNetworkInspector",
        ErrorHelper.getInternalError(InternalErrorCode.CouldNotStartNetworkInspector),
        () => CommandPaletteHandler.startNetworkInspector(),
    );
    registerVSCodeCommand(
        "stopNetworkInspector",
        ErrorHelper.getInternalError(InternalErrorCode.CouldNotStopNetworkInspector),
        () => CommandPaletteHandler.stopNetworkInspector(),
    );
    registerVSCodeCommand(
        "showDevMenu",
        ErrorHelper.getInternalError(
            InternalErrorCode.CommandFailed,
            localize("ReactNativeShowDevMenu", "React Native: Show Developer Menu for app"),
        ),
        () => CommandPaletteHandler.showDevMenu(),
    );
    registerVSCodeCommand(
        "reloadApp",
        ErrorHelper.getInternalError(
            InternalErrorCode.CommandFailed,
            localize("ReactNativeReloadApp", "React Native: Reload App"),
        ),
        () => CommandPaletteHandler.reloadApp(),
    );
    registerVSCodeCommand(
        "runInspector",
        ErrorHelper.getInternalError(
            InternalErrorCode.CommandFailed,
            localize("ReactNativeRunElementInspector", "React Native: Run Element Inspector"),
        ),
        () => CommandPaletteHandler.runElementInspector(),
    );
}

function registerReactNativeSpecialCommands(): void {
    registerVSCodeCommand(
        "debugScenario.attachHermesApplicationExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.ATTACH_TO_HERMES_APPLICATION_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.ATTACH_TO_HERMES_APPLICATION_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.attachDirectIosExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.ATTACH_TO_DIRECT_IOS_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.ATTACH_TO_DIRECT_IOS_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.attachToPackager",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.ATTACH_TO_PACKAGER,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.ATTACH_TO_PACKAGER,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugAndroid",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_ANDROID,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.DEBUG_ANDROID),
    );
    registerVSCodeCommand(
        "debugScenario.debugIos",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_IOS,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.DEBUG_IOS),
    );
    registerVSCodeCommand(
        "debugScenario.debugWindows",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_WINDOWS,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.DEBUG_WINDOWS),
    );
    registerVSCodeCommand(
        "debugScenario.debugMacos",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_MACOS,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.DEBUG_MACOS),
    );
    registerVSCodeCommand(
        "debugScenario.debugInExponent",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_IN_EXPONENT,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_IN_EXPONENT,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugAndroidHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_ANDROID_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_ANDROID_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugDirectIosExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_DIRECT_IOS_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_DIRECT_IOS_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugIosHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_IOS_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_IOS_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugMacosHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_MACOS_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_MACOS_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.debugWindowsHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.DEBUG_WINDOWS_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.DEBUG_WINDOWS_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.runAndroid",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.RUN_ANDROID,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.RUN_ANDROID),
    );
    registerVSCodeCommand(
        "debugScenario.runIos",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.RUN_IOS,
        ),
        () => CommandPaletteHandler.startDebuggingScenario(DEBUG_CONFIGURATION_NAMES.RUN_IOS),
    );
    registerVSCodeCommand(
        "debugScenario.runAndroidHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.RUN_ANDROID_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.RUN_ANDROID_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.runIosHermesExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.RUN_IOS_HERMES_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.RUN_IOS_HERMES_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "debugScenario.runDirectIosExperimental",
        ErrorHelper.getInternalError(
            InternalErrorCode.DebuggingCommandFailed,
            DEBUG_CONFIGURATION_NAMES.RUN_DIRECT_IOS_EXPERIMENTAL,
        ),
        () =>
            CommandPaletteHandler.startDebuggingScenario(
                DEBUG_CONFIGURATION_NAMES.RUN_DIRECT_IOS_EXPERIMENTAL,
            ),
    );
    registerVSCodeCommand(
        "selectAndInsertDebugConfiguration",
        ErrorHelper.getInternalError(InternalErrorCode.CommandFailed),
        (commandArgs: any[]) => {
            if (!debugConfigProvider || commandArgs.length < 3) {
                throw ErrorHelper.getInternalError(InternalErrorCode.CommandFailed);
            }
            return CommandPaletteHandler.selectAndInsertDebugConfiguration(
                debugConfigProvider,
                commandArgs[0], // document
                commandArgs[1], // position
                commandArgs[2], // token
            );
        },
    );
}

function showTwoVersionFoundNotification(): boolean {
    if (vscode.extensions.getExtension("msjsdiag.vscode-react-native")) {
        vscode.window.showInformationMessage(
            localize(
                "RNTTwoVersionsFound",
                "React Native Tools: Both Stable and Preview extensions are installed. Stable will be used. Disable or remove it to work with Preview version.",
            ),
        );
        return true;
    }
    return false;
}

function isUpdatedVersion(currentVersion: string): boolean {
    if (
        !ExtensionConfigManager.config.has("version") ||
        ExtensionConfigManager.config.get("version") !== currentVersion
    ) {
        ExtensionConfigManager.config.set("version", currentVersion);
        return true;
    }
    return false;
}

function showChangelogNotificationOnUpdate(currentVersion: string) {
    const changelogFile = findFileInFolderHierarchy(__dirname, "CHANGELOG.md");
    if (changelogFile) {
        vscode.window
            .showInformationMessage(
                localize(
                    "RNTHaveBeenUpdatedToVersion",
                    "React Native Tools have been updated to {0}",
                    currentVersion,
                ),
                localize("MoreDetails", "More details"),
            )
            .then(() => {
                vscode.commands.executeCommand(
                    "markdown.showPreview",
                    vscode.Uri.file(changelogFile),
                );
            });
    }
}

function registerVSCodeCommand(
    commandName: string,
    error: InternalError,
    commandHandler: (commandArgs: any[]) => Promise<void>,
): void {
    EXTENSION_CONTEXT.subscriptions.push(
        vscode.commands.registerCommand(`reactNative.${commandName}`, (...args: any[]) => {
            const extProps = {
                platform: {
                    value: CommandPaletteHandler.getPlatformByCommandName(commandName),
                    isPii: false,
                },
            };
            outputChannelLogger.debug(`Run command: ${commandName}`);
            return entryPointHandler.runFunctionWExtProps(
                `commandPalette.${commandName}`,
                extProps,
                error,
                commandHandler.bind(null, args),
            );
        }),
    );
}
