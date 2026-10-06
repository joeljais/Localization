(function installLocalizationChecks() {
    "use strict";


    window.runLocalizationChecks = async function runLocalizationChecks(
        requestedLanguage = window.LOCALIZATION_TEST_LANGUAGE || "Hindi"
    ) {
        const localization = window.MyApp?.libs?.Localization;
        const formatStr = window.$$?.formatStr;
        const block = message => {
            console.error("[Localization test] BLOCKED", message);
            window.__localizationTestReport = { ready: false, error: message };
            return window.__localizationTestReport;
        };


        if (!localization) return block("MyApp.libs.Localization is unavailable.");
        if (typeof formatStr !== "function") return block("The game formatter is unavailable: $$.formatStr is not a function.");


        const availableLanguages = Object.values(localization.availableLanguages || {});
        const languageInfo = availableLanguages.find(language =>
            language.name === requestedLanguage ||
            language.displayName === requestedLanguage ||
            language.code === requestedLanguage
        );
        const languageName = languageInfo?.name || requestedLanguage;


        if (availableLanguages.length > 0 && !languageInfo) {
            return block(`Unsupported language "${requestedLanguage}". Available: ${availableLanguages.map(language => language.name).join(", ")}.`);
        }


        if (!window.languageData?.[languageName]) {
            const script = document.createElement("script");
            script.src = new URL(`app/resources/languages/lang_${languageName}.js`, location.href).href;
            try {
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = () => reject(new Error(`Failed to load ${languageName} localization script: ${script.src}`));
                    document.head.appendChild(script);
                });
            } catch (error) {
                return block(error?.message || String(error));
            }
        }


        const strings = window.languageData?.[languageName];
        if (!strings || typeof strings !== "object") {
            return block(`Localization dictionary for "${languageName}" was not loaded.`);
        }


        const entries = Object.entries(strings);
        const english = window.languageData?.English;
        const missingKeys = english
            ? Object.keys(english).filter(key => !Object.prototype.hasOwnProperty.call(strings, key))
            : [];
        const extraKeys = english
            ? entries.map(([key]) => key).filter(key => !Object.prototype.hasOwnProperty.call(english, key))
            : [];
        const emptyTranslations = [];
        const unchangedTranslations = [];
        const placeholderMismatches = [];
        const failures = [];
        let placeholderKeys = 0;


        for (const [key, text] of entries) {
            const issues = [];


            if (typeof text !== "string") {
                failures.push({ key, issues: [`Expected a string, got ${typeof text}`] });
                continue;
            }
            if (text.trim() === "") {
                const emptyTranslation = {
                    key,
                    englishIsEmpty: typeof english?.[key] === "string" && english[key].trim() === ""
                };
                emptyTranslations.push(emptyTranslation);
                if (!emptyTranslation.englishIsEmpty) {
                    failures.push({
                        key,
                        issues: ["Translation is empty; the English fallback will be used"]
                    });
                }
                continue;
            }


            if (typeof english?.[key] === "string" &&
                english[key].trim() !== "" &&
                text.trim() === english[key].trim()) {
                const unchangedTranslation = { key, text };
                unchangedTranslations.push(unchangedTranslation);
                failures.push({
                    key,
                    issues: [`${languageName} text is identical to the English baseline`]
                });
            }


            const localePlaceholders = [...new Set(
                Array.from(text.matchAll(/\{([A-Za-z0-9_]+)\}/g), match => match[1])
            )].sort();
            const contractText = typeof english?.[key] === "string" ? english[key] : text;
            const expectedPlaceholders = [...new Set(
                Array.from(contractText.matchAll(/\{([A-Za-z0-9_]+)\}/g), match => match[1])
            )].sort();
            if (expectedPlaceholders.length > 0) placeholderKeys++;


            if (typeof english?.[key] === "string" &&
                JSON.stringify(localePlaceholders) !== JSON.stringify(expectedPlaceholders)) {
                const mismatch = {
                    key,
                    expected: expectedPlaceholders,
                    found: localePlaceholders,
                    english: english[key],
                    translation: text
                };
                placeholderMismatches.push(mismatch);
                issues.push(`Placeholder contract mismatch: expected {${expectedPlaceholders.join("}, {")}}, found {${localePlaceholders.join("}, {")}}`);
            }


            const sampleValues = Object.fromEntries(
                expectedPlaceholders.map(name => [name, `__L10N_TEST_${name}__`])
            );


            try {
                const rendered = formatStr(text, sampleValues);
                if (typeof rendered !== "string") {
                    issues.push(`Formatter returned ${typeof rendered}, not a string`);
                } else {
                    const unresolved = rendered.match(/\{[A-Za-z0-9_]+\}/g) || [];
                    if (unresolved.length > 0) {
                        issues.push(`Unresolved placeholders: ${[...new Set(unresolved)].join(", ")}`);
                    }
                    for (const name of expectedPlaceholders) {
                        if (!rendered.includes(`__L10N_TEST_${name}__`)) {
                            issues.push(`Placeholder {${name}} was not substituted`);
                        }
                    }
                }
            } catch (error) {
                issues.push(`Formatter threw: ${error?.message || String(error)}`);
            }


            if (issues.length > 0) failures.push({ key, issues, text });
        }


        const failedKeys = [...new Set([
            ...failures.map(failure => failure.key),
            ...missingKeys,
            ...extraKeys
        ])];
        const totalKeys = english ? Object.keys(english).length : entries.length;
        const report = {
            ready: true,
            language: languageName,
            totalKeys,
            englishKeys: english ? Object.keys(english).length : null,
            missingKeys,
            extraKeys,
            emptyTranslations,
            unchangedTranslations,
            nonTranslatedKeys: [
                ...unchangedTranslations.map(item => item.key),
                ...emptyTranslations
                    .filter(item => !item.englishIsEmpty)
                    .map(item => item.key)
            ],
            fallbackTranslations: emptyTranslations.filter(item => !item.englishIsEmpty),
            placeholderKeys,
            placeholderMismatches,
            passed: Math.max(0, totalKeys - failedKeys.length),
            failed: failedKeys.length,
            failedKeys,
            failures
        };


        window.__localizationTestReport = report;
        console.log(
            `[Localization test] ${report.failed ? "FAIL" : "PASS"}: ` +
            `${report.passed}/${report.totalKeys} keys; ` +
            `${report.placeholderKeys} keys contain placeholders; ` +
            `${missingKeys.length} missing keys, ${extraKeys.length} extra keys, ` +
            `${emptyTranslations.length} empty translations ` +
            `(${report.fallbackTranslations.length} fall back to English), ` +
            `${unchangedTranslations.length} non-empty translations identical to English, ` +
            `${placeholderMismatches.length} placeholder mismatches.`
        );
        if (failures.length > 0) console.table(failures);
        if (missingKeys.length > 0) console.table(missingKeys.map(key => ({ key, issue: "Missing locale key" })));
        if (extraKeys.length > 0) console.table(extraKeys.map(key => ({ key, issue: "Not present in English baseline" })));
        if (unchangedTranslations.length > 0) console.table(unchangedTranslations);
        if (report.fallbackTranslations.length > 0) console.table(report.fallbackTranslations);
        if (placeholderMismatches.length > 0) console.table(placeholderMismatches);
        return report;
    };


    window.showUntranslatedLocalizationPopups = async function showUntranslatedLocalizationPopups(
        requestedLanguage = window.LOCALIZATION_TEST_LANGUAGE || "Hindi"
    ) {
        if (window.__localizationPopupRun?.active) {
            throw new Error("A localization popup review is already in progress.");
        }


        const report = await window.runLocalizationChecks(requestedLanguage);
        if (!report.ready) throw new Error(report.error);


        const localization = window.MyApp.libs.Localization;
        const strings = window.languageData[report.language];
        const previous = {
            language: localization.language,
            data: localization._data_index
        };
        const examples = {
            count: 12,
            name: "TestUser",
            crew_label: " +3 MERCS"
        };
        const keys = report.nonTranslatedKeys;
        const run = {
            active: true,
            language: report.language,
            total: keys.length,
            current: 0,
            reviewed: [],
            close: null
        };
        window.__localizationPopupRun = run;
        localization.language = report.language;
        localization._data_index = strings;


        try {
            for (const key of keys) {
                run.current++;
                const text = strings[key];
                const placeholders = [...new Set(
                    Array.from(text.matchAll(/\{([A-Za-z0-9_]+)\}/g), match => match[1])
                )];
                const replacements = Object.fromEntries(
                    placeholders.map(name => [
                        name,
                        Object.prototype.hasOwnProperty.call(examples, name)
                            ? examples[name]
                            : `[TEST_${name}]`
                    ])
                );
                const message = window.$$.formatStr(text, replacements);


                await new Promise(resolve => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        run.reviewed.push(key);
                        resolve();
                    };
                    run.close = finish;
                    window.$$.alert(`${run.current}/${run.total} ${key}`, message, finish);
                });
            }
        } finally {
            localization.language = previous.language;
            localization._data_index = previous.data;
            run.active = false;
            run.close = null;
        }


        console.log(
            `[Localization popup review] Complete: ${run.reviewed.length}/${run.total} ` +
            `${report.language} non-translated entries reviewed.`
        );
        return run;
    };


    window.showLocalizationKeyPopups = async function showLocalizationKeyPopups(
        requestedLanguage = window.LOCALIZATION_TEST_LANGUAGE || "Hindi",
        requestedKeys
    ) {
        if (window.__localizationPopupRun?.active) {
            throw new Error("A localization popup review is already in progress.");
        }


        const report = await window.runLocalizationChecks(requestedLanguage);
        if (!report.ready) throw new Error(report.error);


        const localization = window.MyApp.libs.Localization;
        const strings = window.languageData[report.language];
        const keys = requestedKeys === undefined
            ? Object.keys(strings)
            : Array.isArray(requestedKeys)
                ? requestedKeys
                : [requestedKeys];
        const unknownKeys = keys.filter(key => !Object.prototype.hasOwnProperty.call(strings, key));
        if (unknownKeys.length > 0) {
            throw new Error(`Unknown ${report.language} localization keys: ${unknownKeys.join(", ")}`);
        }


        const previous = {
            language: localization.language,
            data: localization._data_index
        };
        const examples = {
            count: 12,
            name: "TestUser",
            crew_label: " +3 MERCS"
        };
        const run = {
            active: true,
            language: report.language,
            total: keys.length,
            current: 0,
            currentKey: null,
            reviewed: [],
            stopRequested: false,
            close: null
        };
        window.__localizationPopupRun = run;
        localization.language = report.language;
        localization._data_index = strings;
        window.stopLocalizationPopupReview = () => {
            if (!run.active) return false;
            run.stopRequested = true;
            window.Ext?.Msg?.hide();
            run.close?.();
            return true;
        };


        try {
            for (const key of keys) {
                if (run.stopRequested) break;


                const text = strings[key];
                if (typeof text !== "string") {
                    throw new Error(`Localization value for "${key}" is not a string.`);
                }


                const placeholders = text.match(/\{\w+\}/g);
                const names = [...new Set(
                    Array.from(text.matchAll(/\{(\w+)\}/g), match => match[1])
                )];
                const replacements = Object.fromEntries(
                    names.map(name => [
                        name,
                        Object.prototype.hasOwnProperty.call(examples, name)
                            ? examples[name]
                            : `[TEST_${name}]`
                    ])
                );
                const message = window.$$.formatStr(text, replacements);


                run.current++;
                run.currentKey = key;
                console.log(`[Localization popup review] ${run.current}/${run.total}`);
                console.log(key, "=>", text);
                console.log("placeholders:", placeholders);


                await new Promise(resolve => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        if (!run.stopRequested) run.reviewed.push(key);
                        run.currentKey = null;
                        run.close = null;
                        resolve();
                    };
                    run.close = finish;
                    window.$$.alert(`${run.current}/${run.total} ${key}`, message, finish);
                });
            }
        } finally {
            localization.language = previous.language;
            localization._data_index = previous.data;
            run.active = false;
            run.close = null;
            delete window.stopLocalizationPopupReview;
        }


        console.log(
            `[Localization popup review] ${run.stopRequested ? "Stopped" : "Complete"}: ` +
            `${run.reviewed.length}/${run.total} ${report.language} keys reviewed.`
        );
        return run;
    };


    window.runLocalizationChecks();
})();
