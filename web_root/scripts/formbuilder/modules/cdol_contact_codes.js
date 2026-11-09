/* Enrollment Express contact dropdown and card customizations. */
(function () {
    "use strict";
    const fields = [
        "U_PERSON_ADDITIONAL_INFO.PERSON_RELIGION",
        "U_PERSON_ADDITIONAL_INFO.PERSON_PARISH_STATE",
        "U_PERSON_ADDITIONAL_INFO.PERSON_EMPLOYER_STATE"
    ];
    const relationshipExtension = "u_studentcontactdetail_cdol";
    const relationshipFlags = [
        { name: "financiallyresponsibleflg", label: "Financially Responsible" },
        { name: "schoolmessengerflg", label: "School Messenger" }
    ];
    const relationshipDetails = new Map();
    const approvalWrites = new WeakMap();
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

    function asArray(value) {
        return Array.isArray(value) ? value : value ? [value] : [];
    }

    function flagValue(fields, name) {
        const field = asArray(fields).find((item) => item.name === name);
        if (!field) { return undefined; }
        return field.value === true || field.value === "true" || field.value === 1 || field.value === "1";
    }

    function submittedFlags(contact) {
        return asArray(contact && contact.extensions).find((table) => table.extensionname === relationshipExtension);
    }

    function isNewContact(contact) {
        return contact && contact.status === "new" && !contact.id;
    }

    function relationshipChanges(contact) {
        const submitted = submittedFlags(contact);
        if (!submitted || contact.status === "deleted" || (!isNewContact(contact) && !/^\d+$/.test(contact.id))) { return []; }
        return relationshipFlags.flatMap(({ name }) => {
            const value = flagValue(submitted.fields, name);
            return value === undefined ? [] : [{ name, type: "Boolean", value: String(value) }];
        });
    }

    function detailFields(extension) {
        const table = asArray(extension && extension._extension_data && extension._extension_data._table_extension)
            .find((item) => item.name === relationshipExtension);
        return table && table._field;
    }

    function currentStudent(scope) {
        const frn = scope.formParams && scope.formParams.frn;
        return frn && String(frn).substring(3);
    }

    function relationshipKey(student, contact) {
        return `${student}:${contact}`;
    }

    function setFlag(contact, name, value) {
        contact.extensions = asArray(contact.extensions);
        let table = submittedFlags(contact);
        if (!table) {
            table = { tablename: relationshipExtension, extensionname: relationshipExtension, fields: [] };
            contact.extensions.push(table);
        }
        table.fields = asArray(table.fields).filter((field) => field.name !== name);
        table.fields.push({ name, type: "Boolean", value: String(value) });
    }

    function addRelationshipCards(html) {
        if (html.includes("cdolRelationshipValue(contact")) { return html; }
        const mailRow = /<div style="height: 25px !important;">\s*<span class="contactSpan" ng-class="statusChangeClass\(contact\.receivesmailflg\)"[\s\S]*?<\/div>/g;
        return html.replace(mailRow, (row) => row + relationshipFlags.map(({ name, label }) => {
            const value = `cdolRelationshipValue(contact, '${name}')`;
            return `
            <div style="height: 25px !important;" ng-if="${value} !== undefined">
                <span class="contactSpan" ng-class="statusChangeClass(${value} ? 1 : 0)" role="img" aria-label="{{${value} ? 'Yes' : 'No'}}"></span>
                <label class="contactLabel">${label}</label>
            </div>`;
        }).join(""));
    }

    function addRelationshipControls(html) {
        if (html.includes("cdolSetRelationshipFlag")) { return html; }
        const mailRow = /(<td id="receivesmailflgCol"[\s\S]*?<\/td>\s*<\/tr>)/;
        const disabled = "!hasPermission() || !elementPermission(element.elementpermission)";
        const messages = "eec.html.scripts_formbuilder_partials_dialogs.responder_contactdetail.addcontact_recievesmail";
        return html.replace(mailRow, (row) => row + relationshipFlags.map(({ name, label }) => `
            <tr style="display: block; padding-top: 10px !important; padding-bottom: 10px !important;"
                ng-if="cdolCanEditRelationship(currentContact)">
                <td tabindex="0" id="cdol-${name}-label">${label}</td>
            </tr>
            <tr style="display: block;" ng-if="cdolCanEditRelationship(currentContact)">
                <td role="radiogroup" aria-labelledby="cdol-${name}-label"
                    ng-init="cdolFlagChoice = cdolRelationshipValue(currentContact, '${name}')">
                    <input id="cdol-${name}-yes" type="radio" name="cdol-${name}" style="transform: scale(1.5);"
                           ng-model="cdolFlagChoice" ng-value="true" ng-disabled="${disabled}"
                           ng-change="cdolSetRelationshipFlag(currentContact, '${name}', cdolFlagChoice)"><label for="cdol-${name}-yes"
                           style="margin-inline-end: 39px; margin-inline-start: 10px; font-weight:400;">{{commonMessageKeys['${messages}yes'] || 'Yes'}}</label>
                    <input id="cdol-${name}-no" type="radio" name="cdol-${name}" style="transform: scale(1.5);"
                           ng-model="cdolFlagChoice" ng-value="false" ng-disabled="${disabled}"
                           ng-change="cdolSetRelationshipFlag(currentContact, '${name}', cdolFlagChoice)"><label for="cdol-${name}-no"
                           style="margin-inline-end: 39px; margin-inline-start: 10px; font-weight:400;">{{commonMessageKeys['${messages}no'] || 'No'}}</label>
                </td>
            </tr>`).join(""));
    }

    function mergeRelationshipFlags(associations, contact, student) {
        if (isNewContact(contact)) { return; }
        const flags = relationshipChanges(contact);
        if (!flags.length || !student) { return; }
        const association = asArray(associations).find((item) => String(item.dcid) === student);
        const detail = association && asArray(association.studentDetails)[0];
        if (!detail || !detail.studentContactDetailId || detail.deleted) { return; }
        const original = relationshipDetails.get(relationshipKey(student, contact.id));
        if (original && String(original.id) !== String(detail.studentContactDetailId)) { return; }

        approvalWrites.set(association, { detailId: detail.studentContactDetailId, flags });
        applyRelationshipFields(detail, flags);
    }

    function applyRelationshipFields(detail, flags) {
        const extension = angular.copy(detail.contactStudentDetailExtension) || { id: detail.studentContactDetailId };
        const data = extension._extension_data || (extension._extension_data = {});
        const tables = data._table_extension = asArray(data._table_extension);
        let table = tables.find((item) => item.name === relationshipExtension);
        if (!table) {
            table = { name: relationshipExtension, _field: [] };
            tables.push(table);
        }
        table._field = asArray(table._field).filter((field) => !flags.some((flag) => flag.name === field.name)).concat(flags);
        detail.contactStudentDetailExtension = extension;
    }

    function readStudentContacts($http, student) {
        return $http.get(`/ws/contacts/student/${student}?extensions=${relationshipExtension}`, { cache: false })
            .then(({ data }) => {
                if (!Array.isArray(data)) { throw new Error("PowerSchool did not return the student contacts."); }
                return data;
            });
    }

    function studentRelationships(contacts, student) {
        return contacts.flatMap((contact) => asArray(contact.contactStudents)
            .filter((association) => association.studentContactId && !association.deleted && String(association.dcid) === student)
            .map((association) => ({ contact, association })));
    }

    function newRelationship(before, after, draft, selectedId) {
        const known = new Set(before.map(({ association }) => String(association.studentContactId)));
        const normalize = (value) => String(value || "").trim().toLowerCase();
        const candidates = after.filter(({ contact, association }) => {
            if (known.has(String(association.studentContactId))) { return false; }
            if (selectedId) { return String(contact.contactId) === selectedId; }
            return String(association.sequence) === String(draft.contactpriorityorder) &&
                normalize(contact.firstName) === normalize(draft.firstname) &&
                normalize(contact.middleName) === normalize(draft.middlename) &&
                normalize(contact.lastName) === normalize(draft.lastname);
        });
        if (candidates.length !== 1) { throw new Error("Could not identify the newly created student-contact relationship."); }
        const { contact, association } = candidates[0];
        const details = asArray(association.studentDetails).filter((detail) =>
            detail.active && !detail.deleted && detail.studentContactDetailId);
        if (details.length !== 1) { throw new Error("Could not identify the new relationship detail."); }
        return { contactId: contact.contactId, association, detailId: details[0].studentContactDetailId };
    }

    function verifyRelationshipWrite($http, form, contactId, association, write) {
        const { detailId, flags } = write;
        function readRelationship() {
            return readStudentContacts($http, association.dcid)
                .then((data) => {
                    const contact = data.find((item) => String(item.contactId) === String(contactId));
                    const current = asArray(contact && contact.contactStudents).find((item) =>
                        item.studentContactId && (!association.studentContactId ||
                            String(item.studentContactId) === String(association.studentContactId)) &&
                        String(item.dcid) === String(association.dcid) && !item.deleted &&
                        asArray(item.studentDetails).some((detail) => String(detail.studentContactDetailId) === String(detailId)));
                    const detail = asArray(current && current.studentDetails).find((item) =>
                        String(item.studentContactDetailId) === String(detailId) && !item.deleted);
                    if (!detail) { throw new Error("The original student-contact relationship could not be read."); }
                    const fields = detailFields(detail.contactStudentDetailExtension);
                    const missing = flags.filter((flag) => flagValue(fields, flag.name) !== (flag.value === "true"));
                    return { current, detail, missing };
                });
        }

        return readRelationship().then(({ current, detail, missing }) => {
            if (!missing.length) { return; }
            // Match the native Student Contacts writer: send only the changed extension values.
            detail.contactStudentDetailExtension = { id: detailId };
            applyRelationshipFields(detail, missing.map(({ name, value }) => ({ name, value })));
            return form.updateAssociationContactInSIS(current, contactId).then((response) => {
                if (response.status !== 200 || (response.data && response.data.status === "ERROR")) {
                    throw new Error("PowerSchool rejected the relationship update.");
                }
                return readRelationship().then(({ missing }) => {
                    if (missing.length) { throw new Error("PowerSchool did not persist the submitted permissions."); }
                });
            });
        });
    }

    function configure() {
        if (registered) { return; }
        registered = true;
        angular.module("responderForm").config(["$provide", "$httpProvider", function ($provide, $httpProvider) {
            $httpProvider.interceptors.push(function () {
                return {
                    request(config) {
                        if (config.method === "GET" && /^\/ws\/contacts\/student\/\d+\?extensions=/.test(config.url) &&
                            !config.url.toLowerCase().includes(relationshipExtension)) {
                            config.url += "," + relationshipExtension;
                        }
                        return config;
                    },
                    response(response) {
                        const match = /^\/ws\/contacts\/student\/(\d+)\?extensions=/.exec(response.config.url);
                        if (match && Array.isArray(response.data)) {
                            const student = match[1];
                            response.data.forEach((contact) => {
                                const association = asArray(contact.contactStudents).find((item) => String(item.dcid) === student);
                                const detail = association && asArray(association.studentDetails)[0];
                                const extension = detail && detail.contactStudentDetailExtension;
                                if (extension && String(extension["@extensions"]).toLowerCase().split(",").includes(relationshipExtension)) {
                                    relationshipDetails.set(relationshipKey(student, contact.contactId), extension);
                                }
                            });
                        }
                        return response;
                    }
                };
            });

            $provide.decorator("form", ["$delegate", "$rootScope", "$http", "$q", function (form, root, $http, $q) {
                // Current Enrollment Express versions deliver contacts on the server before final form approval.
                const upsert = form.upsertContactForGA;
                form.upsertContactForGA = function (payload) {
                    const content = root.formContent;
                    if (!payload.responder || !content || !content.response ||
                        String(payload.responseid) !== String(content.response.id)) {
                        return upsert.apply(this, arguments);
                    }

                    const student = currentStudent(root);
                    const element = asArray(content.elements).find((item) => item.type === "contacts");
                    const changes = asArray(element && element.contacts).flatMap((contact) => {
                        const flags = relationshipChanges(contact);
                        if (!flags.length) { return []; }
                        if (isNewContact(contact)) { return [{ draft: contact, flags }]; }
                        const detail = relationshipDetails.get(relationshipKey(student, contact.id));
                        const reviewed = asArray(root.originalContactList).find((item) => String(item.id) === String(contact.id));
                        return [{ contactId: contact.id, detailId: detail && detail.id, flags, reviewed }];
                    });
                    if (!changes.length) { return upsert.apply(this, arguments); }

                    const failure = (errorMessage) => ({
                        status: 409,
                        data: { errorCode: 99, errorMessage, traceId: "" }
                    });
                    if (!student || changes.some(({ draft, contactId, detailId, reviewed }) => !draft && (!detailId ||
                        (reviewed && reviewed.status === "rowMatch" &&
                            String(reviewed.selectedMatchedContactId) !== String(contactId))))) {
                        return $q.when(failure("The submitted permissions could not be matched to their original student-contact relationship."));
                    }

                    const hasNewContacts = changes.some(({ draft }) => draft);
                    const before = hasNewContacts ? readStudentContacts($http, student) : $q.when([]);
                    return before.then((previous) => upsert.apply(this, arguments).then((response) => {
                        if (response.status !== 200 || (response.data && response.data.errorCode !== undefined)) {
                            return response;
                        }
                        const after = hasNewContacts ? readStudentContacts($http, student) : $q.when([]);
                        return after.then((current) => {
                            const beforeRelationships = studentRelationships(previous, student);
                            const afterRelationships = studentRelationships(current, student);
                            const targets = changes.map((change) => {
                                if (!change.draft) { return { ...change, association: { dcid: student } }; }
                                const prefix = `${change.draft.contactpriorityorder}-`;
                                const match = asArray(payload.matchContactIds).find((id) => String(id).startsWith(prefix));
                                return {
                                    ...newRelationship(beforeRelationships, afterRelationships, change.draft, match && String(match).slice(prefix.length)),
                                    flags: change.flags
                                };
                            });
                            if (new Set(targets.map(({ detailId }) => String(detailId))).size !== targets.length) {
                                throw new Error("Multiple submitted contacts resolved to the same relationship detail.");
                            }
                            // Sequence writes so approval cannot finish before all affected relationships are verified.
                            return targets.reduce((pending, target) => pending.then(() =>
                                verifyRelationshipWrite($http, form, target.contactId, target.association, target)
                            ), $q.when()).then(() => response);
                        });
                    })).catch(() => failure(
                        "PowerSchool could not verify the submitted Financially Responsible or School Messenger permissions. Check Student Contacts before retrying approval."
                    ));
                };

                const create = form.createContactStudents;
                form.createContactStudents = function (contact) {
                    const associations = create.apply(this, arguments);
                    mergeRelationshipFlags(associations, contact, currentStudent(root));
                    return associations;
                };
                const matched = form.getMatchedContactStudentsJSON;
                form.getMatchedContactStudentsJSON = function (contact, status, association, matchedContactId) {
                    const associations = matched.apply(this, arguments);
                    if (contact && String(contact.id) === String(matchedContactId)) {
                        mergeRelationshipFlags(associations, contact, currentStudent(root));
                    }
                    return associations;
                };
                const deliver = form.updateContactInSIS;
                form.updateContactInSIS = function (payload) {
                    const association = asArray(payload.contactStudents).find((item) => approvalWrites.has(item));
                    const write = association && approvalWrites.get(association);
                    const request = deliver.apply(this, arguments);
                    if (!write) { return request; }
                    return request.then((response) => {
                        if (response.status !== 200 || !response.data || response.data.status !== "VALID") {
                            return response;
                        }
                        return verifyRelationshipWrite($http, form, payload.contactId, association, write)
                            .then(() => response, () => ({
                                status: 200,
                                data: {
                                    status: "ERROR",
                                    error_message: { error: "The contact was updated, but PowerSchool could not verify the Financially Responsible and School Messenger permissions. Check Student Contacts and retry approval." }
                                }
                            }));
                    });
                };
                const review = form.checkCustomExtensionFieldsupdate;
                form.checkCustomExtensionFieldsupdate = function (sisContact, contact) {
                    const changed = review.apply(this, arguments);
                    const submitted = submittedFlags(contact);
                    if (!submitted) { return changed; }
                    const extension = relationshipDetails.get(relationshipKey(currentStudent(root), contact.id));
                    let flagsChanged = false;
                    relationshipFlags.forEach(({ name, label }) => {
                        const value = flagValue(submitted.fields, name);
                        const previous = extension && Boolean(flagValue(detailFields(extension), name));
                        if (value === undefined || value === previous) { return; }
                        root.customExtensionFields.push({
                            labelname: label, oldvalue: previous === undefined ? "" : previous ? "Yes" : "No",
                            newvalue: value ? "Yes" : "No", updated: true
                        });
                        flagsChanged = true;
                    });
                    return changed || flagsChanged;
                };
                return form;
            }]);

            $provide.decorator("contactsElementDirective", ["$delegate", "$rootScope", function (definitions, root) {
                definitions.forEach((definition) => {
                    const link = definition.link;
                    if (typeof link !== "function") { return; }
                    definition.link = function (scope) {
                        link.apply(this, arguments);
                        const existingRelationship = (contact) => contact &&
                            relationshipDetails.get(relationshipKey(currentStudent(root), contact.id));
                        scope.cdolCanEditRelationship = (contact) => isNewContact(contact) || Boolean(existingRelationship(contact));
                        scope.cdolRelationshipValue = (contact, name) => {
                            const submitted = submittedFlags(contact);
                            const pending = submitted && flagValue(submitted.fields, name);
                            if (typeof pending === "boolean") { return pending; }
                            const extension = existingRelationship(contact);
                            return extension ? Boolean(flagValue(detailFields(extension), name)) : undefined;
                        };
                        scope.cdolSetRelationshipFlag = (contact, name, value) => setFlag(contact, name, value);
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
                            const updated = addRelationshipCards(addMailingPermission(html));
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
                        html = addRelationshipControls(html);
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
