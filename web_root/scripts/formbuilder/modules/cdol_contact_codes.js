/* Enrollment Express contact dropdown and card customizations. */
(function () {
    "use strict";
    const fields = [
        "U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION",
        "U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE",
        "U_PERSON_ADDITIONAL_INFO.PERSON_EMPLOYER_STATE"
    ];
    let registered = false;

    function applies(field) {
        return field && fields.indexOf(`${field.tableName}.${String(field.columnName).toUpperCase()}`) !== -1;
    }

    function addMailingPermission(html) {
        if (html.includes("statusChangeClass(contact.receivesmailflg)")) { return html; }

        // Insert after Emergency Contact in both the standard and custom card layouts.
        const emergencyContactRow = /<div\s+style="height: 25px !important;">\s*<span class="contactSpan" ng-class="statusChangeClass\(contact\.isemergency\)"><\/span>[\s\S]*?<\/div>/g;
        return html.replace(emergencyContactRow, (row) => `${row}
            <div style="height: 25px !important;">
                <span class="contactSpan" ng-class="statusChangeClass(contact.receivesmailflg)" role="img" aria-label="{{contact.receivesmailflg == 1 ? 'Yes' : 'No'}}"></span>
                <label class="contactLabel">{{commonMessageKeys['eec.html.scripts_formbuilder_partials_dialogs.responder_contactdetail.addcontact_recievesmail'] || 'Receives Mailings'}}</label>
            </div>`);
    }

    function configure() {
        if (registered) { return; }
        registered = true;
        angular.module("responderForm").config(["$provide", function ($provide) {
            $provide.decorator("contactsElementDirective", ["$delegate", function (definitions) {
                definitions.forEach((definition) => {
                    const link = definition.link;
                    if (typeof link !== "function") { return; }
                    definition.link = function (scope) {
                        link.apply(this, arguments);
                        const getValue = scope.getCustomFieldValue;
                        scope.getCustomFieldValue = function (field, contact) {
                            if (!applies(field) || !contact || field.inputType !== "dropdown") {
                                return getValue.apply(this, arguments);
                            }
                            const key = `${field.tableName}_${field.columnName.toLowerCase()}`;
                            let raw = contact[`${key}_id`];
                            if (raw === undefined) {
                                const extensions = Array.isArray(contact.extensions) ? contact.extensions : [];
                                const extension = extensions.find((item) =>
                                    item.tablename === field.tableName.toLowerCase() &&
                                        item.extensionname === field.extensionName.toLowerCase()
                                );
                                const saved = extension && Array.isArray(extension.fields) && extension.fields.find((item) =>
                                    item.name === field.columnName.toLowerCase()
                                );
                                raw = saved ? saved.value : "";
                            }
                            const option = scope.getCodesetOptions(field.codesetId).find((item) =>
                                String(item.codesetid) === String(raw) || String(item.code) === String(raw) ||
                                    String(item.displayvalue) === String(raw)
                            );
                            contact[key] = contact[`${key}_id`] = option ? option.code : raw;
                        };
                    };
                    definition.compile = () => definition.link;
                });
                return definitions;
            }]);
            $provide.decorator("$templateRequest", ["$delegate", "$templateCache", function (load, cache) {
                function request(url, ignoreError) {
                    return load(url, ignoreError).then((html) => {
                        const path = String(url).split("?")[0];
                        if (path === "/scripts/formbuilder/partials/elements/contacts.element.html") {
                            const updated = addMailingPermission(html);
                            cache.put(url, updated);
                            return updated;
                        }
                        if (path !== "/scripts/formbuilder/partials/dialogs/responder.customcontactdetail.html") { return html; }
                        const model = "currentContact[field.tableName+'_'+field.columnName.toLowerCase()+'_id']";
                        const match = `${JSON.stringify(fields).replace(/"/g, "'")}.indexOf(field.tableName+'.'+field.columnName.toUpperCase()) !== -1`;
                        const value = `(${match}) ? option.code : option.codesetid`;
                        html = html.replace(
                            `ng-selected="option.codesetid == ${model}" value="{{option.codesetid}}"`,
                            `ng-selected="(${value}) == ${model}" value="{{${value}}}"`
                        );
                        cache.put(url, html);
                        return html;
                    });
                }
                Object.defineProperty(request, "totalPendingRequests", { get: () => load.totalPendingRequests });
                return request;
            }]);
        }]);
    }

    function attach() {
        if (typeof window.requirejs !== "function") { return false; }
        const previous = window.requirejs.onResourceLoad;
        window.requirejs.onResourceLoad = function (context, map, dependencies) {
            if (previous) { previous.apply(this, arguments); }
            if (map && map.name === "main") { configure(); }
        };
        return true;
    }
    if (!attach()) {
        document.addEventListener("load", function loaded(event) {
            if (event.target && event.target.tagName === "SCRIPT" && attach()) {
                document.removeEventListener("load", loaded, true);
            }
        }, true);
    }
}());
