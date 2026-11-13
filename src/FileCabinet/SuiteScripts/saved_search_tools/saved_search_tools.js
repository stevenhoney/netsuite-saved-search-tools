/**
 * saved_search_tools.js
 * Companion to the native MCP Standard Tools (ns_listSavedSearches, ns_runSavedSearch).
 * Adds what those lack: inspecting a saved search's definition, and running one with
 * filter or column overrides. Overrides apply to that run only; nothing is ever saved.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType CustomTool
 */
define(['N/search'], function (search) {

    const COLUMN_KEYS = ['name', 'join', 'summary', 'formula', 'function', 'label', 'sort'];
    const MAX_ROWS = 1000;

    function ok(payload) {
        return { result: JSON.stringify(payload) };
    }

    function fail(e) {
        return {
            result: '',
            error: (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e))
        };
    }

    function hasValue(v) {
        return v !== undefined && v !== null && v !== '';
    }

    function loadSearch(args) {
        if (!args || !hasValue(args.searchId)) {
            throw new Error('searchId is required (internal ID or customsearch script ID).');
        }
        const options = { id: String(args.searchId) };
        if (args.type) {
            options.type = args.type;
        }
        return search.load(options);
    }

    function columnToJson(c) {
        const out = {};
        COLUMN_KEYS.forEach(function (k) {
            const v = c[k];
            if (hasValue(v) && !(k === 'sort' && v === 'NONE')) {
                out[k] = v;
            }
        });
        return out;
    }

    function jsonToColumn(c) {
        if (!c || !c.name) {
            throw new Error('Every column needs a name. Got: ' + JSON.stringify(c));
        }
        const options = {};
        COLUMN_KEYS.forEach(function (k) {
            if (hasValue(c[k])) {
                options[k] = c[k];
            }
        });
        return search.createColumn(options);
    }

    function describe(s) {
        let settings = [];
        try {
            settings = (s.settings || []).map(function (x) {
                return { name: x.name, value: x.value };
            });
        } catch (e) { /* settings are optional */ }
        return {
            internalId: s.searchId,
            scriptId: s.id,
            title: s.title,
            type: s.searchType,
            isPublic: s.isPublic,
            filterExpression: s.filterExpression,
            columns: (s.columns || []).map(columnToJson),
            settings: settings
        };
    }

    // Unique, readable key per result column: label if set, otherwise join.name, plus summary.
    function columnKeys(columns) {
        const seen = {};
        return columns.map(function (c) {
            let key = c.label || ((c.join ? c.join + '.' : '') + c.name);
            if (!c.label && c.summary) {
                key = String(c.summary).toLowerCase() + '(' + key + ')';
            }
            seen[key] = (seen[key] || 0) + 1;
            return seen[key] > 1 ? key + '_' + seen[key] : key;
        });
    }

    return {

        savedSearchInspect: async function (args) {
            try {
                return ok(describe(loadSearch(args)));
            } catch (e) {
                return fail(e);
            }
        },

        savedSearchRunWithOverrides: async function (args) {
            try {
                const s = loadSearch(args);
                const overrides = [];

                if (hasValue(args.filterExpression)) {
                    s.filterExpression = args.filterExpression;
                    overrides.push('filterExpression');
                }
                if (hasValue(args.additionalFilters) && args.additionalFilters.length) {
                    const current = s.filterExpression || [];
                    s.filterExpression = current.length
                        ? [current, 'AND', args.additionalFilters]
                        : args.additionalFilters;
                    overrides.push('additionalFilters');
                }
                if (hasValue(args.columns) && args.columns.length) {
                    s.columns = args.columns.map(jsonToColumn);
                    overrides.push('columns');
                }
                if (hasValue(args.additionalColumns) && args.additionalColumns.length) {
                    s.columns = (s.columns || []).concat(args.additionalColumns.map(jsonToColumn));
                    overrides.push('additionalColumns');
                }

                if (!overrides.length) {
                    throw new Error('No overrides given. To run a saved search as it is, use ns_runSavedSearch. ' +
                        'This tool needs additionalFilters, additionalColumns, filterExpression or columns.');
                }

                const start = Math.max(parseInt(args.start, 10) || 0, 0);
                const limit = Math.min(Math.max(parseInt(args.limit, 10) || 100, 1), MAX_ROWS);
                const columns = s.columns || [];
                const keys = columnKeys(columns);

                const rows = s.run().getRange({ start: start, end: start + limit }).map(function (r) {
                    const row = { internalId: r.id };
                    columns.forEach(function (c, i) {
                        const value = r.getValue(c);
                        const text = r.getText(c);
                        row[keys[i]] = (hasValue(text) && text !== value) ? { value: value, text: text } : value;
                    });
                    return row;
                });

                return ok({
                    searchId: s.searchId,
                    title: s.title,
                    type: s.searchType,
                    overridesApplied: overrides,
                    savedSearchChanged: false,
                    filterExpressionUsed: s.filterExpression,
                    columnsUsed: columns.map(columnToJson),
                    start: start,
                    returned: rows.length,
                    hasMore: rows.length === limit,
                    rows: rows
                });
            } catch (e) {
                return fail(e);
            }
        }
    };
});
