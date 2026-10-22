# Original issue, solution, and package contents

The original issue is a mismatch between **what the custom contact fields store** and **what PowerSchool Enrollment Express uses as a dropdown's value**. The plugin corrects both loading existing values and preparing selected values for submission.

## The original issue

A PowerSchool code-set option has several distinct properties:

| Property       | Purpose                                   | Nebraska example |
| -------------- | ----------------------------------------- | ---------------- |
| `codesetid`    | Internal identifier for the option        | `315`            |
| `code`         | The value intended for code-based storage | `NE`             |
| `displayvalue` | The label presented to the user           | `Nebraska`       |

The two custom contact fields should store the **code**:

```text
U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION
U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE
```

However, the custom contact dropdown in PowerSchool Enrollment Express used `option.codesetid` for both its option values and its selection comparison. Its behavior was effectively:

```html
<option value="315">Nebraska</option>
```

That caused two related problems.

**Existing values did not select correctly.** If the contact field contained `NE`, PowerSchool Enrollment Express tried to match it against `315`. Likewise, `Catholic` did not match the Religion option's internal ID, `77372`.

**Submissions could store the internal ID.** Selecting Nebraska put `315` into the contact model. The normal submission process could then deliver that ID into the text extension field.

Religion made the distinction less visible because its code and display label can both be `Catholic`. State clearly demonstrates why the distinction matters: the label is `Nebraska`, but the code is `NE`.

The example IDs are from the original district's environment. Other districts can have different code-set IDs; none of these IDs are hardcoded in the plugin.

## How the plugin corrects it

The correction has two parts. Changing only the HTML option values would leave the existing-value loading problem unresolved.

### 1. Load existing contact values as codes

The script extends PowerSchool Enrollment Express's `contactsElementDirective`, which controls the contact element.

It lets PowerSchool Enrollment Express initialize that element normally, then wraps its `getCustomFieldValue` function. For a configured dropdown, the wrapper:

1. Reads the value already in the contact model, or retrieves it from the contact's extension data.
2. Finds the matching code-set option.
3. Accepts an existing ID, code, or display value as a match.
4. Places the matching option's **`code`** into the model.

For Parish State, these existing values therefore resolve to the same code:

| Existing value | Matching result in the form model |
| -------------- | --------------------------------- |
| `315`          | `NE`                              |
| `Nebraska`     | `NE`                              |
| `NE`           | `NE`                              |

If no option matches, the script preserves the existing value instead of replacing it with a blank.

PowerSchool Enrollment Express's submission builder prefers a model property ending in `_id`, even for these text extension fields. The plugin therefore places the code in both model properties:

```js
contact[key] = contact[key + '_id'] = option ? option.code : raw
```

The `_id` suffix remains because PowerSchool Enrollment Express's existing code expects it. **Its contents are the code**, such as `NE`.

This changes the browser's form model. It does not directly update the database or perform a bulk repair.

### 2. Make dropdown selections use codes

The script also extends Angular's `$templateRequest` service, the service that loads the contact editor's HTML template.

It watches specifically for:

```text
/scripts/formbuilder/partials/dialogs/responder.customcontactdetail.html
```

When that template loads, the plugin changes its dropdown option binding **in memory**. For configured fields, the selected-value comparison and option value use:

```js
option.code
```

The resulting behavior is effectively:

```html
<option value="NE">Nebraska</option>
```

The user still sees PowerSchool Enrollment Express's display label. The selected value prepared for submission is the code.

Other dropdown fields continue using their existing ID-based behavior.

## What the package contains

The installable package contains four files:

```text
plugin.xml
web_root/
├── admin/students/
│   └── form.cdol_contact_codes.page.header.txt
├── guardian/
│   └── form.cdol_contact_codes.page.header.txt
└── scripts/formbuilder/modules/
    └── cdol_contact_codes.js
```

### plugin.xml

This is the PowerSchool plugin manifest. It identifies:

- **Name:** PSEE Custom Contact Dropdown Workaround
- **Version:** Declared in `plugin.xml`
- **Publisher:** Adrian Carlson
- The plugin description and publisher contact

It declares no database extensions, queries, or API permissions.

### Admin form header fragment

```text
/web_root/admin/students/form.cdol_contact_codes.page.header.txt
```

This adds the script to the administrator's student form page:

```html
<script src="/scripts/formbuilder/modules/cdol_contact_codes.js?v=~(f.currenttime;format=HHMMSS,nocolon)"></script>
```

PowerSchool processes `~(f.currenttime;format=HHMMSS,nocolon)` in the header fragment and substitutes the current server time as six digits, such as `100307`. This changes the script URL each second without a manual version update.

It uses PowerSchool's page-fragment mechanism, so it does not replace PowerSchool Enrollment Express's `form.html`.

### Guardian form header fragment

```text
/web_root/guardian/form.cdol_contact_codes.page.header.txt
```

This contains the same script reference for the parent form page.

The package includes this loader, but parent-session behavior needs validation in the installation. No teacher or preregistration form fragment is included.

### cdol_contact_codes.js

```text
/web_root/scripts/formbuilder/modules/cdol_contact_codes.js
```

This contains all the correction logic:

- The list of fields that should store codes.
- The existing-value loading correction.
- The contact template adjustment.
- The hook that registers the correction at the right time.

## Why the load timing matters

The correction must register **after PowerSchool Enrollment Express creates its Angular modules but before Angular starts the form**.

The header fragment loads our script early. Our script then chains RequireJS's existing `onResourceLoad` handler. When PowerSchool Enrollment Express's `main` module finishes loading, it registers the Angular decorators.

It preserves any existing RequireJS handler and uses a guard to register the correction only once. If RequireJS is not available when our script first runs, it waits for a script-load event and attaches when it becomes available.

This timing allows the correction to work without adding code inside PowerSchool Enrollment Express's `responder.js`.

## Adapting it for another district

The field configuration is at the beginning of the JavaScript file:

```js
const fields = ['U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION', 'U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE']
```

Another district can replace those entries with its own `TABLE.COLUMN` names.

The list should contain only extension dropdown fields intended to store **code values**. Native fields such as Gender, Relationship, Prefix, and Suffix legitimately use IDs and should not be added.

The configuration is deliberately explicit: this package does not assume every custom dropdown should store a code.

## Updates and verification

The plugin does not replace or edit these PowerSchool Enrollment Express files:

```text
responder.js
main.min.js
responder.customcontactdetail.html
```

That removes the need to merge our correction back into `responder.js` after every update. However, compatibility checks remain necessary because the plugin depends on PowerSchool Enrollment Express's internal function names, load sequence, and contact-template markup. The template replacement currently matches a specific PowerSchool Enrollment Express HTML fragment.

[Return to the README](../readme.md) · [Detailed JavaScript walkthrough](javascript-walkthrough.md)
