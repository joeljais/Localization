const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(__dirname, "localization-console-test.js"),
    "utf8"
);

function createGame({
    english,
    german,
    loadableDictionaries = {},
    failedLanguageLoads = [],
    autoClosePopups = true
} = {}) {
    const output = [];
    const popups = [];
    const intervals = new Set();
    let pendingClose;
    let runtime;
    const dictionaries = {};
    if (english) dictionaries.English = english;
    if (german) dictionaries.German = german;

    class MockElement {
        constructor(tagName = "div") {
            this.tagName = tagName.toUpperCase();
            this.children = [];
            this.attributes = {};
            this.listeners = {};
            this.style = {};
            this.dataset = {};
            this.hidden = false;
            this.disabled = false;
            this.value = "";
            this.textContent = "";
            this.isConnected = false;
        }
        appendChild(child) {
            child.parentNode = this;
            child.isConnected = this.isConnected;
            this.children.push(child);
            return child;
        }
        replaceChildren(...children) {
            this.children = [];
            for (const child of children) this.appendChild(child);
        }
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }
        addEventListener(name, callback) {
            (this.listeners[name] ||= []).push(callback);
        }
        click() {
            for (const callback of this.listeners.click || []) callback({ target: this });
        }
        remove() {
            this.isConnected = false;
            if (this.parentNode) {
                this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            }
        }
        get options() {
            return this.children;
        }
    }

    const makeDocument = () => {
        const head = new MockElement("head");
        const body = new MockElement("body");
        body.isConnected = true;
        const appendHeadChild = head.appendChild.bind(head);
        const appendBodyChild = body.appendChild.bind(body);
        body.appendChild = child => {
            child.isConnected = true;
            return appendBodyChild(child);
        };
        return {
            head,
            body,
            open() {},
            write() {},
            close() {},
            createElement(tagName) {
                return new MockElement(tagName);
            },
            getElementById(id) {
                return [...body.children, ...head.children].find(element => element.id === id) || null;
            },
            appendHeadChild
        };
    };
    const gameDocument = makeDocument();
    let childWindow;
    const sandbox = {
        languageData: dictionaries,
        LOCALIZATION_TEST_LANGUAGE: undefined,
        MyApp: {
            libs: {
                Localization: {
                    availableLanguages: {
                        en: { name: "English", displayName: "English", code: "en" },
                        de: { name: "German", displayName: "Deutsch", code: "de" }
                    },
                    language: "de",
                    _data_index: { previous: "dictionary" }
                }
            }
        },
        $$: {
            formatStr(text, values) {
                return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
                    Object.prototype.hasOwnProperty.call(values, name)
                        ? String(values[name])
                        : match
                );
            },
            alert(title, message, close) {
                popups.push({ title, message });
                if (autoClosePopups) close();
                else pendingClose = close;
            }
        },
        Ext: {
            Msg: {
                hide() {
                    pendingClose?.();
                }
            }
        },
        console: {
            log: (...args) => output.push(["log", ...args]),
            info: (...args) => output.push(["info", ...args]),
            warn: (...args) => output.push(["warn", ...args]),
            error: (...args) => output.push(["error", ...args]),
            table: (...args) => output.push(["table", ...args])
        },
        setTimeout,
        clearTimeout,
        setInterval(callback) {
            const handle = { callback };
            intervals.add(handle);
            return handle;
        },
        clearInterval(handle) {
            intervals.delete(handle);
        },
        URL: class TestURL extends URL {},
        Blob: undefined,
        document: Object.assign(gameDocument, {
            head: Object.assign(gameDocument.head, {
                appendChild(script) {
                    if (script.tagName === "STYLE") return gameDocument.appendHeadChild(script);
                    const match = /lang_([^/]+)\.js/.exec(script.src);
                    const languageName = match ? decodeURIComponent(match[1]) : "";
                    queueMicrotask(() => {
                        if (failedLanguageLoads.includes(languageName)) {
                            script.onerror?.();
                        } else if (loadableDictionaries[languageName]) {
                            runtime.languageData[languageName] = loadableDictionaries[languageName];
                            script.onload?.();
                        } else {
                            script.onerror?.();
                        }
                    });
                }
            }),
        }),
        location: { href: "https://game.example/app/" }
    };
    runtime = sandbox;
    sandbox.open = () => {
        if (childWindow && !childWindow.closed) return childWindow;
        const listeners = {};
        childWindow = {
            document: makeDocument(),
            closed: false,
            focus() {},
            close() {
                this.closed = true;
                for (const callback of listeners.beforeunload || []) callback();
                for (const callback of listeners.pagehide || []) callback();
            },
            addEventListener(name, callback) {
                (listeners[name] ||= []).push(callback);
            }
        };
        return childWindow;
    };
    sandbox.window = sandbox;
    sandbox.URL.createObjectURL = undefined;
    sandbox.URL.revokeObjectURL = undefined;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);

    return {
        window: sandbox,
        popups,
        output,
        intervals,
        get childWindow() { return childWindow; },
        get pendingClose() { return pendingClose; }
    };
}

function sampleDictionaries() {
    return {
        english: {
            "General/Hello": "Hello {name}",
            "General/Blank": "Fallback {count}",
            "General/Missing": "Missing {name}",
            "General/Shared": "Shared",
            "Mission/Run": "Run {name}"
        },
        german: {
            "General/Hello": "Hallo {name}",
            "General/Blank": "",
            "General/Shared": "Shared",
            "Mission/Run": "Lauf {player}",
            "Mission/Extra": "Extra"
        }
    };
}

test("audits baseline coverage, empty/unchanged text, placeholder contracts, and extra keys", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german });
    const report = await game.window.runLocalizationChecks("de", { quiet: true });

    assert.equal(report.ready, true);
    assert.equal(report.language, "German");
    assert.equal(report.hasEnglishBaseline, true);
    assert.deepEqual(Array.from(report.missingKeys), ["General/Missing"]);
    assert.deepEqual(Array.from(report.extraKeys), ["Mission/Extra"]);
    assert.deepEqual(
        Array.from(report.emptyTranslations, item => item.key),
        ["General/Blank"]
    );
    assert.deepEqual(
        Array.from(report.unchangedTranslations, item => item.key),
        ["General/Shared"]
    );
    assert.deepEqual(
        Array.from(report.placeholderMismatches, item => item.key),
        ["Mission/Run"]
    );
    assert.equal(report.failed, 4);
    assert.equal(report.warningCount, 1);
    assert.equal(report.auditStatus, "fail");
    assert.equal(report.warnings[0].key, "General/Shared");
    assert.equal(report.totalKeys, 6);
    assert.ok(report.nonTranslatedKeys.includes("General/Missing"));
    assert.ok(report.nonTranslatedKeys.includes("General/Blank"));
    assert.ok(report.nonTranslatedKeys.includes("General/Shared"));
});

test("lists baseline and locale folder coverage and selects folders case-insensitively", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german });
    const listing = await game.window.listLocalizationPopupFolders();

    assert.deepEqual(
        Array.from(listing.folders, item => item.folder),
        ["General", "Mission"]
    );
    const general = listing.folders.find(item => item.folder === "General");
    assert.equal(general.count, 4);
    assert.equal(general.missing, 1);
    assert.equal(general.empty, 1);
    assert.equal(general.unchanged, 1);
    assert.match(general.reviewCommand, /showLocalizationFolderPopups\("General"\)/);

    const run = await game.window.showLocalizationFolderPopups("general");
    assert.deepEqual(Array.from(run.reviewed), [
        "General/Hello",
        "General/Blank",
        "General/Missing",
        "General/Shared"
    ]);
    assert.equal(game.popups.length, 4);
    assert.match(game.popups.find(item => item.title.includes("General/Blank")).title, /\[EMPTY\]/);
    assert.match(game.popups.find(item => item.title.includes("General/Blank")).message, /Fallback 12/);
    assert.match(game.popups.find(item => item.title.includes("General/Missing")).title, /\[MISSING\]/);
    assert.equal(game.window.MyApp.libs.Localization.language, "de");
    assert.deepEqual(
        game.window.MyApp.libs.Localization._data_index,
        { previous: "dictionary" }
    );
});

test("supports explicit manual verdicts and exports a combined QA report", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german });
    await game.window.startLocalizationQA("German");
    game.window.setLocalizationQAResult("General/Hello", "pass", "Fits the UI.");
    game.window.setLocalizationQAResult("Mission/Run", "fail", "Placeholder is incorrect.");
    const report = game.window.getLocalizationQAReport();

    assert.equal(game.window.LOCALIZATION_TEST_LANGUAGE, "German");
    assert.equal(report.manualQA.reviewed, 2);
    assert.equal(report.manualQA.pending, 4);
    assert.equal(report.manualQA.statusCounts.pass, 1);
    assert.equal(report.manualQA.statusCounts.fail, 1);
    assert.equal(report.manualQA.results.find(item => item.key === "General/Hello").note, "Fits the UI.");

    const exported = game.window.downloadLocalizationQAReport();
    assert.equal(typeof exported, "string");
    const parsed = JSON.parse(exported);
    assert.equal(parsed.automatedAudit.language, "German");
    assert.equal(parsed.manualQA.statusCounts.fail, 1);
});

test("rejects unsupported languages and invalid manual verdicts with actionable errors", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german });

    const unsupported = await game.window.runLocalizationChecks("French", { quiet: true });
    assert.equal(unsupported.ready, false);
    assert.match(unsupported.error, /English.*German/);
    assert.throws(
        () => game.window.setLocalizationQAResult("General/Hello", "unknown"),
        /Status must be one of/
    );
    assert.throws(
        () => game.window.setLocalizationReviewLanguage("French"),
        /Available: English, German/
    );
});

test("stops an active popup review and restores the game's prior localization state", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german, autoClosePopups: false });
    const originalData = game.window.MyApp.libs.Localization._data_index;
    const reviewPromise = game.window.showLocalizationFolderPopups("General");

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(game.window.__localizationPopupRun.active, true);
    assert.equal(typeof game.pendingClose, "function");
    game.window.setLocalizationQAResult("blocked", "Needs device-width check.");
    assert.equal(game.window.stopLocalizationPopupReview(), true);
    const run = await reviewPromise;

    assert.equal(run.stopped, true);
    assert.equal(run.reviewed.length, 0);
    assert.equal(game.window.MyApp.libs.Localization.language, "de");
    assert.equal(game.window.MyApp.libs.Localization._data_index, originalData);
    assert.equal("stopLocalizationPopupReview" in game.window, false);
    const report = game.window.getLocalizationQAReport();
    assert.equal(report.manualQA.statusCounts.blocked, 1);
    assert.equal(report.manualQA.results[0].note, "Needs device-width check.");
});

test("does not claim baseline comparisons when English is not loaded", async () => {
    const game = createGame({
        german: { "General/Hello": "Hallo" },
        failedLanguageLoads: ["English"]
    });
    const report = await game.window.runLocalizationChecks("German", { quiet: true });

    assert.equal(report.ready, true);
    assert.equal(report.hasEnglishBaseline, false);
    assert.equal(report.auditStatus, "incomplete");
    assert.match(report.baselineWarning, /Could not load English baseline/);
    assert.equal(report.missingKeys.length, 0);
    assert.equal(report.extraKeys.length, 0);
    assert.equal(report.totalKeys, 1);
});

test("loads supported English baseline automatically before auditing another language", async () => {
    const game = createGame({
        german: {
            "General/Translated": "Übersetzt",
            "General/Blank": "",
            "General/Missing": "Missing"
        },
        loadableDictionaries: {
            English: {
                "General/Translated": "Translated",
                "General/Blank": "Fallback",
                "General/Missing": "Missing",
                "General/Absent": "Absent"
            }
        }
    });
    const report = await game.window.runLocalizationChecks("German", { quiet: true });

    assert.equal(report.hasEnglishBaseline, true);
    assert.equal(report.baselineLanguage, "English");
    assert.equal(game.window.languageData.English["General/Blank"], "Fallback");
    assert.deepEqual(Array.from(report.missingKeys), ["General/Absent"]);
    assert.deepEqual(
        Array.from(report.emptyTranslations, item => item.key),
        ["General/Blank"]
    );
    assert.equal(report.auditStatus, "fail");
});

test("flags empty values for review instead of passing when the English baseline cannot load", async () => {
    const game = createGame({
        german: { "General/Blank": "" },
        failedLanguageLoads: ["English"]
    });
    const report = await game.window.runLocalizationChecks("German", { quiet: true });

    assert.equal(report.hasEnglishBaseline, false);
    assert.equal(report.auditStatus, "fail");
    assert.match(report.failures[0].issues[0], /baseline is unavailable/);
});

test("classifies only unchanged strings as manual review, not automated failure", async () => {
    const game = createGame({
        english: { "General/Shared": "Shared" },
        german: { "General/Shared": "Shared" }
    });
    const report = await game.window.runLocalizationChecks("German", { quiet: true });

    assert.equal(report.auditStatus, "review");
    assert.equal(report.failed, 0);
    assert.equal(report.warningCount, 1);
    assert.equal(report.passed, 0);
});

test("provides an in-page QA panel and records popup verdicts from its controls", async () => {
    const { english, german } = sampleDictionaries();
    const game = createGame({ english, german, autoClosePopups: false });
    const panel = game.window.__localizationQAPanel;
    const controls = game.window.__localizationQAPanelControls;

    assert.ok(panel);
    assert.equal(panel.id, "localization-qa-panel");
    assert.equal(controls.languageSelect.value, "German");
    assert.equal(game.intervals.size, 1);

    await controls.auditButton.listeners.click[0]();
    assert.equal(controls.folderSelect.options.length, 2);
    assert.match(controls.status.textContent, /folders ready/);

    controls.folderSelect.value = "General";
    const reviewPromise = controls.folderReviewButton.listeners.click[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(game.window.__localizationPopupRun.currentKey, "General/Hello");
    for (const interval of game.intervals) interval.callback();
    assert.equal(controls.verdictButtons.pass.disabled, false);
    controls.note.value = "Readable and fits the screen.";
    await controls.verdictButtons.pass.listeners.click[0]();
    assert.equal(
        game.window.__localizationQAResults.German.manual["General/Hello"].note,
        "Readable and fits the screen."
    );

    controls.stopButton.click();
    await reviewPromise;
    assert.match(controls.status.textContent, /Stopped/);
    controls.hideButton.click();
    assert.equal(game.intervals.size, 0);
    assert.equal(game.window.__localizationQAPanel, undefined);
    assert.ok(game.window.__localizationQALauncher.isConnected);
    game.window.__localizationQALauncher.click();
    assert.ok(game.window.__localizationQAPanel.isConnected);
    assert.equal(game.intervals.size, 1);
    game.window.closeLocalizationQAPanel();
    assert.equal(game.intervals.size, 0);
});
