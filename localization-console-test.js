(function installLocalizationQA() {
    "use strict";

    const SAMPLE_VALUES = {
        count: 12,
        name: "TestUser",
        crew_label: " +3 MERCS"
    };
    const REVIEW_STATUSES = new Set(["pass", "fail", "blocked", "needs-review"]);
    const languageLoads = new Map();

    function getLocalization() {
        const localization = window.MyApp?.libs?.Localization;
        if (!localization) {
            throw new Error("MyApp.libs.Localization is unavailable. Open the game and wait for it to load.");
        }
        return localization;
    }

    function getAvailableLanguages() {
        const available = getLocalization().availableLanguages;
        return available && typeof available === "object"
            ? Object.values(available).filter(language => language && typeof language.name === "string")
            : [];
    }

    function findLanguageInfo(languages, requestedLanguage) {
        const requested = requestedLanguage.trim().toLowerCase();
        return languages.find(language =>
            [language.name, language.displayName, language.code]
                .some(value => typeof value === "string" && value.trim().toLowerCase() === requested)
        );
    }

    function getDefaultLocalizationLanguage() {
        if (typeof window.LOCALIZATION_TEST_LANGUAGE === "string" &&
            window.LOCALIZATION_TEST_LANGUAGE.trim()) {
            return window.LOCALIZATION_TEST_LANGUAGE.trim();
        }

        const localization = window.MyApp?.libs?.Localization;
        const languages = Object.values(localization?.availableLanguages || {})
            .filter(language => language && typeof language.name === "string");
        const current = typeof localization?.language === "string" ? localization.language : "";
        const currentInfo = findLanguageInfo(languages, current);
        if (currentInfo) return currentInfo.name;

        const loadedDictionaries = Object.keys(window.languageData || {});
        const loadedCurrent = loadedDictionaries.find(name => name.toLowerCase() === current.toLowerCase());
        return loadedCurrent || languages[0]?.name || loadedDictionaries[0] || "";
    }

    async function loadLanguage(requestedLanguage) {
        if (typeof requestedLanguage !== "string" || !requestedLanguage.trim()) {
            throw new Error("Choose a language first. Run window.listLocalizationLanguages() to see available languages.");
        }

        const requested = requestedLanguage.trim();
        const languages = getAvailableLanguages();
        const languageInfo = findLanguageInfo(languages, requested);
        if (languages.length > 0 && !languageInfo) {
            throw new Error(
                `Unsupported language "${requested}". Available: ` +
                languages.map(language => `${language.name}${language.code ? ` (${language.code})` : ""}`).join(", ")
            );
        }

        let languageName = languageInfo?.name || requested;
        const loadedNames = Object.keys(window.languageData || {});
        if (!languageInfo && loadedNames.length > 0) {
            const loadedName = loadedNames.find(name => name.toLowerCase() === requested.toLowerCase());
            if (loadedName) languageName = loadedName;
        }

        if (!window.languageData?.[languageName]) {
            let loading = languageLoads.get(languageName);
            if (!loading) {
                const script = document.createElement("script");
                script.src = new URL(
                    `app/resources/languages/lang_${encodeURIComponent(languageName)}.js`,
                    location.href
                ).href;
                loading = new Promise((resolve, reject) => {
                    const timeout = window.setTimeout(() => {
                        script.remove();
                        reject(new Error(`Timed out loading ${languageName} localization script: ${script.src}`));
                    }, 15000);
                    script.onload = () => {
                        window.clearTimeout(timeout);
                        resolve();
                    };
                    script.onerror = () => {
                        window.clearTimeout(timeout);
                        reject(new Error(`Failed to load ${languageName} localization script: ${script.src}`));
                    };
                    document.head.appendChild(script);
                });
                languageLoads.set(languageName, loading);
            }
            try {
                await loading;
            } finally {
                languageLoads.delete(languageName);
            }
        }

        const strings = window.languageData?.[languageName];
        if (!strings || typeof strings !== "object" || Array.isArray(strings)) {
            throw new Error(`Localization dictionary for "${languageName}" was not loaded as an object.`);
        }
        return { languageName, strings };
    }

    function getKeyFolder(key) {
        const separator = key.indexOf("/");
        return separator < 0 ? "(root)" : key.slice(0, separator) || "(root)";
    }

    function getPlaceholders(text) {
        return [...new Set(
            Array.from(text.matchAll(/\{([A-Za-z0-9_]+)\}/g), match => match[1])
        )].sort();
    }

    function formatText(text, names) {
        const replacements = Object.fromEntries(
            names.map(name => [
                name,
                Object.prototype.hasOwnProperty.call(SAMPLE_VALUES, name)
                    ? SAMPLE_VALUES[name]
                    : `[TEST_${name}]`
            ])
        );
        return window.$$.formatStr(text, replacements);
    }

    function buildAudit(languageName, strings, baselineLanguage, baselineWarning) {
        const english = baselineLanguage ? window.languageData?.[baselineLanguage] : null;
        const hasBaseline = !!english && typeof english === "object" && !Array.isArray(english);
        const isEnglishTarget = languageName.toLowerCase() === baselineLanguage?.toLowerCase();
        const keys = [...new Set([
            ...(hasBaseline ? Object.keys(english) : []),
            ...Object.keys(strings)
        ])].sort();
        const failures = [];
        const warnings = [];
        const missingKeys = [];
        const extraKeys = [];
        const emptyTranslations = [];
        const unchangedTranslations = [];
        const placeholderMismatches = [];
        const formatterFailures = [];
        let placeholderKeys = 0;

        for (const key of keys) {
            const issues = [];
            const hasLocaleKey = Object.prototype.hasOwnProperty.call(strings, key);
            const hasEnglishKey = hasBaseline && Object.prototype.hasOwnProperty.call(english, key);
            const localeText = strings[key];
            const englishText = hasEnglishKey ? english[key] : undefined;

            if (!hasLocaleKey) {
                missingKeys.push(key);
                issues.push("Missing locale key; the game may fall back to English.");
            }
            if (hasLocaleKey && !hasEnglishKey && hasBaseline) {
                extraKeys.push(key);
                issues.push("Key is not present in the English baseline.");
            }
            if (!hasLocaleKey) {
                failures.push({ key, issues });
                continue;
            }
            if (typeof localeText !== "string") {
                issues.push(`Expected a string, got ${typeof localeText}.`);
                failures.push({ key, issues });
                continue;
            }

            const isEmpty = localeText.trim() === "";
            const isEnglishEmpty = typeof englishText === "string" && englishText.trim() === "";
            if (isEmpty) {
                const record = { key, englishIsEmpty: isEnglishEmpty };
                emptyTranslations.push(record);
                if (hasEnglishKey && !isEnglishEmpty) {
                    issues.push("Translation is empty; the game may fall back to English.");
                } else if (!hasBaseline && !isEnglishTarget) {
                    issues.push("Translation is empty; English baseline is unavailable, so verify whether this is intentional.");
                }
            } else if (typeof englishText === "string" &&
                englishText.trim() !== "" &&
                localeText.trim() === englishText.trim()) {
                unchangedTranslations.push({ key, text: localeText });
                if (!isEnglishTarget) {
                    warnings.push({
                        key,
                        issue: `${languageName} text is identical to the English baseline; confirm this is intentional.`
                    });
                }
            }

            const effectiveText = isEmpty && typeof englishText === "string" ? englishText : localeText;
            const localePlaceholders = getPlaceholders(localeText);
            const expectedPlaceholders = typeof englishText === "string"
                ? getPlaceholders(englishText)
                : localePlaceholders;
            if (expectedPlaceholders.length > 0) placeholderKeys++;

            if (!isEmpty &&
                typeof englishText === "string" &&
                JSON.stringify(localePlaceholders) !== JSON.stringify(expectedPlaceholders)) {
                const mismatch = {
                    key,
                    expected: expectedPlaceholders,
                    found: localePlaceholders,
                    english: englishText,
                    translation: localeText
                };
                placeholderMismatches.push(mismatch);
                issues.push(
                    `Placeholder mismatch: expected {${expectedPlaceholders.join("}, {")}}, ` +
                    `found {${localePlaceholders.join("}, {")}}.`
                );
            }

            try {
                const rendered = formatText(effectiveText, getPlaceholders(effectiveText));
                if (typeof rendered !== "string") {
                    const failure = { key, issue: `Formatter returned ${typeof rendered}, not a string.` };
                    formatterFailures.push(failure);
                    issues.push(failure.issue);
                } else {
                    const unresolved = [...new Set(rendered.match(/\{[A-Za-z0-9_]+\}/g) || [])];
                    if (unresolved.length > 0) {
                        const failure = { key, issue: `Unresolved placeholders: ${unresolved.join(", ")}.` };
                        formatterFailures.push(failure);
                        issues.push(failure.issue);
                    }
                }
            } catch (error) {
                const issue = `Formatter threw: ${error?.message || String(error)}.`;
                formatterFailures.push({ key, issue });
                issues.push(issue);
            }

            if (issues.length > 0) failures.push({ key, issues, text: localeText });
        }

        const failedKeys = [...new Set(failures.map(failure => failure.key))];
        const warningKeys = [...new Set(warnings.map(warning => warning.key))];
        return {
            ready: true,
            auditStatus: failedKeys.length > 0
                ? "fail"
                : warningKeys.length > 0
                    ? "review"
                : hasBaseline || isEnglishTarget
                    ? "pass"
                    : "incomplete",
            language: languageName,
            baselineLanguage: hasBaseline ? baselineLanguage : null,
            hasEnglishBaseline: hasBaseline,
            baselineWarning,
            totalKeys: keys.length,
            localeKeys: Object.keys(strings).length,
            passed: Math.max(0, keys.length - failedKeys.length - warningKeys.length),
            failed: failedKeys.length,
            warningCount: warningKeys.length,
            warnings,
            failedKeys,
            missingKeys,
            extraKeys,
            emptyTranslations,
            unchangedTranslations,
            nonTranslatedKeys: [
                ...missingKeys,
                ...unchangedTranslations
                    .filter(() => !isEnglishTarget)
                    .map(item => item.key),
                ...emptyTranslations
                    .filter(item => !item.englishIsEmpty)
                    .map(item => item.key)
            ].filter((key, index, all) => all.indexOf(key) === index),
            placeholderKeys,
            placeholderMismatches,
            formatterFailures,
            failures,
            createdAt: new Date().toISOString()
        };
    }

    function printAudit(report) {
        const status = report.auditStatus === "fail"
            ? "FAIL"
            : report.auditStatus === "incomplete"
                ? "INCOMPLETE"
                : report.auditStatus === "review"
                    ? "REVIEW"
                : "PASS";
        console.log(
            `[Localization QA] ${status} — ${report.language}: ` +
            `${report.passed}/${report.totalKeys} keys clear, ${report.failed} failures, ` +
            `${report.warningCount} items for manual review; ` +
            `${report.missingKeys.length} missing, ${report.extraKeys.length} extra, ` +
            `${report.emptyTranslations.length} empty, ${report.unchangedTranslations.length} unchanged, ` +
            `${report.placeholderMismatches.length} placeholder mismatches, ` +
            `${report.formatterFailures.length} formatter failures.`
        );
        if (report.baselineWarning) {
            console.warn(`[Localization QA] ${report.baselineWarning}`);
        }
        if (!report.hasEnglishBaseline) {
            console.warn("[Localization QA] English baseline unavailable; missing/extra/unchanged checks are limited.");
        }
        if (report.failures.length > 0) {
            console.table(report.failures.slice(0, 50).map(failure => ({
                key: failure.key,
                issues: failure.issues.join(" | ")
            })));
            if (report.failures.length > 50) {
                console.warn(`[Localization QA] ${report.failures.length - 50} more issue rows omitted from the table.`);
            }
        }
        if (report.warnings.length > 0) {
            console.log("[Localization QA] Advisory items — confirm whether unchanged wording is intentional:");
            console.table(report.warnings.slice(0, 50));
            if (report.warnings.length > 50) {
                console.warn(`[Localization QA] ${report.warnings.length - 50} more advisory rows omitted from the table.`);
            }
        }
        return report;
    }

    function saveLatestAudit(report, strings) {
        window.__localizationTestReport = report;
        window.__localizationQAResults ||= {};
        const existing = window.__localizationQAResults[report.language];
        const english = report.hasEnglishBaseline
            ? window.languageData[report.baselineLanguage]
            : null;
        const knownKeys = new Set([
            ...(english ? Object.keys(english) : []),
            ...Object.keys(strings)
        ]);
        window.__localizationQAResults[report.language] = {
            language: report.language,
            audit: report,
            knownKeys: [...knownKeys],
            manual: Object.fromEntries(
                Object.entries(existing?.manual || {})
                    .filter(([key]) => knownKeys.has(key))
            )
        };
    }

    function requireCurrentAudit(languageName) {
        const record = window.__localizationQAResults?.[languageName];
        if (!record) {
            throw new Error(`No QA audit is loaded for ${languageName}. Run window.runLocalizationChecks() first.`);
        }
        return record;
    }

    window.runLocalizationChecks = async function runLocalizationChecks(
        requestedLanguage = getDefaultLocalizationLanguage(),
        options = {}
    ) {
        try {
            if (typeof window.$$?.formatStr !== "function") {
                throw new Error("The game formatter is unavailable: $$.formatStr is not a function.");
            }
            const { languageName, strings } = await loadLanguage(requestedLanguage);
            let baselineLanguage = languageName.toLowerCase() === "english"
                ? languageName
                : null;
            let baselineWarning = null;
            if (!baselineLanguage) {
                const englishInfo = getAvailableLanguages().find(language =>
                    language.name.toLowerCase() === "english" ||
                    language.displayName?.toLowerCase() === "english" ||
                    language.code?.toLowerCase() === "en"
                );
                baselineLanguage = englishInfo?.name || "English";
                try {
                    await loadLanguage(baselineLanguage);
                } catch (error) {
                    baselineWarning = `Could not load English baseline: ${error?.message || String(error)}`;
                    baselineLanguage = null;
                }
            }
            const report = buildAudit(languageName, strings, baselineLanguage, baselineWarning);
            saveLatestAudit(report, strings);
            return options.quiet ? report : printAudit(report);
        } catch (error) {
            const report = {
                ready: false,
                error: error?.message || String(error),
                language: requestedLanguage,
                createdAt: new Date().toISOString()
            };
            window.__localizationTestReport = report;
            if (!options.quiet) console.error("[Localization QA] BLOCKED:", report.error);
            return report;
        }
    };

    window.listLocalizationLanguages = function listLocalizationLanguages() {
        const languages = getAvailableLanguages().map(language => ({
            name: language.name,
            displayName: language.displayName || language.name,
            code: language.code || ""
        }));
        if (languages.length === 0) {
            const dictionaries = Object.keys(window.languageData || {});
            if (dictionaries.length === 0) {
                throw new Error("No available languages found. Check that the game has finished loading.");
            }
            languages.push(...dictionaries.map(name => ({ name, displayName: name, code: "" })));
        }
        console.table(languages);
        return languages;
    };

    window.setLocalizationReviewLanguage = function setLocalizationReviewLanguage(requestedLanguage) {
        if (typeof requestedLanguage !== "string" || !requestedLanguage.trim()) {
            throw new Error("Provide a language name, display name, or language code.");
        }
        const languages = getAvailableLanguages();
        const languageInfo = findLanguageInfo(languages, requestedLanguage);
        if (languages.length > 0 && !languageInfo) {
            throw new Error(
                `Unsupported language "${requestedLanguage}". Available: ` +
                languages.map(language => language.name).join(", ")
            );
        }
        const languageName = languageInfo?.name || requestedLanguage.trim();
        window.LOCALIZATION_TEST_LANGUAGE = languageName;
        console.log(`[Localization QA] Review language set to ${languageName}.`);
        return languageName;
    };

    window.startLocalizationQA = async function startLocalizationQA(
        requestedLanguage = getDefaultLocalizationLanguage()
    ) {
        const report = await window.runLocalizationChecks(requestedLanguage);
        if (!report.ready) return report;
        window.LOCALIZATION_TEST_LANGUAGE = report.language;
        console.log(
            `[Localization QA] Session ready for ${report.language}. ` +
            "Next: await window.listLocalizationPopupFolders(); then paste a folder's reviewCommand."
        );
        console.log(
            "After manually checking a key in its popup, record the verdict with " +
            "window.setLocalizationQAResult(status, note) for the current popup, or " +
            "window.setLocalizationQAResult(\"Exact/Key\", status, note). " +
            "Statuses: pass, fail, blocked, needs-review."
        );
        console.log(
            "At any time: window.getLocalizationQAReport(), " +
            "window.downloadLocalizationQAReport(), or window.stopLocalizationPopupReview()."
        );
        return report;
    };

    window.listLocalizationPopupFolders = async function listLocalizationPopupFolders(
        requestedLanguage = getDefaultLocalizationLanguage()
    ) {
        const report = await window.runLocalizationChecks(requestedLanguage, { quiet: true });
        if (!report.ready) throw new Error(report.error);

        const strings = window.languageData[report.language];
        const english = report.hasEnglishBaseline
            ? window.languageData[report.baselineLanguage]
            : {};
        const keysByFolder = new Map();
        for (const key of report.hasEnglishBaseline
            ? [...new Set([...Object.keys(english), ...Object.keys(strings)])]
            : Object.keys(strings)) {
            const folder = getKeyFolder(key);
            if (!keysByFolder.has(folder)) keysByFolder.set(folder, []);
            keysByFolder.get(folder).push(key);
        }

        const folders = [...keysByFolder.entries()]
            .map(([folder, keys]) => {
                const missing = keys.filter(key => !Object.prototype.hasOwnProperty.call(strings, key));
                const empty = keys.filter(key =>
                    Object.prototype.hasOwnProperty.call(strings, key) &&
                    typeof strings[key] === "string" &&
                    strings[key].trim() === "" &&
                    typeof english[key] === "string" &&
                    english[key].trim() !== ""
                );
                const unchanged = keys.filter(key =>
                    typeof strings[key] === "string" &&
                    typeof english[key] === "string" &&
                    strings[key].trim() !== "" &&
                    strings[key].trim() === english[key].trim() &&
                    report.language.toLowerCase() !== "english"
                );
                return {
                    folder,
                    count: keys.length,
                    missing: missing.length,
                    empty: empty.length,
                    unchanged: unchanged.length,
                    exampleKeys: keys.slice(0, 3),
                    reviewCommand: `await window.showLocalizationFolderPopups(${JSON.stringify(folder)});`,
                    keys
                };
            })
            .sort((first, second) => first.folder.localeCompare(second.folder));

        console.log(`[Localization QA] ${report.language} folders; choose a reviewCommand:`);
        console.table(folders.map(({ folder, count, missing, empty, unchanged, exampleKeys, reviewCommand }) => ({
            folder,
            count,
            missing,
            empty,
            unchanged,
            exampleKeys: exampleKeys.join(", "),
            reviewCommand
        })));
        return { language: report.language, folders, audit: report };
    };

    async function runPopupReview(requestedLanguage, requestedKeys, reviewType) {
        if (window.__localizationPopupRun?.active) {
            throw new Error("A popup review is already running. Stop it before starting another.");
        }
        if (typeof window.$$.alert !== "function" || typeof window.$$.formatStr !== "function") {
            throw new Error("The game's popup or formatter helper is unavailable.");
        }
        const report = await window.runLocalizationChecks(requestedLanguage, { quiet: true });
        if (!report.ready) throw new Error(report.error);

        const localization = getLocalization();
        const strings = window.languageData[report.language];
        const english = report.hasEnglishBaseline
            ? window.languageData[report.baselineLanguage]
            : {};
        const keys = [...new Set(requestedKeys)];
        const knownKeys = new Set([
            ...(report.hasEnglishBaseline ? Object.keys(english) : []),
            ...Object.keys(strings)
        ]);
        const unknown = keys.filter(key => !knownKeys.has(key));
        if (unknown.length > 0) {
            throw new Error(`Unknown ${report.language} localization keys: ${unknown.join(", ")}`);
        }
        if (keys.length === 0) {
            console.info(`[Localization QA] No keys match this ${reviewType} review.`);
            return {
                active: false,
                language: report.language,
                reviewType,
                total: 0,
                current: 0,
                reviewed: [],
                stopped: false
            };
        }

        const previous = {
            language: localization.language,
            data: localization._data_index
        };
        const run = {
            active: true,
            language: report.language,
            reviewType,
            total: keys.length,
            current: 0,
            currentKey: null,
            reviewed: [],
            stopped: false,
            close: null,
            startedAt: new Date().toISOString(),
            completedAt: null
        };
        window.__localizationPopupRun = run;
        localization.language = report.language;
        localization._data_index = strings;
        window.stopLocalizationPopupReview = () => {
            if (!run.active) return false;
            run.stopped = true;
            try {
                if (typeof window.Ext?.Msg?.hide === "function") window.Ext.Msg.hide();
            } finally {
                run.close?.();
            }
            return true;
        };

        try {
            for (const key of keys) {
                if (run.stopped) break;
                const hasLocaleKey = Object.prototype.hasOwnProperty.call(strings, key);
                const localeText = hasLocaleKey ? strings[key] : undefined;
                if (hasLocaleKey && typeof localeText !== "string") {
                    throw new Error(`Localization value for "${key}" is not a string.`);
                }
                const isEmpty = typeof localeText === "string" && localeText.trim() === "";
                const isMissing = !hasLocaleKey;
                const englishText = typeof english[key] === "string" ? english[key] : undefined;
                const previewText = (isEmpty || isMissing) && typeof englishText === "string"
                    ? englishText
                    : localeText || "";
                const rendered = formatText(previewText, getPlaceholders(previewText));
                const markers = [
                    isMissing ? "MISSING" : "",
                    isEmpty ? "EMPTY" : "",
                    !isMissing && !isEmpty &&
                        typeof englishText === "string" &&
                        report.language.toLowerCase() !== "english" &&
                        localeText.trim() === englishText.trim()
                        ? "UNCHANGED" : ""
                ].filter(Boolean);
                const hasEnglishFallback = typeof englishText === "string" && englishText.trim() !== "";
                const title = `${run.current + 1}/${run.total} ${key}` +
                    (markers.length > 0 ? ` [${markers.join(", ")}]` : "");
                const message = markers.length > 0
                    ? `[${markers.join(" / ")}${hasEnglishFallback ? " — English fallback preview" : ""}]\n\n` +
                        (typeof rendered === "string" ? rendered : String(rendered))
                    : typeof rendered === "string"
                        ? rendered
                        : String(rendered);

                run.current++;
                run.currentKey = key;
                console.log(`[Localization QA] ${run.current}/${run.total}: ${key}`);
                await new Promise((resolve, reject) => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        if (!run.stopped) run.reviewed.push(key);
                        run.currentKey = null;
                        run.close = null;
                        resolve();
                    };
                    run.close = finish;
                    try {
                        window.$$.alert(title, message, finish);
                    } catch (error) {
                        run.close = null;
                        reject(error);
                    }
                });
            }
        } finally {
            localization.language = previous.language;
            localization._data_index = previous.data;
            run.active = false;
            run.currentKey = null;
            run.close = null;
            run.completedAt = new Date().toISOString();
            delete window.stopLocalizationPopupReview;
        }

        console.log(
            `[Localization QA] ${run.stopped ? "Stopped" : "Review complete"}: ` +
            `${run.reviewed.length}/${run.total} keys viewed. ` +
            "Popup viewing is not a manual pass; record verdicts with setLocalizationQAResult."
        );
        return run;
    }

    window.showLocalizationKeyPopups = async function showLocalizationKeyPopups(
        requestedLanguage = getDefaultLocalizationLanguage(),
        requestedKeys
    ) {
        const report = await window.runLocalizationChecks(requestedLanguage, { quiet: true });
        if (!report.ready) throw new Error(report.error);
        const strings = window.languageData[report.language];
        const keys = requestedKeys === undefined
            ? [...new Set([
                ...(report.hasEnglishBaseline
                    ? Object.keys(window.languageData[report.baselineLanguage])
                    : []),
                ...Object.keys(strings)
            ])]
            : Array.isArray(requestedKeys)
                ? requestedKeys
                : [requestedKeys];
        if (keys.some(key => typeof key !== "string")) {
            throw new Error("Localization keys must be strings.");
        }
        return runPopupReview(report.language, keys, "selected keys");
    };

    window.showLocalizationFolderPopups = async function showLocalizationFolderPopups(
        requestedLanguageOrFolder = getDefaultLocalizationLanguage(),
        requestedFolder
    ) {
        const language = requestedFolder === undefined
            ? getDefaultLocalizationLanguage()
            : requestedLanguageOrFolder;
        const folder = requestedFolder === undefined ? requestedLanguageOrFolder : requestedFolder;
        if (typeof folder !== "string" || !folder.trim()) {
            throw new Error("Provide a folder name. Run window.listLocalizationPopupFolders() to see folders.");
        }
        const listing = await window.listLocalizationPopupFolders(language);
        const selected = listing.folders.find(option =>
            option.folder.toLowerCase() === folder.trim().toLowerCase()
        );
        if (!selected) {
            throw new Error(
                `Folder "${folder}" was not found for ${listing.language}. ` +
                "Run window.listLocalizationPopupFolders() and use a listed folder."
            );
        }
        return runPopupReview(listing.language, selected.keys, `folder ${selected.folder}`);
    };

    window.showUntranslatedLocalizationPopups = async function showUntranslatedLocalizationPopups(
        requestedLanguage = getDefaultLocalizationLanguage()
    ) {
        const report = await window.runLocalizationChecks(requestedLanguage, { quiet: true });
        if (!report.ready) throw new Error(report.error);
        return runPopupReview(report.language, report.nonTranslatedKeys, "untranslated/missing");
    };

    window.setLocalizationQAResult = function setLocalizationQAResult(key, status, note = "") {
        if (REVIEW_STATUSES.has(key) && typeof status === "string") {
            const run = window.__localizationPopupRun;
            if (!run?.active || !run.currentKey) {
                throw new Error(
                    "No popup is currently open. Use setLocalizationQAResult(\"Exact/Key\", status, note) instead."
                );
            }
            return saveManualQAResult(run.language, run.currentKey, key, status);
        }
        return saveManualQAResult(getDefaultLocalizationLanguage(), key, status, note);
    };

    function saveManualQAResult(language, key, status, note) {
        if (typeof key !== "string" || !key.trim()) throw new Error("Provide the exact localization key.");
        if (!REVIEW_STATUSES.has(status)) {
            throw new Error(`Status must be one of: ${[...REVIEW_STATUSES].join(", ")}.`);
        }
        if (typeof note !== "string") throw new Error("The QA note must be a string.");

        const record = requireCurrentAudit(language);
        if (!record.knownKeys.includes(key)) {
            throw new Error(`Unknown key "${key}" for ${language}. Run a fresh QA audit or check the key spelling.`);
        }
        record.manual[key] = {
            status,
            note: note.trim(),
            updatedAt: new Date().toISOString()
        };
        console.log(`[Localization QA] ${key} marked ${status}${note.trim() ? ` — ${note.trim()}` : ""}`);
        return record.manual[key];
    }

    window.recordCurrentLocalizationQAResult = function recordCurrentLocalizationQAResult(status, note = "") {
        const run = window.__localizationPopupRun;
        if (!run?.active || !run.currentKey) {
            throw new Error("No localization popup is currently open to record a verdict for.");
        }
        return saveManualQAResult(run.language, run.currentKey, status, note);
    };

    window.getLocalizationQAReport = function getLocalizationQAReport(
        requestedLanguage = getDefaultLocalizationLanguage()
    ) {
        const record = requireCurrentAudit(requestedLanguage);
        const manualResults = Object.entries(record.manual).map(([key, result]) => ({ key, ...result }));
        const statusCounts = Object.fromEntries(
            [...REVIEW_STATUSES].map(status => [
                status,
                manualResults.filter(result => result.status === status).length
            ])
        );
        const report = {
            language: record.language,
            generatedAt: new Date().toISOString(),
            automatedAudit: record.audit,
            manualQA: {
                totalKeys: record.knownKeys.length,
                reviewed: manualResults.length,
                pending: Math.max(0, record.knownKeys.length - manualResults.length),
                statusCounts,
                results: manualResults
            }
        };
        console.table([{
            language: report.language,
            automatedFailures: report.automatedAudit.failed,
            manuallyReviewed: report.manualQA.reviewed,
            pending: report.manualQA.pending,
            passed: statusCounts.pass,
            failed: statusCounts.fail,
            blocked: statusCounts.blocked,
            needsReview: statusCounts["needs-review"]
        }]);
        return report;
    };

    window.downloadLocalizationQAReport = function downloadLocalizationQAReport(
        requestedLanguage = getDefaultLocalizationLanguage()
    ) {
        const report = window.getLocalizationQAReport(requestedLanguage);
        const json = JSON.stringify(report, null, 2);
        if (typeof Blob !== "function" || !window.URL?.createObjectURL) {
            console.log("[Localization QA] Download is unavailable in this browser. Copy this JSON report:");
            console.log(json);
            return json;
        }

        const blob = new Blob([json], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `localization-qa-${report.language}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        console.log(`[Localization QA] Report download started: ${link.download}`);
        return report;
    };

    let qaPanel = null;
    let qaPanelTimer = null;
    let qaPanelWindow = null;
    let qaPanelDocument = null;
    let qaLauncher = null;

    function createPanelElement(tag, text, parent) {
        const ownerDocument = qaPanelDocument || document;
        const element = ownerDocument.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (parent) parent.appendChild(element);
        return element;
    }

    function cleanupQAPanelWindow() {
        if (qaPanelTimer) window.clearInterval(qaPanelTimer);
        qaPanelTimer = null;
        qaPanel = null;
        qaPanelWindow = null;
        qaPanelDocument = null;
        delete window.__localizationQAPanel;
        delete window.__localizationQAPanelWindow;
        delete window.__localizationQAPanelControls;
    }

    function installQALauncher() {
        if (!document.body) {
            throw new Error("The game page is not ready yet. Try opening the QA panel again.");
        }
        if (qaLauncher?.isConnected) return qaLauncher;

        const launcher = document.createElement("button");
        launcher.id = "localization-qa-launcher";
        launcher.type = "button";
        launcher.textContent = "Open Localization QA";
        launcher.setAttribute("aria-label", "Open Localization QA in a separate window");
        launcher.style.cssText = [
            "position:fixed",
            "right:16px",
            "bottom:16px",
            "z-index:2147483000",
            "min-height:52px",
            "padding:12px 18px",
            "border:2px solid #38bdf8",
            "border-radius:12px",
            "background:#0f172a",
            "color:#f8fafc",
            "box-shadow:0 8px 24px rgba(0,0,0,.45)",
            "font:600 16px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
            "cursor:pointer",
            "touch-action:manipulation"
        ].join(";");
        launcher.addEventListener("click", () => {
            try {
                openLocalizationQAPanel();
            } catch (error) {
                console.error("[Localization QA]", error?.message || String(error));
            }
        });
        document.body.appendChild(launcher);
        qaLauncher = launcher;
        window.__localizationQALauncher = launcher;
        return launcher;
    }

    function openLocalizationQAPanel() {
        if (!document.body) {
            throw new Error("The game page is not ready yet. Try opening the QA panel again.");
        }
        installQALauncher();
        if (qaPanelWindow && !qaPanelWindow.closed) {
            qaPanelWindow.focus();
            return qaPanel;
        }

        const childWindow = window.open(
            "",
            "localization-qa-window",
            "popup=yes,width=640,height=900,resizable=yes,scrollbars=yes"
        );
        if (!childWindow) {
            throw new Error(
                "The browser blocked the QA window. Allow pop-ups for the game, then click Open Localization QA."
            );
        }
        qaPanelWindow = childWindow;
        qaPanelDocument = childWindow.document;
        qaPanelDocument.open();
        qaPanelDocument.write(
            "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">" +
            "<title>Localization QA</title></head><body></body></html>"
        );
        qaPanelDocument.close();
        childWindow.addEventListener("beforeunload", cleanupQAPanelWindow, { once: true });
        childWindow.addEventListener("pagehide", cleanupQAPanelWindow, { once: true });

        const panel = qaPanelDocument.createElement("section");
        panel.id = "localization-qa-panel";
        panel.setAttribute("aria-label", "Localization QA");
        panel.style.cssText = [
            "width:min(760px,100%)",
            "min-height:100vh",
            "overflow:auto",
            "box-sizing:border-box",
            "margin:0 auto",
            "padding:clamp(16px,4vw,32px)",
            "background:#0f172a",
            "color:#f8fafc",
            "font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif"
        ].join(";");

        qaPanelDocument.body.style.cssText = "margin:0;background:#020617;";
        const addStyles = qaPanelDocument.createElement("style");
        addStyles.id = "localization-qa-panel-styles";
        addStyles.textContent = `
            #localization-qa-panel * { box-sizing: border-box; }
            #localization-qa-panel button,
            #localization-qa-panel select,
            #localization-qa-panel textarea {
                font: inherit; border-radius: 7px; padding: 8px 10px;
            }
            #localization-qa-panel button {
                border: 1px solid #475569; color: #f8fafc; background: #1e293b;
                cursor: pointer; min-height: 48px; touch-action: manipulation;
            }
            #localization-qa-panel button:hover:not(:disabled) { background: #334155; }
            #localization-qa-panel button:focus-visible,
            #localization-qa-panel select:focus-visible,
            #localization-qa-panel textarea:focus-visible {
                outline: 2px solid #38bdf8; outline-offset: 2px;
            }
            #localization-qa-panel button:disabled { opacity: .55; cursor: not-allowed; }
            #localization-qa-panel select,
            #localization-qa-panel textarea {
                width: 100%; color: #0f172a; background: #f8fafc; border: 1px solid #94a3b8;
            }
            #localization-qa-panel .lqa-grid {
                display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px;
            }
            #localization-qa-panel .lqa-label {
                display: block; margin: 12px 0 5px; color: #cbd5e1; font-weight: 600;
            }
            #localization-qa-panel .lqa-status {
                margin: 12px 0; padding: 9px 10px; border-radius: 7px;
                background: #1e293b; color: #e2e8f0; overflow-wrap: anywhere;
            }
            #localization-qa-panel .lqa-status[data-kind="error"] { background: #7f1d1d; }
            #localization-qa-panel .lqa-status[data-kind="success"] { background: #14532d; }
            #localization-qa-panel .lqa-note { min-height: 64px; resize: vertical; }
            #localization-qa-panel .lqa-findings {
                max-height: 180px; overflow: auto; margin: 8px 0; padding-left: 22px;
                color: #fde68a;
            }
            #localization-qa-panel .lqa-header {
                display: flex; justify-content: space-between; align-items: center; gap: 12px;
            }
            #localization-qa-panel .lqa-title { margin: 0; font-size: clamp(22px,5vw,30px); }
            #localization-qa-panel .lqa-subtitle { color: #cbd5e1; margin: 8px 0 18px; }
            #localization-qa-panel .lqa-close { min-width: 92px; }
            #localization-qa-panel .lqa-note { font-size: 16px; }
            @media (max-width: 560px) {
                #localization-qa-panel .lqa-grid { grid-template-columns: 1fr; }
                #localization-qa-panel button { min-height: 54px; font-size: 17px; }
                #localization-qa-panel select { min-height: 50px; font-size: 17px; }
                #localization-qa-panel .lqa-findings { max-height: 30vh; }
            }
        `;
        qaPanelDocument.head.appendChild(addStyles);

        const header = createPanelElement("div", undefined, panel);
        header.className = "lqa-header";
        createPanelElement("h2", "Localization QA", header).className = "lqa-title";
        const closeButton = createPanelElement("button", "Hide", header);
        closeButton.className = "lqa-close";
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Hide localization QA panel");
        closeButton.textContent = "Hide window";

        createPanelElement(
            "p",
            "Select a language and folder, review the game popups, then record a manual result.",
            panel
        ).className = "lqa-subtitle";

        createPanelElement("label", "Language", panel).className = "lqa-label";
        const languageSelect = createPanelElement("select", undefined, panel);
        languageSelect.setAttribute("aria-label", "QA language");

        createPanelElement("label", "Folder", panel).className = "lqa-label";
        const folderSelect = createPanelElement("select", undefined, panel);
        folderSelect.setAttribute("aria-label", "Localization folder");

        const actions = createPanelElement("div", undefined, panel);
        actions.className = "lqa-grid";
        const auditButton = createPanelElement("button", "Run audit", actions);
        const foldersButton = createPanelElement("button", "Refresh folders", actions);
        const folderReviewButton = createPanelElement("button", "Review folder", actions);
        const allReviewButton = createPanelElement("button", "Review all keys", actions);
        const untranslatedButton = createPanelElement("button", "Review flagged keys", actions);
        const stopButton = createPanelElement("button", "Stop review", actions);
        stopButton.disabled = true;

        const status = createPanelElement("div", "Ready. Run an audit to begin.", panel);
        status.className = "lqa-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");

        const findingsDetails = createPanelElement("details", undefined, panel);
        const findingsSummary = createPanelElement("summary", "Audit findings", findingsDetails);
        findingsSummary.style.cursor = "pointer";
        const findingsList = createPanelElement("ul", undefined, findingsDetails);
        findingsList.className = "lqa-findings";

        createPanelElement("label", "QA note (optional)", panel).className = "lqa-label";
        const note = createPanelElement("textarea", undefined, panel);
        note.className = "lqa-note";
        note.setAttribute("aria-label", "Optional note for the manual QA result");
        note.placeholder = "For example: text clipped on small screens";

        const verdictActions = createPanelElement("div", undefined, panel);
        verdictActions.className = "lqa-grid";
        const verdictButtons = [
            ["pass", "Pass"],
            ["fail", "Fail"],
            ["blocked", "Blocked"],
            ["needs-review", "Needs review"]
        ].map(([verdict, label]) => {
            const button = createPanelElement("button", label, verdictActions);
            button.type = "button";
            button.disabled = true;
            return { verdict, button };
        });

        const reportActions = createPanelElement("div", undefined, panel);
        reportActions.className = "lqa-grid";
        const reportButton = createPanelElement("button", "QA summary", reportActions);
        const downloadButton = createPanelElement("button", "Download report", reportActions);

        const announce = (message, kind = "info") => {
            status.textContent = message;
            status.dataset.kind = kind;
        };
        const renderFindings = report => {
            findingsList.replaceChildren();
            const entries = [
                ...report.failures.map(failure => ({
                    key: failure.key,
                    text: failure.issues.join(" | "),
                    kind: "FAIL"
                })),
                ...report.warnings.map(warning => ({
                    key: warning.key,
                    text: warning.issue,
                    kind: "REVIEW"
                }))
            ];
            findingsSummary.textContent = entries.length
                ? `Audit findings (${report.failed} failures, ${report.warningCount} for review)`
                : `Audit findings (${report.auditStatus.toUpperCase()})`;
            for (const finding of entries.slice(0, 100)) {
                const item = createPanelElement(
                    "li",
                    `[${finding.kind}] ${finding.key}: ${finding.text}`,
                    findingsList
                );
                item.style.marginBottom = "5px";
                item.style.overflowWrap = "anywhere";
            }
            if (entries.length > 100) {
                createPanelElement(
                    "li",
                    `${entries.length - 100} additional findings are available in the downloadable report.`,
                    findingsList
                );
            }
            findingsDetails.open = entries.length > 0;
        };
        const selectedLanguage = () => languageSelect.value || getDefaultLocalizationLanguage();
        const refreshFolders = async () => {
            const listing = await window.listLocalizationPopupFolders(selectedLanguage());
            folderSelect.replaceChildren();
            for (const folder of listing.folders) {
                const option = createPanelElement(
                    "option",
                    `${folder.folder} (${folder.count}) — ${folder.missing} missing, ${folder.empty} empty`,
                    folderSelect
                );
                option.value = folder.folder;
            }
            folderSelect.disabled = listing.folders.length === 0;
            folderReviewButton.disabled = listing.folders.length === 0;
            announce(
                listing.folders.length
                    ? `${listing.language}: ${listing.folders.length} folders ready.`
                    : `No folders found for ${listing.language}.`,
                "success"
            );
            return listing;
        };
        const runAction = async action => {
            try {
                await action();
            } catch (error) {
                announce(error?.message || String(error), "error");
                console.error("[Localization QA UI]", error);
            }
        };
        const audit = async () => {
            const report = await window.startLocalizationQA(selectedLanguage());
            if (!report.ready) {
                announce(report.error, "error");
                return;
            }
            renderFindings(report);
            const kind = report.auditStatus === "fail"
                ? "error"
                : report.auditStatus === "pass"
                    ? "success"
                    : "info";
            announce(
                `${report.auditStatus.toUpperCase()}: ${report.failed} failures, ` +
                `${report.warningCount} warnings. Loading folders...`,
                kind
            );
            await refreshFolders();
        };
        const refreshProgress = () => {
            const run = window.__localizationPopupRun;
            const active = !!run?.active;
            stopButton.disabled = !active;
            folderReviewButton.disabled = active || folderSelect.options.length === 0;
            allReviewButton.disabled = active;
            untranslatedButton.disabled = active;
            auditButton.disabled = active;
            foldersButton.disabled = active;
            for (const { button } of verdictButtons) {
                button.disabled = !active || !run.currentKey;
            }
            if (active && run.currentKey) {
                const record = window.__localizationQAResults?.[run.language]?.manual?.[run.currentKey];
                const verdict = record ? ` · recorded ${record.status}` : "";
                announce(
                    `${run.language} · ${run.reviewType} · ${run.current}/${run.total}: ${run.currentKey}` +
                    `${verdict}`,
                    record ? "success" : "info"
                );
            } else if (run && run.completedAt) {
                announce(
                    `${run.stopped ? "Stopped" : "Review complete"}: ${run.reviewed.length}/${run.total} viewed.`,
                    run.stopped ? "info" : "success"
                );
            }
        };

        closeButton.addEventListener("click", () => {
            if (qaPanelWindow && !qaPanelWindow.closed) qaPanelWindow.close();
            cleanupQAPanelWindow();
        });
        languageSelect.addEventListener("change", () => {
            runAction(async () => {
                window.setLocalizationReviewLanguage(languageSelect.value);
                await audit();
            });
        });
        auditButton.addEventListener("click", () => runAction(audit));
        foldersButton.addEventListener("click", () => runAction(refreshFolders));
        folderReviewButton.addEventListener("click", () => runAction(async () => {
            if (!folderSelect.value) throw new Error("Select a folder first.");
            announce(`Starting ${folderSelect.value} review...`);
            await window.showLocalizationFolderPopups(selectedLanguage(), folderSelect.value);
            refreshProgress();
        }));
        allReviewButton.addEventListener("click", () => runAction(async () => {
            announce("Starting review of all keys...");
            await window.showLocalizationKeyPopups(selectedLanguage());
            refreshProgress();
        }));
        untranslatedButton.addEventListener("click", () => runAction(async () => {
            announce("Starting review of flagged keys...");
            await window.showUntranslatedLocalizationPopups(selectedLanguage());
            refreshProgress();
        }));
        stopButton.addEventListener("click", () => runAction(async () => {
            if (window.stopLocalizationPopupReview()) {
                announce("Stopping review and restoring the game's language...");
            }
        }));
        for (const { verdict, button } of verdictButtons) {
            button.type = "button";
            button.addEventListener("click", () => runAction(async () => {
                window.recordCurrentLocalizationQAResult(verdict, note.value);
                announce(`Recorded ${verdict} for ${window.__localizationPopupRun.currentKey}.`, "success");
            }));
        }
        reportButton.addEventListener("click", () => runAction(async () => {
            const report = window.getLocalizationQAReport(selectedLanguage());
            announce(
                `${report.language}: ${report.manualQA.reviewed}/${report.manualQA.totalKeys} manually reviewed; ` +
                `${report.manualQA.pending} pending.`,
                "success"
            );
        }));
        downloadButton.addEventListener("click", () => runAction(async () => {
            window.downloadLocalizationQAReport(selectedLanguage());
            announce("QA report export requested.", "success");
        }));

        const languages = window.listLocalizationLanguages();
        for (const language of languages) {
            const option = createPanelElement(
                "option",
                `${language.displayName}${language.code ? ` (${language.code})` : ""}`,
                languageSelect
            );
            option.value = language.name;
        }
        languageSelect.value = languages.find(language =>
            language.name === getDefaultLocalizationLanguage()
        )?.name || languages[0]?.name || "";
        panel.addEventListener("keydown", event => {
            if (event.key === "Escape" && !window.__localizationPopupRun?.active) {
                closeButton.click();
            }
        });

        qaPanelDocument.body.appendChild(panel);
        qaPanel = panel;
        window.__localizationQAPanel = panel;
        window.__localizationQAPanelWindow = childWindow;
        window.__localizationQAPanelControls = {
            languageSelect,
            folderSelect,
            status,
            note,
            hideButton: closeButton,
            auditButton,
            foldersButton,
            folderReviewButton,
            allReviewButton,
            untranslatedButton,
            stopButton,
            verdictButtons: Object.fromEntries(
                verdictButtons.map(({ verdict, button }) => [verdict, button])
            ),
            reportButton,
            downloadButton
        };
        qaPanelTimer = window.setInterval(refreshProgress, 200);
        announce("Ready. Choose a language, then run the audit.", "success");
        return panel;
    }

    window.openLocalizationQAPanel = openLocalizationQAPanel;
    window.showLocalizationQAPanel = openLocalizationQAPanel;
    window.closeLocalizationQAPanel = function closeLocalizationQAPanel() {
        if (!qaPanelWindow || qaPanelWindow.closed) {
            cleanupQAPanelWindow();
            return false;
        }
        qaPanelWindow.close();
        cleanupQAPanelWindow();
        return true;
    };

    try {
        installQALauncher();
        window.openLocalizationQAPanel();
    } catch (error) {
        console.info(
            "[Localization QA] Separate QA window was not opened. Use the Open Localization QA button, " +
            "or allow pop-ups and run window.showLocalizationQAPanel().",
            error?.message || String(error)
        );
    }

    console.info(
        "[Localization QA] Utilities installed. Use the QA panel, or run " +
        "await window.startLocalizationQA() from the console."
    );
})();
