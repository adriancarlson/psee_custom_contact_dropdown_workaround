# PSEE Custom Contact Dropdown Workaround

A standalone PowerSchool Enrollment Express workaround that submits `codeset.code` for configured contact extension dropdowns while retaining PowerSchool Enrollment Express display labels.

## Documentation and package

- [Original issue, solution, and package contents](docs/issue-and-solution.md)
- [Detailed JavaScript walkthrough](docs/javascript-walkthrough.md)
- [Installable plugin ZIP](PSEE-Custom-Contact-Dropdown-Workaround.zip)

The repository root contains `plugin.xml`, `web_root/`, and the installable ZIP. The `docs/` directory contains the two explanations.

## Build the install ZIP

Include only `plugin.xml` and the complete `web_root/` directory at the root of the ZIP:

```text
plugin.xml
web_root/
```

Do not include a wrapping repository folder, `readme.md`, `docs/`, `.git/`, or an existing ZIP in the install ZIP.

To build the ZIP from the repository root in PowerShell:

```powershell
Compress-Archive -Path plugin.xml, web_root -DestinationPath PSEE-Custom-Contact-Dropdown-Workaround.zip -Force
```

Or build it from the repository root in Bash with the `zip` utility installed:

```bash
rm -f PSEE-Custom-Contact-Dropdown-Workaround.zip
zip -r PSEE-Custom-Contact-Dropdown-Workaround.zip plugin.xml web_root
```

Both commands create `PSEE-Custom-Contact-Dropdown-Workaround.zip` in the repository root. The Bash commands remove an existing archive first so files removed from the source cannot remain in an older ZIP.

## Install

1. Install the ZIP created above through Plugin Configuration and enable it.
2. Compare the stored values before submission and after approval. Repeat in a parent session before production use.

Rollback: disable this plugin. PowerSchool Enrollment Express's original dropdown behavior resumes.

## Configure for another district

Edit the `fields` array at the beginning of `web_root/scripts/formbuilder/modules/cdol_contact_codes.js`. Entries use `TABLE.COLUMN` and identify only text extension columns that should store codes:

```js
const fields = ['U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION', 'U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE']
```

Replace these district-specific table and column names with your own. Use the table and extension identifiers configured in the custom contact layout. Do not add native ID-based fields, such as Gender, Relationship, Prefix, or Suffix, or extension columns intended to store codeset IDs.

When distributing a district-specific derivative, update the publisher/contact metadata, plugin version, and package name. To support simultaneous independent plugins, also give the script and fragment paths distinct names.

## Script cache busting

The loader fragments use `?v=~(f.currenttime;format=HHMMSS,nocolon)` for cache busting. PowerSchool renders the current server time as six digits, such as `100307`, when processing the page. No manual script query-string version update is needed.

## How it loads

Two `page.header` fragments load our script on the admin student form and guardian form. The script chains RequireJS's existing `onResourceLoad` handler and registers its Angular decorators after PowerSchool Enrollment Express's `main` module loads, before the form starts. The contact loader resolves an existing ID, code, or display value to the configured code. Unknown values are preserved. The contact dialog template is adjusted in memory only for the configured fields; other fields retain their existing behavior.

This package does not repair existing database values in bulk. Configured values are normalized in the form model and delivered through the normal submission/approval process.
