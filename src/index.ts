import TailwindPrefixPlugin, { TailwindPrefixUnplugin } from "./plugin";

// Vite default
export default TailwindPrefixPlugin;

// Also export rollup/esbuild/webpack forms
export const vite = TailwindPrefixUnplugin.vite;
export const rollup = TailwindPrefixUnplugin.rollup;
export const webpack = TailwindPrefixUnplugin.webpack;
export const esbuild = TailwindPrefixUnplugin.esbuild;
