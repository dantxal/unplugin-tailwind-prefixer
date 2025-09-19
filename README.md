# unplugin-tailwind-prefixer

Prefix Tailwind CSS utility classes in your source code at build time, using any bundler compatible with [Unplugin](https://github.com/unplugin/unplugin). Works with Vite, Rollup, Webpack, and esbuild.

## Features

- Adds a custom prefix to all Tailwind utility classes in your code.
- Supports `className`, `class`, and custom attribute names.
- Handles string literals, template literals, and `clsx`/`classnames` calls.
- Skips already-prefixed classes and non-Tailwind tokens.
- Easily configurable and framework-agnostic.

## Installation

```sh
npm install unplugin-tailwind-prefixer --save-dev
```

```sh
yarn add unplugin-tailwind-prefixer --dev
```

```sh
pnpm add unplugin-tailwind-prefixer --save-dev
```

## Usage

### Vite

```ts
// vite.config.ts
import TailwindPrefixer from "unplugin-tailwind-prefixer";

export default {
  plugins: [
    TailwindPrefixer.vite({
      prefixOverride: "tw-", // Your custom prefix
      // attributes: ["className", "class"], // Optional: attributes to transform
    }),
  ],
};
```

### Rollup

```ts
// rollup.config.js
import TailwindPrefixer from "unplugin-tailwind-prefixer";

export default {
  plugins: [TailwindPrefixer.rollup({ prefixOverride: "tw-" })],
};
```

### Webpack

```js
// webpack.config.js
const TailwindPrefixer = require("unplugin-tailwind-prefixer");

module.exports = {
  plugins: [TailwindPrefixer.webpack({ prefixOverride: "tw-" })],
};
```

### esbuild

```js
// esbuild.config.js
import { esbuildPlugin } from "unplugin-tailwind-prefixer";

esbuild.build({
  plugins: [esbuildPlugin({ prefixOverride: "tw-" })],
});
```

## Options

| Option           | Type                      | Description                                                       |
| ---------------- | ------------------------- | ----------------------------------------------------------------- | --- | --- | --------- |
| `prefixOverride` | `string`                  | The prefix to add to Tailwind classes (e.g., `"tw-"`).            |
| `attributes`     | `string[]`                | Attribute names to transform (default: `["className", "class"]`). |
| `include`        | `RegExp \| (id) => bool`  | Files to include (default: `/\.(jsx                               | tsx | js  | ts)$/i` ) |
| `exclude`        | `RegExp \| (id) => bool`  | Files to exclude (default: `/node_modules/`).                     |
| `isTwToken`      | `(token: string) => bool` | Custom predicate to identify Tailwind tokens.                     |

## Example

Input:

```jsx
<div className="bg-red-500 text-white custom-class" />
```

Output (with `prefixOverride: "tw-"`):

```jsx
<div className="tw-bg-red-500 tw-text-white custom-class" />
```

## License

MIT © [Daniel Faria](https://github.com/dantxal)
