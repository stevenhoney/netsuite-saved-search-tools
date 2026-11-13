// Runs the tool script against a minimal mock of N/search. No NetSuite account needed.
//   node test/mock.test.js
const assert = require('assert');
const path = require('path');

let tools;
global.define = (deps, factory) => {
  const makeSearch = () => ({
    searchId: 12,
    id: 'customsearch_example',
    title: 'Example search',
    searchType: 'transaction',
    isPublic: true,
    filterExpression: [['mainline', 'is', 'T']],
    columns: [{ name: 'tranid', sort: 'ASC' }, { name: 'entity' }, { name: 'amount', summary: 'SUM' }],
    settings: [],
    run() {
      return {
        getRange: () => [{
          id: '7',
          getValue: (c) => (c.name === 'entity' ? '55' : 'value-' + c.name),
          getText: (c) => (c.name === 'entity' ? 'Acme' : null),
        }],
      };
    },
  });
  tools = factory({ load: makeSearch, createColumn: (o) => o });
};
require(path.join(__dirname, '../src/FileCabinet/SuiteScripts/saved_search_tools/saved_search_tools.js'));

(async () => {
  assert.deepStrictEqual(Object.keys(tools), ['savedSearchInspect', 'savedSearchRunWithOverrides']);

  const def = JSON.parse((await tools.savedSearchInspect({ searchId: 12 })).result);
  assert.strictEqual(def.title, 'Example search');
  assert.strictEqual(def.columns.length, 3);
  assert.deepStrictEqual(def.columns[0], { name: 'tranid', sort: 'ASC' });

  const missing = await tools.savedSearchInspect({});
  assert.ok(/searchId is required/.test(missing.error));

  const plain = await tools.savedSearchRunWithOverrides({ searchId: '12' });
  assert.ok(/ns_runSavedSearch/.test(plain.error));

  const run = JSON.parse((await tools.savedSearchRunWithOverrides({
    searchId: '12',
    additionalFilters: JSON.stringify(['trandate', 'within', 'lastmonth']),
    additionalColumns: JSON.stringify([{ name: 'memo', label: 'Memo' }]),
  })).result);
  assert.deepStrictEqual(run.overridesApplied, ['additionalFilters', 'additionalColumns']);
  assert.deepStrictEqual(run.filterExpressionUsed, [[['mainline', 'is', 'T']], 'AND', ['trandate', 'within', 'lastmonth']]);
  assert.deepStrictEqual(run.rows[0].entity, { value: '55', text: 'Acme' });
  assert.strictEqual(run.rows[0]['sum(amount)'], 'value-amount');
  assert.strictEqual(run.rows[0].Memo, 'value-memo');
  assert.strictEqual(run.savedSearchChanged, false);

  const replaced = JSON.parse((await tools.savedSearchRunWithOverrides({
    searchId: '12',
    filterExpression: JSON.stringify([['type', 'anyof', 'SalesOrd']]),
    columns: [{ name: 'tranid' }], // arrays are accepted too
  })).result);
  assert.deepStrictEqual(replaced.filterExpressionUsed, [['type', 'anyof', 'SalesOrd']]);
  assert.deepStrictEqual(replaced.columnsUsed, [{ name: 'tranid' }]);

  const bad = await tools.savedSearchRunWithOverrides({ searchId: '12', additionalFilters: '[not json' });
  assert.ok(/not valid JSON/.test(bad.error));

  JSON.parse(require('fs').readFileSync(path.join(__dirname,
    '../src/FileCabinet/SuiteScripts/saved_search_tools/saved_search_tools_schema.json'), 'utf8'));

  console.log('All mock tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
