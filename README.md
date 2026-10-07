# claude-context-bar

A live context-window usage bar above the Claude Code prompt.

```
ctx ████████████████░░░░░░░░░░░░░░░ 52% · 104k / 200k [ Details ]
```

It updates after every turn and changes colour as the window fills: green below 70%, yellow from 70%, red from 85%. It reads the same figures as the status line, so it makes no extra API calls.

## Usage

| Command | What it does |
| --- | --- |
| `/context-bar` | Show or hide the bar |
| `/context-details` | Show or hide the `/context`-style breakdown in a side pane (also the bar's **Details** button) |

### Options

You're asked for these when installing; change them later in `/config` (or `/plugin configure context-bar@claude-context-bar`).

| `show` | The bar at session start |
| --- | --- |
| `on-demand` (default) | Hidden until `/context-bar` |
| `always` | Shown; `/context-bar` hides it for the session |
| `remember` | As `/context-bar` last left it, across sessions |

## Install

In a Claude Code terminal session:

```
/plugin install context-bar --marketplace imranbarbhuiya/claude-context-bar
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Develop

The `claude-code` module is provided by Claude Code at runtime, not npm. Its type declarations are generated into `.claude-plugin/types/` (gitignored) whenever Claude Code loads this folder directly, so run `claude --plugin-dir .` once after cloning and after upgrading Claude Code to get editor types.

```sh
claude --plugin-dir .          # run Claude Code with the local copy loaded
claude plugin validate .       # check the manifest and hooks module
claude plugin test .           # run the tests in tests/
```

## License

MIT
