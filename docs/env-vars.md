# Skill Script Environment Variables

MoFlow injects the following environment variables when executing skill scripts via `run_skill_script`. Skill scripts can access them through `process.env`, or AI can reference them using `${VAR_NAME}` syntax in the `args` parameter.

## System Variables (Injected by MoFlow)

| Variable | Type | Description |
|---|---|---|
| `MOFLOW_WORKSPACE_ROOT` | `string` | The root directory path of the current workspace. Only set when a workspace is open. |
| `MOFLOW_ACTIVE_FILE` | `string` | The absolute file path of the currently active editor tab. Only set when a file is open. |

## User Variables (From Settings)

Users can define custom environment variables in **Settings → Environment Variables**. These are also available to skill scripts via `process.env`.

For example, if a user sets `API_KEY=sk-xxx` in settings, the skill script can read it as:

```typescript
const apiKey = process.env.API_KEY;
```

## `${VAR_NAME}` Placeholder Syntax

When AI calls `run_skill_script`, it can use `${VAR_NAME}` in the `args` parameter. MoFlow resolves these placeholders to their actual values before passing to the script.

For example, when the user says "convert the current document to PPT", AI calls:

```
run_skill_script({script: "convert.js", args: "${MOFLOW_ACTIVE_FILE} --html"})
```

MoFlow resolves `${MOFLOW_ACTIVE_FILE}` to the actual file path, so the script receives:

```
bun convert.js "D:/projects/docs/intro.md" --html
```

### Supported placeholders

| Placeholder | Resolved value |
|---|---|
| `${MOFLOW_WORKSPACE_ROOT}` | Current workspace root path |
| `${MOFLOW_ACTIVE_FILE}` | Currently active file path |
| `${ANY_OTHER_VAR}` | Any user-defined environment variable from Settings |

If a placeholder cannot be resolved, it is left as-is (e.g. `${UNKNOWN_VAR}`).

## Usage Examples

### Read the current file

```typescript
import { readFileSync } from "fs";

const activeFile = process.env.MOFLOW_ACTIVE_FILE;
if (activeFile) {
  const content = readFileSync(activeFile, "utf-8");
  console.log(content);
}
```

### List workspace files

```typescript
import { readdirSync } from "fs";
import { join } from "path";

const root = process.env.MOFLOW_WORKSPACE_ROOT;
if (root) {
  const files = readdirSync(root);
  console.log(files);
}
```

### Use a user-defined API key

```typescript
const apiKey = process.env.MY_API_KEY;
if (!apiKey) {
  console.error("MY_API_KEY not set. Please add it in Settings → Environment Variables.");
  process.exit(1);
}
```

## Notes

- All environment variables are strings. Convert types as needed (e.g., `parseInt(process.env.PORT, 10)`).
- `MOFLOW_WORKSPACE_ROOT` and `MOFLOW_ACTIVE_FILE` use the OS-native path separator (`\` on Windows, `/` on macOS/Linux).
- If no workspace is open, `MOFLOW_WORKSPACE_ROOT` is not set.
- If no file is active, `MOFLOW_ACTIVE_FILE` is not set.
- Always check for `undefined` before using these variables.
- `${VAR_NAME}` placeholders are resolved by MoFlow before the script runs. Scripts receive plain string arguments and do not need to handle `${}` syntax themselves.
