import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { run } from "./utils.js";

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");

// Read a template file shipped with the package. Templates are real, lintable
// source files; callers apply any substitutions (e.g. the import alias).
export function readTemplate(...segments) {
    return fs.readFileSync(path.join(TEMPLATES_DIR, ...segments), "utf8");
}

export async function scaffold(config) {
    const cwd = process.cwd();
    const projectPath = path.resolve(cwd, config.projectName);

    // pnpm 10+/11 defaults strictDepBuilds=true, so unapproved dependency build
    // scripts (e.g. sharp, unrs-resolver pulled in by shadcn) abort the install
    // in a non-interactive run. Downgrade it to a warning for all child pnpm
    // processes; respect an explicit override if the user already set one.
    if (config.packageManager === "pnpm" && process.env.pnpm_config_strict_dep_builds === undefined) {
        process.env.pnpm_config_strict_dep_builds = "false";
    }

    if (fs.existsSync(projectPath) && fs.readdirSync(projectPath).length > 0) {
        throw new Error(`Directory "${config.projectName}" already exists and is not empty.`);
    }

    console.log();
    console.log(pc.cyan("◆") + " Creating Next.js app...");
    console.log();

    const cnaArgs = [
        "create-next-app@latest",
        config.projectName,
        config.typescript ? "--typescript" : "--javascript",
        config.eslint ? "--eslint" : "--no-eslint",
        "--tailwind",
        "--app",
        config.srcDir ? "--src-dir" : "--no-src-dir",
        "--turbopack",
        `--import-alias=${config.importAlias}`,
        `--use-${config.packageManager}`,
        "--yes",
    ];

    await run("npx", cnaArgs);

    if (config.packageManager === "pnpm") {
        writePnpmBuildConfig(projectPath);
    }

    console.log();
    console.log(pc.cyan("◆") + " Initializing shadcn/ui...");
    console.log();

    const shadcnRunner = runnerFor(config.packageManager);

    await run(shadcnRunner.cmd, [...shadcnRunner.args, "shadcn@latest", "init", "--yes", "--defaults"], { cwd: projectPath });

    if (config.components.length > 0) {
        console.log();
        console.log(pc.cyan("◆") + ` Adding components: ${pc.dim(config.components.join(", "))}`);
        console.log();

        await run(shadcnRunner.cmd, [...shadcnRunner.args, "shadcn@latest", "add", ...config.components, "--yes"], { cwd: projectPath });
    }

    if (config.state === "redux") {
        await setupRedux(projectPath, config);
    } else if (config.state === "zustand") {
        await setupZustand(projectPath, config);
    }

    if (config.husky) {
        await setupHusky(projectPath, config);
    }
}

function appDirFor(projectPath, config) {
    return config.srcDir ? path.join(projectPath, "src", "app") : path.join(projectPath, "app");
}

function storeDirFor(projectPath, config) {
    return config.srcDir ? path.join(projectPath, "src", "store") : path.join(projectPath, "store");
}

// Turn a tsconfig-style import alias pattern (e.g. "@/*", "~/*") into the
// prefix used in import statements ("@", "~"). Falls back to "@" if empty.
export function aliasPrefixFor(importAlias) {
    const prefix = String(importAlias || "@/*")
        .replace(/\*$/, "")
        .replace(/\/$/, "");
    return prefix || "@";
}

async function setupRedux(projectPath, config) {
    console.log();
    console.log(pc.cyan("◆") + " Setting up Redux Toolkit...");
    console.log();

    const installer = installerFor(config.packageManager, false);
    await run(installer.cmd, [...installer.args, "@reduxjs/toolkit", "react-redux"], { cwd: projectPath });

    const storeDir = storeDirFor(projectPath, config);
    fs.mkdirSync(storeDir, { recursive: true });

    const ts = config.typescript;
    const storeExt = ts ? "ts" : "js";
    const compExt = ts ? "tsx" : "js";

    fs.writeFileSync(path.join(storeDir, `index.${storeExt}`), readTemplate("redux", `index.${storeExt}`));
    fs.writeFileSync(path.join(storeDir, `counterSlice.${storeExt}`), readTemplate("redux", `counterSlice.${storeExt}`));

    if (ts) {
        fs.writeFileSync(path.join(storeDir, "hooks.ts"), readTemplate("redux", "hooks.ts"));
    }

    const appDir = appDirFor(projectPath, config);
    // Templates import from the default "@/store"; rewrite to the chosen alias.
    const storeImport = `${aliasPrefixFor(config.importAlias)}/store`;
    const providers = readTemplate("redux", `providers.${compExt}`).replaceAll('"@/store"', `"${storeImport}"`);
    fs.writeFileSync(path.join(appDir, `providers.${compExt}`), providers);

    patchLayoutWithProviders(appDir, ts);
}

async function setupZustand(projectPath, config) {
    console.log();
    console.log(pc.cyan("◆") + " Setting up Zustand...");
    console.log();

    const installer = installerFor(config.packageManager, false);
    await run(installer.cmd, [...installer.args, "zustand"], { cwd: projectPath });

    const storeDir = storeDirFor(projectPath, config);
    fs.mkdirSync(storeDir, { recursive: true });

    const ts = config.typescript;
    const ext = ts ? "ts" : "js";
    const contents = ts
        ? `import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
  reset: () => set({ count: 0 }),
}));
`
        : `import { create } from "zustand";

export const useCounterStore = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
  reset: () => set({ count: 0 }),
}));
`;
    fs.writeFileSync(path.join(storeDir, `useCounterStore.${ext}`), contents);
}

function patchLayoutWithProviders(appDir, ts) {
    const layoutPath = path.join(appDir, ts ? "layout.tsx" : "layout.js");
    if (!fs.existsSync(layoutPath)) {
        console.log(pc.yellow("⚠") + ` Could not find ${path.basename(layoutPath)} — wrap {children} with <Providers> manually.`);
        return;
    }

    let layout = fs.readFileSync(layoutPath, "utf8");
    const original = layout;

    if (!layout.includes(`from "./providers"`)) {
        if (/import\s+["']\.\/globals\.css["'];?/.test(layout)) {
            layout = layout.replace(
                /(import\s+["']\.\/globals\.css["'];?)/,
                `$1\nimport { Providers } from "./providers";`
            );
        } else {
            layout = `import { Providers } from "./providers";\n${layout}`;
        }
    }

    if (!layout.includes("<Providers>") && layout.includes("{children}")) {
        layout = layout.replace("{children}", "<Providers>{children}</Providers>");
    }

    if (layout === original) {
        console.log(pc.yellow("⚠") + " Could not auto-wrap layout — please wrap {children} with <Providers> manually.");
        return;
    }

    fs.writeFileSync(layoutPath, layout);
}

async function setupHusky(projectPath, config) {
    console.log();
    console.log(pc.cyan("◆") + " Setting up Husky + lint-staged + Prettier...");
    console.log();

    const installer = installerFor(config.packageManager, true);
    await run(
        installer.cmd,
        [...installer.args, "husky@^8", "lint-staged", "prettier"],
        { cwd: projectPath }
    );

    const pkgPath = path.join(projectPath, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.scripts = {
        ...pkg.scripts,
        prepare: "husky install",
        format: "prettier --check .",
        "format:fix": "prettier --write .",
        "lint:fix": "eslint --fix",
        ...(config.typescript ? { typecheck: "tsc --noEmit" } : {}),
    };
    delete pkg["lint-staged"];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    // Husky needs this project to be its own git repository. create-next-app
    // skips git init when nested inside an existing repo, and rolls it back if it
    // can't make the initial commit (e.g. no git identity configured). Ensure one
    // so the hook setup below doesn't fail.
    if (!fs.existsSync(path.join(projectPath, ".git"))) {
        await run("git", ["init"], { cwd: projectPath });
    }

    const runner = runnerFor(config.packageManager);
    await run(runner.cmd, [...runner.args, "husky", "install"], {
        cwd: projectPath,
    });

    await run("git", ["config", "core.hooksPath", ".husky"], { cwd: projectPath });

    const huskyDir = path.join(projectPath, ".husky");
    if (!fs.existsSync(huskyDir)) fs.mkdirSync(huskyDir, { recursive: true });

    const hookCmd = config.typescript
        ? "npx tsc --noEmit && npx lint-staged"
        : "npx lint-staged";
    const preCommit = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

${hookCmd}
`;
    const preCommitPath = path.join(huskyDir, "pre-commit");
    fs.writeFileSync(preCommitPath, preCommit);
    fs.chmodSync(preCommitPath, 0o755);

    const jsGlob = config.typescript ? "*.{js,jsx,ts,tsx}" : "*.{js,jsx}";
    const lintStagedConfig = {
        [jsGlob]: ["eslint --fix", "prettier --write"],
        "*.{json,css,scss,md,mdx,yml,yaml,html}": ["prettier --write"],
    };
    fs.writeFileSync(
        path.join(projectPath, ".lintstagedrc.json"),
        JSON.stringify(lintStagedConfig, null, 2) + "\n"
    );

    const prettierrc = {
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        trailingComma: "es5",
        printWidth: 100,
        arrowParens: "always",
        endOfLine: "lf",
    };
    fs.writeFileSync(path.join(projectPath, ".prettierrc"), JSON.stringify(prettierrc, null, 2) + "\n");

    const prettierIgnore = [
        "node_modules",
        ".next",
        "out",
        "build",
        "dist",
        "coverage",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
        "",
    ].join("\n");
    fs.writeFileSync(path.join(projectPath, ".prettierignore"), prettierIgnore);
}

// pnpm 11 defaults strictDepBuilds=true, so a later `pnpm install` in the
// generated project hard-fails (ERR_PNPM_IGNORED_BUILDS) on unapproved
// dependency build scripts that Next.js/shadcn pull in (sharp, unrs-resolver).
// create-next-app's own pnpm install already drops a pnpm-workspace.yaml here
// with placeholder values ("set this to true or false") that are meant to be
// edited — so we replace it with an explicit, valid decision:
//   - allowBuilds: <pkg>: false  -> a deliberate "don't run this build script"
//     (the deps ship prebuilt binaries; nothing untrusted is executed).
//   - strictDepBuilds: false      -> catch-all so a future native dependency
//     can't reintroduce the hard install failure.
// We overwrite rather than merge: this file's only role in a single-app project
// is these settings, and appending risks duplicate keys (invalid YAML). pnpm 11
// reads these from pnpm-workspace.yaml, not .npmrc.
export function writePnpmBuildConfig(projectPath) {
    const wsPath = path.join(projectPath, "pnpm-workspace.yaml");
    const contents = `# Let \`pnpm install\` succeed without failing on dependency build scripts.
# See https://pnpm.io/settings#strictdepbuilds
strictDepBuilds: false
allowBuilds:
  sharp: false
  unrs-resolver: false
`;
    fs.writeFileSync(wsPath, contents);
}

function installerFor(pm, dev = true) {
    switch (pm) {
        case "pnpm":
            return { cmd: "pnpm", args: dev ? ["add", "-D"] : ["add"] };
        case "yarn":
            return { cmd: "yarn", args: dev ? ["add", "-D"] : ["add"] };
        case "bun":
            return { cmd: "bun", args: dev ? ["add", "-d"] : ["add"] };
        case "npm":
        default:
            return { cmd: "npm", args: dev ? ["install", "-D"] : ["install"] };
    }
}

function runnerFor(_pm) {
    return { cmd: "npx", args: [] };
}
