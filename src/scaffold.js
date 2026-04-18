import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";
import { run } from "./utils.js";

export async function scaffold(config) {
    const cwd = process.cwd();
    const projectPath = path.resolve(cwd, config.projectName);

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

    const storeIndex = ts
        ? `import { configureStore } from "@reduxjs/toolkit";
import counterReducer from "./counterSlice";

export const store = configureStore({
  reducer: {
    counter: counterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
`
        : `import { configureStore } from "@reduxjs/toolkit";
import counterReducer from "./counterSlice";

export const store = configureStore({
  reducer: {
    counter: counterReducer,
  },
});
`;
    fs.writeFileSync(path.join(storeDir, `index.${storeExt}`), storeIndex);

    const counterSlice = ts
        ? `import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface CounterState {
  value: number;
}

const initialState: CounterState = { value: 0 };

const counterSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
  },
});

export const { increment, decrement, incrementByAmount } = counterSlice.actions;
export default counterSlice.reducer;
`
        : `import { createSlice } from "@reduxjs/toolkit";

const initialState = { value: 0 };

const counterSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    },
    incrementByAmount: (state, action) => {
      state.value += action.payload;
    },
  },
});

export const { increment, decrement, incrementByAmount } = counterSlice.actions;
export default counterSlice.reducer;
`;
    fs.writeFileSync(path.join(storeDir, `counterSlice.${storeExt}`), counterSlice);

    if (ts) {
        const hooks = `import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import type { RootState, AppDispatch } from "./index";

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
`;
        fs.writeFileSync(path.join(storeDir, "hooks.ts"), hooks);
    }

    const appDir = appDirFor(projectPath, config);
    const providers = ts
        ? `"use client";

import { Provider } from "react-redux";
import { store } from "@/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
`
        : `"use client";

import { Provider } from "react-redux";
import { store } from "@/store";

export function Providers({ children }) {
  return <Provider store={store}>{children}</Provider>;
}
`;
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

function runnerFor(pm) {
    switch (pm) {
        case "pnpm":
            return { cmd: "pnpm", args: ["dlx"] };
        case "yarn":
            return { cmd: "yarn", args: ["dlx"] };
        case "bun":
            return { cmd: "bunx", args: [] };
        case "npm":
        default:
            return { cmd: "npx", args: [] };
    }
}
