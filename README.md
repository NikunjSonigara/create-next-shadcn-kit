# create-next-shadcn-kit

> Create a Next.js app with **shadcn/ui** pre-integrated — zero config.

One command, a fresh Next.js project, Tailwind configured, shadcn/ui initialized, and your favorite components already installed. No juggling two CLIs.

## Usage

```bash
npx create-next-shadcn-kit@latest
```

Or pass a name directly:

```bash
npx create-next-shadcn-kit my-app
```

## What it does

1. Scaffolds a fresh Next.js app via `create-next-app@latest` (App Router, Tailwind, Turbopack).
2. Runs `shadcn@latest init` inside the new project.
3. Pre-installs the shadcn components you selected.
4. Wires up state management — **Redux Toolkit** (default) or **Zustand**, with a sample store and (for Redux) a `<Providers>` wrapper already mounted in `app/layout`.
5. (Optional) Sets up **Husky + lint-staged + Prettier** with a pre-commit hook that runs `eslint --fix` and `prettier --write` on staged files.

You skip the "install Next → read shadcn docs → run a second init → add components one by one" ritual.

## Options

| Flag                                    | Description                         |
| --------------------------------------- | ----------------------------------- |
| `-y, --yes`                             | Skip prompts, use sensible defaults |
| `--ts` / `--js`                         | TypeScript (default) or JavaScript  |
| `--npm` / `--pnpm` / `--yarn` / `--bun` | Pick your package manager           |
| `--no-husky`                            | Skip Husky + lint-staged setup      |
| `--state=<lib>`                         | `redux` (default), `zustand`, `none`|
| `-v, --version`                         | Print version                       |
| `-h, --help`                            | Show help                           |

## Examples

```bash
# Fully interactive
npx create-next-shadcn-kit

# Non-interactive with defaults
npx create-next-shadcn-kit my-app --yes

# Use pnpm
npx create-next-shadcn-kit my-app --pnpm
```

## Requirements

- Node.js **18.17+**
- Network access (to fetch `create-next-app` and `shadcn`)

## Development

```bash
git clone <this-repo>
cd create-next-shadcn-kit
npm install
node bin/index.js test-app --yes
```

## License

MIT
