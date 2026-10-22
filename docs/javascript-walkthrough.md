# Detailed JavaScript walkthrough

`cdol_contact_codes.js` is a browser-side adapter between PowerSchool Enrollment Express's contact editor and the storage format required by the configured custom fields.

It leaves PowerSchool Enrollment Express's normal form processing in place. At two specific points, **loading existing contact values** and **building the dropdown options**, it substitutes code-based behavior for the configured fields.

A useful way to explain it is:

> PowerSchool Enrollment Express knows which contact fields to collect and how to submit them. Our script corrects the value those particular dropdowns put into that process.

Below is the script's operation from the first line through a completed contact edit.

## 1. It creates a private workspace

The entire script is enclosed in:

```js
;(function () {
	'use strict'

	// Everything else goes here.
})()
```

This is an **immediately invoked function expression**, often shortened to IIFE.

The function is defined and executed immediately. Its variables and helper functions stay inside that function instead of becoming global variables on the page.

That matters because PowerSchool Enrollment Express and other installed plugins share the same browser page. Names such as `fields`, `configure`, and `attach` are ordinary names another script could also use. Keeping ours private prevents those names from interfering with other code.

`"use strict"` enables stricter JavaScript rules. Among other things, it helps prevent accidentally creating a global variable through an undeclared assignment.

## 2. It declares exactly which fields need correction

Near the top:

```js
const fields = ['U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION', 'U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE']
```

This array is the script's configuration.

Each entry combines a table name and a column name:

```text
TABLE.COLUMN
```

The script does not infer that every dropdown should store a code. It applies the correction only to fields listed here.

That distinction is essential. A native field such as Gender or Relationship can legitimately require a code-set ID. The custom Parish State field requires the code, such as `NE`.

The helper below checks whether a field is on the list:

```js
function applies(field) {
	return field && fields.indexOf(`${field.tableName}.${String(field.columnName).toUpperCase()}`) !== -1
}
```

For a Parish State field, it constructs:

```text
U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE
```

Then `indexOf()` searches the configuration array.

- A result of `0`, `1`, or another nonnegative number means it found the field.
- A result of `-1` means it did not.

The initial `field &&` prevents the function from trying to read properties from a missing field object.

The column name is converted to uppercase before comparison. The table name is used as supplied by PowerSchool Enrollment Express.

## 3. It waits for the correct moment to register

The correction cannot register at just any time.

Too early, and PowerSchool Enrollment Express has not yet created the Angular module we need to extend.

Too late, and Angular has already started the form and created the services we need to decorate.

The script uses RequireJS to find the interval between those two events.

### Attaching to RequireJS

The `attach()` function starts with:

```js
if (typeof window.requirejs !== 'function') {
	return false
}
```

If RequireJS is not available yet, this returns `false`.

Otherwise, it saves the existing resource-load handler:

```js
const previous = window.requirejs.onResourceLoad
```

Then it installs a handler that preserves the previous behavior:

```js
window.requirejs.onResourceLoad = function (context, map, dependencies) {
	if (previous) {
		previous.apply(this, arguments)
	}

	if (map && map.name === 'main') {
		configure()
	}
}
```

This is called **chaining** the handler.

Our script does not discard an existing handler. It calls that handler first, using the same `this` value and arguments it received.

It then examines the module that finished loading. When that module is named `main`, it calls `configure()`.

For the PowerSchool Enrollment Express version inspected during development, `main` creates the form's Angular modules. The hook therefore gives us the opportunity to register our corrections before the normal form bootstrap runs.

### If RequireJS is not available immediately

At the bottom:

```js
if (!attach()) {
	document.addEventListener(
		'load',
		function loaded(event) {
			// Try attaching when a script finishes loading.
		},
		true
	)
}
```

The listener checks script-load events and tries again. The final `true` makes it listen during the capturing phase, allowing it to observe script-load events on the document.

Once attachment succeeds:

```js
document.removeEventListener('load', loaded, true)
```

The temporary listener removes itself. It does not keep watching every script for the rest of the page's lifetime.

## 4. It registers the corrections once per page

At the top:

```js
let registered = false
```

And inside `configure()`:

```js
if (registered) {
	return
}

registered = true
```

This prevents duplicate registration if the hook encounters `main` again.

Without the guard, the script could install multiple wrappers around the same functions.

It then registers a configuration function with PowerSchool Enrollment Express's existing Angular module:

```js
angular.module('responderForm').config([
	'$provide',
	function ($provide) {
		// Register the decorators.
	}
])
```

`angular.module("responderForm")` retrieves the existing module. It does not create a replacement form application.

`$provide` is Angular's mechanism for registering and decorating services and directives. The array supplies the dependency name explicitly, followed by the function that receives that dependency.

The script registers **two decorators**.

## 5. The first decorator corrects existing-value loading

The first decorator targets:

```js
$provide.decorator('contactsElementDirective', [
	'$delegate',
	function (definitions) {
		// Extend the existing directive.
	}
])
```

A directive is Angular code that gives an element its behavior. In this case, it is the behavior behind the contact form element.

`$delegate` supplies the original directive definitions.

The script loops through those definitions and saves each existing link function:

```js
const link = definition.link
```

A directive's **link function** connects the directive's behavior to its scope and rendered elements.

If the definition has no function-shaped link function, the script leaves it alone:

```js
if (typeof link !== 'function') {
	return
}
```

### It lets PowerSchool Enrollment Express initialize the contact element first

The replacement link function begins:

```js
definition.link = function (scope) {
	link.apply(this, arguments)

	// Add our correction after normal initialization.
}
```

Calling the original link function first is important. PowerSchool Enrollment Express still establishes its normal contact functions, permissions, data references, and other behavior.

After that initialization, the script saves PowerSchool Enrollment Express's field-value function:

```js
const getValue = scope.getCustomFieldValue
```

It replaces that function with a wrapper.

### The wrapper delegates unrelated fields to PowerSchool Enrollment Express

The first decision inside the wrapper is:

```js
if (!applies(field) || !contact || field.inputType !== 'dropdown') {
	return getValue.apply(this, arguments)
}
```

The correction applies only when:

- The field is explicitly configured.
- A contact object exists.
- The field is a dropdown.

Otherwise, PowerSchool Enrollment Express's original function handles the request.

For the two configured dropdowns, our wrapper handles value loading itself.

### It constructs the contact-model property name

This line creates the key used in PowerSchool Enrollment Express's browser-side contact object:

```js
const key = `${field.tableName}_${field.columnName.toLowerCase()}`
```

For Parish State, the result is:

```text
U_PERSON_ADDITIONAL_INFO_person_parish_state
```

The script first checks:

```js
let raw = contact[`${key}_id`]
```

That refers to:

```text
U_PERSON_ADDITIONAL_INFO_person_parish_state_id
```

This is a **JavaScript model property**, not a database column.

Checking it first preserves a value already present in the form model, for example, a selection made during editing.

### If the model value is absent, it reads the extension data

When `raw` is `undefined`, the script looks inside:

```js
contact.extensions
```

It finds the extension whose table and extension names match the configured field. Inside that extension, it finds the requested column.

Conceptually, it is looking through data like:

```js
{
    tablename: "u_person_additional_info",
    extensionname: "u_person_additional_info",
    fields: [
        {
            name: "person_parish_state",
            value: "NE"
        }
    ]
}
```

It then uses that field's saved value.

If the extension or field is absent, it starts with an empty string.

### It resolves the stored value to a code-set option

Next:

```js
const option = scope.getCodesetOptions(field.codesetId).find(item => String(item.codesetid) === String(raw) || String(item.code) === String(raw) || String(item.displayvalue) === String(raw))
```

This obtains the options for the field's configured code set and searches for a matching option.

It accepts a match against three properties:

| Stored value matches | Example    |
| -------------------- | ---------- |
| Internal option ID   | `315`      |
| Code                 | `NE`       |
| Display value        | `Nebraska` |

`String()` allows a numeric ID such as `315` to match the same ID supplied as `"315"`.

Accepting all three forms lets the form recognize correctly stored values as well as values produced by the earlier ID-based or display-value behavior.

### It puts the code into both model properties

The important assignment is:

```js
contact[key] = contact[`${key}_id`] = option ? option.code : raw
```

If a matching option exists, both properties receive its code.

For Nebraska:

```js
contact.U_PERSON_ADDITIONAL_INFO_person_parish_state = 'NE'

contact.U_PERSON_ADDITIONAL_INFO_person_parish_state_id = 'NE'
```

Why set both? PowerSchool Enrollment Express's submission builder prefers the property ending in `_id` when assembling extension data. Correcting only the property without that suffix would leave the wrong value available to the submission builder.

The property name remains `_id` to fit the existing PowerSchool Enrollment Express code. Its value is now the required code.

If no option matches, the assignment preserves `raw`. It does not silently erase an unfamiliar value.

### Why the compile assignment is needed

After replacing the link function:

```js
definition.compile = () => definition.link
```

Angular's directive compilation process determines which link function gets executed. Updating this path ensures Angular uses our wrapped link function rather than a link function captured before the decoration.

This was necessary during the original testing: changing `definition.link` alone did not activate the existing-value correction.

## 6. The second decorator corrects new dropdown selections

Loading existing values correctly solves only half the problem.

A user could still open the form, choose a different state, and put an internal ID back into the model if the dropdown's option values remained ID-based.

The second decorator targets:

```js
$templateRequest
```

That is Angular's service for requesting HTML templates.

The script saves the original service as `load` and calls it normally:

```js
return load(url, ignoreError).then(html => {
	// Examine the returned template.
})
```

The `.then()` runs after the template has loaded. It receives the HTML before that HTML is passed along for rendering.

### It targets one specific template

The script checks:

```text
/scripts/formbuilder/partials/dialogs/responder.customcontactdetail.html
```

Other templates pass through unchanged.

The URL comparison ignores a query string, so a version parameter does not prevent the match.

### It builds one condition from the configured field list

The `fields` array is converted into an Angular expression that asks:

> Is this dropdown's table and column on our configured list?

That is why the district-specific field names appear only once in the JavaScript configuration.

The quote conversion here:

```js
JSON.stringify(fields).replace(/"/g, "'")
```

allows the generated array expression to sit inside a double-quoted HTML attribute without breaking that attribute.

### It replaces the selected-value comparison and option value

The replacement's central expression is:

```js
configuredField ? option.code : option.codesetid
```

For Religion and Parish State, it uses `option.code`.

For unrelated fields, it retains `option.codesetid`.

The script applies that choice to both:

- `ng-selected`, which compares an option against the contact model.
- `value`, which determines what selecting the option puts into the model.

The label between the opening and closing `<option>` tags is not changed.

The result for Parish State is effectively:

```html
<option value="NE">Nebraska</option>
```

The user sees **Nebraska**. The model receives **NE**.

### It caches and returns the adjusted template

After the replacement:

```js
cache.put(url, html)
return html
```

The adjusted HTML goes into Angular's template cache and is returned for rendering.

That keeps the corrected template available when the contact dialog is opened again.

The script also forwards:

```js
totalPendingRequests
```

to the original template service through a getter. Code checking that service property continues to see the original service's current request count.

## 7. A complete example

Suppose a contact's Parish State currently contains `Nebraska`.

| Stage                                              | What happens                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Page loads                                         | The header fragment loads our script.                                                                    |
| PowerSchool Enrollment Express's main module loads | Our hook registers the decorators.                                                                       |
| Angular starts                                     | The decorated contact behavior becomes available.                                                        |
| Contact data is loaded                             | Our wrapper reads `Nebraska`.                                                                            |
| Option is located                                  | It matches the option whose display value is `Nebraska`.                                                 |
| Model is normalized                                | Both relevant model properties become `NE`.                                                              |
| Editor template loads                              | Our decorator makes that field's option values use codes.                                                |
| Contact editor opens                               | Nebraska appears selected because its option value is `NE`.                                              |
| User selects another state                         | That option's code goes into the model.                                                                  |
| Normal submission proceeds                         | PowerSchool Enrollment Express's existing builder receives the code through its expected model property. |
| Normal approval proceeds                           | The existing PowerSchool Enrollment Express process handles delivery to SIS.                             |

Our script does not submit the form, approve a response, or issue a database update itself.

## How to explain the design to someone else

> The defect has two sides. PowerSchool Enrollment Express tries to load our text extension values by matching code-set IDs, and its dropdowns also put those IDs into the submission model. Our plugin corrects both sides for an explicit list of fields.
>
> First, it recognizes the existing ID, code, or display value and normalizes the form model to `codeset.code`. Second, it adjusts the contact editor's template in memory so future selections also produce `codeset.code`.
>
> It registers those changes through Angular decorators at a controlled point in PowerSchool Enrollment Express's RequireJS load sequence. PowerSchool Enrollment Express's files remain unchanged, and the normal submission and approval workflow still does the database work.

The main maintenance dependency is that **this remains an adapter to internal PowerSchool Enrollment Express behavior**. If PowerSchool Enrollment Express changes the directive, field-loading function, module sequence, or option markup, the adapter needs review. In particular, the HTML replacement matches a specific template fragment; it is not an automatic detector for every possible future template layout.

[Return to the README](../readme.md) · [Original issue and solution](issue-and-solution.md)
