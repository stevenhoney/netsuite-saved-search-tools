# NetSuite saved search companion tools

Two custom tools for the [NetSuite AI Connector Service](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_162020236.html) (MCP) that let an AI client see how a saved search is built, and run it with temporary filter or column changes.

They sit alongside Oracle's MCP Standard Tools SuiteApp and fill two gaps in it:

| Job | Tool |
|---|---|
| Find a saved search by name | Native `ns_listSavedSearches` |
| Run a saved search as it is | Native `ns_runSavedSearch` |
| See a saved search's filters and columns | `savedSearchInspect` (this project) |
| Run a saved search with extra or replaced filters or columns | `savedSearchRunWithOverrides` (this project) |

Nothing in this project changes a saved search. Overrides apply to a single run and are never saved.

> **Status:** tested against a NetSuite 2026.2 sandbox account, and the logic is covered by a mock test (`node test/mock.test.js`). Deploy to your own sandbox and try it there before using it in production.

This is an independent project. It is not affiliated with or supported by Oracle NetSuite.

## Requirements

**NetSuite account**

- NetSuite AI Connector Service set up, with the MCP Standard Tools SuiteApp installed
- Features enabled: Server SuiteScript, OAuth 2.0, SuiteCloud Development Framework
- A connector role with MCP Server Connection, Log in using OAuth 2.0 Access Tokens, and Perform Search (view)

**Your machine (to deploy)**

- Node.js
- Java 17 or 21
- SuiteCloud CLI: `npm install -g @oracle/suitecloud-cli`
- A NetSuite role with the SuiteCloud Development Framework permission

## Installation

Custom tools can only be deployed through SDF.

```bash
git clone <this repo's URL>
cd netsuite-saved-search-tools

suitecloud account:setup            # choose your account (sandbox first) and a role with SDF permission
suitecloud project:validate
suitecloud project:deploy
```

Then:

1. In NetSuite, go to Customization > Scripting > Custom Tools and check that **Saved Search Companion Tools** is listed.
2. Make sure your AI client connects to the **all tools** URL (see below), then disconnect and reconnect so it picks up the new tools.

### Use the "all" server URL

This project deploys as an account customization project, and NetSuite only exposes those tools on one of its two MCP server URLs:

| URL | Tools it returns |
|---|---|
| `https://<accountid>.suitetalk.api.netsuite.com/services/mcp/v1/suiteapp/com.netsuite.mcpstandardtools` | The native MCP Standard Tools only |
| `https://<accountid>.suitetalk.api.netsuite.com/services/mcp/v1/all` | The native tools plus custom tools, including these |

If your client was set up with the first URL, the tools will show on the Custom Tools page in NetSuite but never appear in the client. Add a custom connector that points at the `/all` URL instead. For a sandbox the account ID looks like `1234567-sb1`.

The deploy adds three things to the account:

- `/SuiteScripts/saved_search_tools/saved_search_tools.js`
- `/SuiteScripts/saved_search_tools/saved_search_tools_schema.json`
- A toolset object, `custtoolset_savedsearch`

### Who can see the tools

The toolset is visible to any role with Perform Search at view level. To change that, edit the `<permissions>` block in `src/Objects/custtoolset_savedsearch.xml` and redeploy. Results always follow the role's own data permissions.

## Usage

Just ask in plain language. The tool descriptions tell the AI client when to use these tools and when to use the native ones.

| You ask | What gets called |
|---|---|
| "What are the criteria and columns on the Open Purchase Orders search?" | `ns_listSavedSearches`, then `savedSearchInspect` |
| "Run the Open Purchase Orders search" | `ns_runSavedSearch` |
| "Run Open Purchase Orders, but only for last month, and add the memo column" | `savedSearchInspect`, then `savedSearchRunWithOverrides` |

### `savedSearchInspect`

| Input | Required | Notes |
|---|---|---|
| `searchId` | Yes | Internal ID, or script ID starting with `customsearch` |
| `type` | No | Only for standalone search types (for example `DeletedRecord`, `Role`) |

Returns a JSON string:

```json
{
  "internalId": 123,
  "scriptId": "customsearch_open_pos",
  "title": "Open Purchase Orders",
  "type": "transaction",
  "isPublic": true,
  "filterExpression": [["type", "anyof", "PurchOrd"], "AND", ["mainline", "is", "T"]],
  "columns": [
    { "name": "tranid", "sort": "ASC" },
    { "name": "entity" },
    { "name": "amount", "label": "Total" }
  ],
  "settings": []
}
```

### `savedSearchRunWithOverrides`

| Input | Required | Notes |
|---|---|---|
| `searchId` | Yes | Internal ID or script ID |
| `type` | No | Only for standalone search types |
| `additionalFilters` | One of these four | JSON string. Filter expression ANDed onto the existing criteria |
| `filterExpression` | One of these four | JSON string. Replaces the criteria entirely for this run |
| `additionalColumns` | One of these four | JSON string. Array of columns appended to the existing ones |
| `columns` | One of these four | JSON string. Array of columns that replaces the columns entirely for this run |
| `start` | No | Zero-based first row. Default 0 |
| `limit` | No | Rows to return. Default 100, maximum 1000 |

Called without any override, it returns an error pointing to `ns_runSavedSearch`. That keeps plain runs on the native tool.

Filters and columns are passed as JSON strings, because NetSuite custom tool inputs can only be strings, numbers or booleans. Your AI client handles this for you.

Example input:

```json
{
  "searchId": "customsearch_open_pos",
  "additionalFilters": "[\"trandate\",\"within\",\"lastmonth\"]",
  "additionalColumns": "[{\"name\":\"memo\",\"label\":\"Memo\"}]",
  "limit": 200
}
```

A column takes `name` (required), `join`, `summary`, `formula`, `function`, `label` and `sort`. For formula columns use a name such as `formulatext` or `formulanumeric` and put the expression in `formula`.

The response echoes the filters and columns actually used, plus `rows`, `returned`, `hasMore` and `savedSearchChanged: false`. Each row is keyed by column label, or by `join.name` (wrapped in the summary type, such as `sum(amount)`) when there is no label. Select and list fields come back as `{ "value": "...", "text": "..." }`.

## Limitations

- Only what SuiteScript's `N/search` module exposes is shown: criteria, result columns, title, public flag and settings. Audience, available filters, highlighting and email alerts are not.
- In a summary search, every added column needs a `summary` type.
- A maximum of 1000 rows per call. Page with `start` and `limit`.
- The tools run as the connected user's role, so a search or field that role can't see will fail or come back empty.

## Development

```bash
node test/mock.test.js
```

The test loads the tool script against a small mock of `N/search`, so it needs no NetSuite account.

## Uninstall

Delete the toolset under Customization > Scripting > Custom Tools, then remove the `/SuiteScripts/saved_search_tools` folder from the File Cabinet.

## Licence

Released into the public domain under [The Unlicense](LICENSE). Do what you like with it. It comes with no warranty.
