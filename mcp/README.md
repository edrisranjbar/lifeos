# LifeOS MCP server

Local stdio server using the official [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server), Node 22.9+ (24 recommended) and Zod validation. All tools call LifeOS /api/v1 over HTTP. No SQL, filesystem, arbitrary state-key, config or credential-management tools are exposed.

## Install and run

```sh
cd mcp
npm ci
cp .env.example .env
npm start
```

Set the ignored .env:

```dotenv
LIFEOS_BASE_URL=https://lifeos.example.com
LIFEOS_API_TOKEN=replace-with-your-dedicated-random-token
LIFEOS_MCP_TIMEOUT_MS=10000
```

Use the same dedicated token configured in PHP (at least 32 characters; generate 32 random bytes). Install the API first. Remote origins require verified HTTPS; HTTP is permitted only for localhost/127.0.0.1/::1 development. URL credentials, query strings and subpaths are rejected. Redirects are rejected to prevent forwarding credentials. Timeout covers response parsing and must be 100–120000 ms. Stdout contains only protocol messages; startup/errors do not log tokens or upstream response bodies.

npm start loads .env from mcp. Clients that launch node src/index.js directly must supply environment values. Do not commit real client configs or tokens.

## Client configuration

Desktop clients supporting mcpServers JSON configuration:

```json
{
  "mcpServers": {
    "lifeos": {
      "command": "node",
      "args": ["/absolute/path/lifeos/mcp/src/index.js"],
      "env": {
        "LIFEOS_BASE_URL": "https://lifeos.example.com",
        "LIFEOS_API_TOKEN": "replace-with-your-dedicated-random-token"
      }
    }
  }
}
```

For Codex, set the token in its launch environment and forward it in user ~/.codex/config.toml, following the [official OpenAI documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli):

```toml
[mcp_servers.lifeos]
command = "node"
args = ["/absolute/path/lifeos/mcp/src/index.js"]
env_vars = ["LIFEOS_API_TOKEN"]

[mcp_servers.lifeos.env]
LIFEOS_BASE_URL = "https://lifeos.example.com"
LIFEOS_MCP_TIMEOUT_MS = "10000"
```

Use actual absolute paths. No client configuration is installed automatically. This implementation is stdio only; clients requiring a remote MCP URL need a separate authenticated transport bridge/server. /api/v1 is not an MCP transport URL.

## Tools

| Domain | Tools |
| --- | --- |
| Read anything | lifeos_query |
| Goals | lifeos_create_goal, lifeos_update_goal, lifeos_delete_goal |
| Tasks | lifeos_create_task, lifeos_update_task, lifeos_complete_task, lifeos_delete_task |
| Habits | lifeos_complete_habit, lifeos_uncomplete_habit |
| Finance | lifeos_log_expense, lifeos_set_income |
| Notes | lifeos_create_note, lifeos_update_note, lifeos_delete_note |

All reads go through the read-only lifeos_query tool. Its type picks what to read: dashboard, goals, goal, tasks, task, habits, today_habits, finance_summary, expenses, incomes, notes or note. goal, task and note require id. tasks takes optional source, goal_id, board_id and column_id filters; task takes source, goal_id and board_id to resolve ambiguous IDs. finance_summary, expenses and incomes take an optional period. notes and note take include_secret. Parameters that don't apply to the chosen type are rejected before any request is made. Writes stay as separate tools, so each one gets its own approval prompt and destructive ones stay marked.

**Upgrading from 1.x:** version 2.0.0 replaces the 12 read tools (lifeos_dashboard, lifeos_list_goals, lifeos_get_goal, lifeos_list_tasks, lifeos_get_task, lifeos_list_habits, lifeos_get_today_habits, lifeos_finance_summary, lifeos_list_expenses, lifeos_list_incomes, lifeos_list_notes, lifeos_get_note) with lifeos_query. For example, lifeos_get_goal with { id } becomes lifeos_query with { type: "goal", id }. Clients that call the old names directly need updating; clients that discover tools at startup only need a restart.

Updates take id and a patch object. Goal measures/tasks supplied in a patch replace their lists; omitted fields survive. Task creation requires source and container IDs. Task update/complete/delete optionally take source/container filters to resolve ambiguous IDs; query tasks first to obtain IDs. Finance amounts are Toman; period defaults to active. Habit dates default to Tehran today. Completion/uncompletion/set-income are idempotent. Deletes permanently remove data and are explicitly marked destructive; approval behavior is controlled by the client.

Secret notes are omitted by default, including direct lookup. Explicit include_secret: true on a notes/note query or on update/delete requires server permission. Dashboard never includes secrets. No tool returns the token. Success returns concise JSON text and structured {data: ...}; failures have isError: true and safe code/message/status.

Example prompts:

- Show me my LifeOS dashboard.
- Create a SMART goal called Build dream home studio, due in three months.
- Add Buy acoustic panels as a task to that goal.
- Mark Reading complete for today.
- Log a 450,000 Toman food expense.
- Show my current financial balance.
- Create a note called Studio Ideas.

Reload the browser after external edits. Stale UI saves return conflicts instead of replacing API changes. A network timeout can happen after a write commits; inspect saved state before retrying non-idempotent create/expense calls.

## Tests

```sh
npm test
```

Mocked errors/timeouts/malformed responses, schemas and a real stdio handshake run by default. For disposable MySQL/API integration, follow the root README and set LIFEOS_TEST_BASE_URL=http://localhost:8000. Integration refuses remote hosts and requires tests/mysql_fixture.php; it never loads production config.
