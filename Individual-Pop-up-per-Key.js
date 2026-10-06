(function installLocalizationPopup() {
    "use strict";

    const defaultKey = "General/LikeAppName";
    const defaultLanguage = window.LOCALIZATION_TEST_LANGUAGE || "Hindi";
    const defaultValues = {
        count: 12,
        name: "TestUser",
        crew_label: " +3 MERCS"
    };

    /**
     * Loads a game's language dictionary if needed, then displays one translated string.
     */
    async function loadLanguage(requestedLanguage) {
        const localization = window.MyApp?.libs?.Localization;
        if (!localization) throw new Error("MyApp.libs.Localization is unavailable.");

        const languages = Object.values(localization.availableLanguages || {});
        const languageInfo = languages.find(language =>
            language.name === requestedLanguage ||
            language.displayName === requestedLanguage ||
            language.code === requestedLanguage
        );
        if (languages.length > 0 && !languageInfo) {
            throw new Error(
                `Unsupported language "${requestedLanguage}". Available: ` +
                languages.map(language => language.name).join(", ")
            );
        }

        const languageName = languageInfo?.name || requestedLanguage;
        if (!window.languageData?.[languageName]) {
            const script = document.createElement("script");
            script.src = new URL(`app/resources/languages/lang_${languageName}.js`, location.href).href;
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => reject(
                    new Error(`Failed to load ${languageName} localization script: ${script.src}`)
                );
                document.head.appendChild(script);
            });
        }

        const strings = window.languageData?.[languageName];
        if (!strings || typeof strings !== "object") {
            throw new Error(`Localization dictionary for "${languageName}" was not loaded.`);
        }
        return { languageName, strings };
    }

    window.showLocalizationPopupForKey = async function showLocalizationPopupForKey(
        key = defaultKey,
        sampleValues = defaultValues,
        requestedLanguage = defaultLanguage
    ) {
        const gameUi = window.$$;
        if (typeof gameUi?.formatStr !== "function" || typeof gameUi.alert !== "function") {
            console.error("[Localization popup] The game's formatter or alert is unavailable.");
            return false;
        }
        if (typeof key !== "string") {
            console.error("[Localization popup] The localization key must be a string.");
            return false;
        }

        let languageName;
        let strings;
        try {
            ({ languageName, strings } = await loadLanguage(requestedLanguage));
        } catch (error) {
            console.error("[Localization popup] BLOCKED", error?.message || String(error));
            return false;
        }

        if (!Object.prototype.hasOwnProperty.call(strings, key)) {
            console.error(`[Localization popup] Unknown ${languageName} localization key: ${key}`);
            return false;
        }

        const text = strings[key];
        if (typeof text !== "string") {
            console.error(`[Localization popup] Expected a string for "${key}".`);
            return false;
        }

        const placeholders = text.match(/\{\w+\}/g) || [];
        console.log(key, "=>", text);
        console.log("placeholders:", placeholders);
        gameUi.alert(`${languageName}: ${key}`, gameUi.formatStr(text, sampleValues));
        return true;
    };

    window.showLocalizationPopupForKey();
})();
