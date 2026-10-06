# Game Localization Console Utilities

Browser-console tools for checking a game's localization dictionary and reviewing translated text in the game's own popups. They are intended for localization testers and translators who can access the running game; they are not a standalone application or localization package.

## Choose a tool

| File | Use it for | What happens when loaded |
| --- | --- | --- |
| [`localization-console-test.js`](./localization-console-test.js) | Checking a language and reviewing untranslated or selected strings | Installs the commands below and runs a localization check |
| [`Individual-Pop-up-per-Key.js`](./Individual-Pop-up-per-Key.js) | Quickly previewing one string | Installs `showLocalizationPopupForKey` and previews `General/LikeAppName` |

Each file can be used on its own. For most review work, start with `localization-console-test.js`.

## Requirements

- Open the game in a browser and wait for its application scripts to finish loading.
- The page must expose `MyApp.libs.Localization`, `languageData`, `$$.formatStr`, and `$$.alert`.
- The browser must be allowed to load the game's language scripts. When a dictionary is not already loaded, the tools request `app/resources/languages/lang_<LanguageName>.js` relative to the current game URL.

These scripts use the game's runtime and UI. Do not run them on an unrelated website.

## Quick start

1. Open the game's browser developer console.
2. (Optional) Choose the language before loading a utility:

   ```js
   window.LOCALIZATION_TEST_LANGUAGE = "Hindi";
   ```

   Use a language name, display name, or code exposed by `MyApp.libs.Localization.availableLanguages`. If that list is unavailable, use the language dictionary/script name, such as `"English"`.
3. Open the chosen JavaScript file in this repository, copy its full contents, and paste it into the console.
4. Read the console output, or call the commands below to run a check or review popups.

The check utility uses Hindi by default if no language is configured. Change the default with `LOCALIZATION_TEST_LANGUAGE`, or provide a language directly to a command.

## Check a language

After loading `localization-console-test.js`, run:

```js
await window.runLocalizationChecks();          // Configured language
await window.runLocalizationChecks("French"); // One-off language
```

The returned report is also available as `window.__localizationTestReport`. A successful setup returns `ready: true` and includes the language, key totals, missing and extra keys, empty and unchanged translations, placeholder mismatches, and failures. `passed` and `failed` count the English baseline keys when that dictionary is available; otherwise, they count the selected language's entries. If setup is blocked, the result has `ready: false` and an `error` message.

When the English dictionary is available, the check compares key coverage and placeholder names against it. Without that baseline, it can still check that entries are strings and exercise the game's formatter, but it cannot reliably identify missing keys, untranslated English text, or placeholder-contract mismatches.

## Review strings in game popups

Review only strings that are empty or identical to the English text:

```js
await window.showUntranslatedLocalizationPopups();
await window.showUntranslatedLocalizationPopups("French");
```

Review every key, or only specific keys:

```js
await window.showLocalizationKeyPopups(); // Every key in the configured language
await window.showLocalizationKeyPopups("French", ["General/LikeAppName"]);
await window.showLocalizationKeyPopups("French", [
  "General/LikeAppName",
  "Another/Key"
]);
```

The all-keys review may open many popups. Close each popup to continue. Stop either kind of review at any time with:

```js
window.stopLocalizationPopupReview();
```

The review temporarily switches the game's active localization dictionary and restores its previous language and dictionary when it completes or is stopped. Popup reviews cannot show a key that is absent from the selected language dictionary.

## Preview one key

Load `Individual-Pop-up-per-Key.js` to preview `General/LikeAppName` with sample values. To preview a different key, values, or language, call:

```js
await window.showLocalizationPopupForKey(
  "General/LikeAppName",
  { count: 12, name: "TestUser", crew_label: " +3 MERCS" },
  "French"
);
```

For the default language and sample values, only the key is needed:

```js
await window.showLocalizationPopupForKey("General/LikeAppName");
```

Unknown keys, unsupported languages, missing game helpers, and language-loading errors are reported in the console. If a language cannot be loaded, confirm the language name and that the game's language-script URL is accessible.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for change and manual verification guidance.
