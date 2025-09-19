import { TailwindPrefixUnplugin } from "../src/plugin";
import { describe, it, expect } from "vitest";
import { customClass } from "./fixtures/custom-class";
import { template } from "./fixtures/template";
import { clsx } from "./fixtures/clsx";
import { alreadyPrefixed } from "./fixtures/already-prefixed";
import { classAttribute, classNameAttribute } from "./fixtures/basic";

function runTransform(code: string, opts: any = {}) {
  // Simulate the plugin's transform hook
  let plugin = TailwindPrefixUnplugin.raw(opts, { framework: "vite" });

  // If plugin is an array, use the first element
  if (Array.isArray(plugin)) {
    plugin = plugin[0];
  }

  // Call buildStart if present (handle async)
  const maybeBuildStart = plugin.buildStart?.call?.({ root: process.cwd() });
  const buildStartPromise =
    maybeBuildStart instanceof Promise ? maybeBuildStart : Promise.resolve();

  return buildStartPromise.then(() =>
    plugin.transform
      ?.call?.({}, code, "Component.tsx")
      .then?.((result: any) => result?.code ?? null),
  );
}

describe("TailwindPrefixUnplugin", () => {
  it("prefixes className string literals", async () => {
    const code = classNameAttribute;

    const result = await runTransform(code, { prefixOverride: "tw-" });

    expect(result).toContain('className="tw-bg-red-500 tw-text-white"');
  });

  it("prefixes class attribute", async () => {
    const code = classAttribute;

    const result = await runTransform(code, { prefixOverride: "tw-" });

    expect(result).toContain('class="tw-flex tw-items-center"');
  });

  it("skips already-prefixed classes", async () => {
    const code = alreadyPrefixed;

    const result = await runTransform(code, { prefixOverride: "tw-" });

    expect(result).toContain('className="tw-bg-blue-500 tw-bg-red-500"');
  });

  it("handles template literals", async () => {
    const code = template;

    const result = await runTransform(code, { prefixOverride: "tw-" });

    expect(result).toContain('className="tw-bg-red-500 tw-text-white"');
  });

  it("handles clsx calls", async () => {
    const code = clsx;

    const result = await runTransform(code, { prefixOverride: "tw-" });

    expect(result).toContain('clsx("tw-bg-red-500", cond && "tw-text-white")');
  });

  // it("does not prefix non-tailwind tokens", async () => {
  //   const code = customClass;
  //
  //   const result = await runTransform(code, { prefixOverride: "tw-" });
  //
  //   expect(result).toContain('className="custom-class"');
  // });
});
