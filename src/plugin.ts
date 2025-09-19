import { createUnplugin } from "unplugin";
import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

type Filter = (id: string) => boolean;

export interface TailwindPrefixPluginOpts {
  /**
   * Path to your Tailwind config file. We’ll try a few defaults if omitted.
   * e.g. 'tailwind.config.ts'
   */
  tailwindConfig?: string;
  /**
   * Override the computed prefix. If omitted, we read from the Tailwind config.
   */
  prefixOverride?: string;
  /**
   * Attribute names to transform (JSX)
   */
  attributes?: string[];
  /**
   * Include/Exclude file filters
   */
  include?: RegExp | ((id: string) => boolean);
  exclude?: RegExp | ((id: string) => boolean);
  /**
   * Optional custom predicate to decide if a token is a Tailwind class.
   */
  isTwToken?: (token: string) => boolean;
}

function makeFilter(opts: TailwindPrefixPluginOpts): Filter {
  const include = opts.include ?? /\.(jsx|tsx|js|ts)$/i; // default: transform JS/TS/JSX/TSX
  const exclude = opts.exclude ?? /node_modules/;

  return (id: string) => {
    const inc = typeof include === "function" ? include(id) : include.test(id);
    const exc = typeof exclude === "function" ? exclude(id) : exclude.test(id);

    return inc && !exc;
  };
}

/**
 * Robust-ish split on ":" that ignores ":" inside square brackets or quotes.
 * Works for things like: data-[state=open]:hover:[&>*]:bg-red-500
 */
function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < token.length; i++) {
    const ch = token[i];

    if (quote) {
      buf += ch;
      if (ch === quote && token[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch as "'" | '"';
      buf += ch;
      continue;
    }

    if (ch === "[") {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === "]") {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }

    if (ch === ":" && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }

    buf += ch;
  }
  if (buf) parts.push(buf);

  return parts;
}

/**
 * Conservative heuristic for “Tailwind-looking” tokens.
 * Feel free to expand the roots list to be stricter/looser.
 */
const TW_ROOTS = new Set([
  // layout/display/position
  "container",
  "sr-only",
  "not-sr-only",
  "static",
  "fixed",
  "absolute",
  "relative",
  "sticky",
  "block",
  "inline",
  "inline-block",
  "inline-flex",
  "flex",
  "grid",
  "table",
  "contents",
  "hidden",
  // spacing/sizing
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "space-x",
  "space-y",
  "w",
  "h",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "size",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  // typography
  "font",
  "text",
  "antialiased",
  "subpixel-antialiased",
  "tracking",
  "leading",
  "list",
  "placeholder",
  // backgrounds/borders/effects
  "bg",
  "from",
  "via",
  "to",
  "border",
  "rounded",
  "shadow",
  "ring",
  "outline",
  "opacity",
  "decoration",
  // flex/grid
  "flex-grow",
  "grow",
  "flex-shrink",
  "shrink",
  "basis",
  "order",
  "grid-cols",
  "grid-rows",
  "col",
  "row",
  "gap",
  "place",
  "items",
  "justify",
  "content",
  "self",
  "auto-cols",
  "auto-rows",
  // transforms/transitions
  "transform",
  "scale",
  "rotate",
  "translate",
  "skew",
  "origin",
  "transition",
  "duration",
  "ease",
  "delay",
  // interactivity/state
  "cursor",
  "select",
  "resize",
  "scroll",
  "snap",
  "touch",
  "pointer-events",
  "accent",
  "appearance",
  // svg/filters/tables/etc
  "fill",
  "stroke",
  "stroke-w",
  "filter",
  "backdrop",
  // misc common utilities
  "z",
  "overflow",
  "object",
  "align",
  "whitespace",
  "break",
  "isolate",
  "isolation",
]);

function isLikelyTailwindToken(token: string): boolean {
  // Ignore obviously non-TW stuff
  if (!token || /[A-Z]/.test(token)) {
    return false; // usually CSS modules e.g., styles.main
  }

  if (token.startsWith("{") || token.startsWith("[") || token.startsWith("(")) {
    // starts with arbitrary variant? still OK, let it through
  }

  // Allow variants like sm:, hover:, data-[...]:
  const segments = splitVariants(token);
  const core = segments[segments.length - 1]; // last segment is the utility
  if (!core) return false;

  // Already prefixed utils like "tw-bg-red-500" will be skipped by final check.
  // Heuristic: allow if it matches known roots or common shapes like x-y-...
  if (TW_ROOTS.has(core) || TW_ROOTS.has(core.split("-")[0])) return true;

  // Also allow single-word utilities like "flex", "grid", "hidden"
  if (/^[a-z-]+$/.test(core) && TW_ROOTS.has(core)) return true;

  return false;
}

function prefixOneToken(token: string, prefix: string): string {
  if (!prefix) return token;

  // Support !important utilities: "!bg-red-500"
  let important = "";
  if (token.startsWith("!")) {
    important = "!";
    token = token.slice(1);
  }

  const segments = splitVariants(token);
  const last = segments.pop() ?? "";

  // Avoid double-prefix
  if (last.startsWith(prefix)) {
    return important + [...segments, last].join(":");
  }

  const result = important + [...segments, prefix + last].join(":");
  return result;
}

function transformClassesInString(
  input: string,
  prefix: string,
  isTw?: (t: string) => boolean,
) {
  const tokens = input.split(/\s+/g);
  const out: string[] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    const shouldPrefix = (isTw ?? isLikelyTailwindToken)(tok);
    out.push(shouldPrefix ? prefixOneToken(tok, prefix) : tok);
  }
  return out.join(" ");
}

function isTargetJSXAttribute(path: NodePath<t.JSXAttribute>, names: string[]) {
  const name = path.node.name.name;
  return typeof name === "string" && names.includes(name);
}

// Handle template literals with no expressions: `"..."`
function transformTemplateLiteralIfStatic(
  node: t.TemplateLiteral,
  prefix: string,
  isTw?: (t: string) => boolean,
) {
  if (node.expressions.length > 0) return null; // skip dynamic templates
  const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
  const transformed = transformClassesInString(raw, prefix, isTw);
  return t.stringLiteral(transformed);
}

export const TailwindPrefixUnplugin = createUnplugin<
  TailwindPrefixPluginOpts | undefined
>((userOpts) => {
  const attrs = userOpts?.attributes ?? ["className", "class", "tw"];
  const filter = makeFilter(userOpts ?? {});
  let cachedPrefix: string | null = null;

  return {
    name: "vite-plugin-tailwind-prefixer",
    enforce: "pre",
    async buildStart() {
      cachedPrefix = userOpts?.prefixOverride ?? ""; // reset cache on rebuilds
    },
    async transform(code, id) {
      if (!filter(id)) return null;
      const prefix = cachedPrefix ?? "";

      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "importMeta", "topLevelAwait"],
      });

      traverse(ast, {
        JSXAttribute(path: NodePath<t.JSXAttribute>) {
          if (!isTargetJSXAttribute(path, attrs)) return;

          const val = path.node.value;

          // Handle className={clsx('a b', cond && 'c')}
          if (
            t.isJSXExpressionContainer(val) &&
            t.isCallExpression(val.expression) &&
            t.isIdentifier(val.expression.callee) &&
            (val.expression.callee.name === "clsx" ||
              val.expression.callee.name === "classnames")
          ) {
            const args = val.expression.arguments;
            for (const arg of args) {
              if (t.isStringLiteral(arg)) {
                arg.value = transformClassesInString(
                  arg.value,
                  prefix,
                  userOpts?.isTwToken,
                );
              } else if (t.isTemplateLiteral(arg)) {
                const replaced = transformTemplateLiteralIfStatic(
                  arg,
                  prefix,
                  userOpts?.isTwToken,
                );
                if (replaced && t.isStringLiteral(replaced)) {
                  // replace in-place
                  (arg as any).type = "StringLiteral";
                  (arg as any).value = replaced.value;
                }
              } else if (t.isLogicalExpression(arg)) {
                if (arg.right && t.isStringLiteral(arg.right)) {
                  arg.right.value = transformClassesInString(
                    arg.right.value,
                    prefix,
                    userOpts?.isTwToken,
                  );
                } else if (t.isTemplateLiteral(arg.right)) {
                  const replaced = transformTemplateLiteralIfStatic(
                    arg.right,
                    prefix,
                    userOpts?.isTwToken,
                  );
                  if (replaced && t.isStringLiteral(replaced)) {
                    (arg.right as any).type = "StringLiteral";
                    (arg.right as any).value = replaced.value;
                  }
                }
              }

              // skip ObjectExpression or ArrayExpression to keep it safe.
            }
          }

          // className="..."
          if (t.isStringLiteral(val)) {
            val.value = transformClassesInString(
              val.value,
              prefix,
              userOpts?.isTwToken,
            );
            return;
          }

          // className={`...`} - only when static (no ${})
          if (
            t.isJSXExpressionContainer(val) &&
            t.isTemplateLiteral(val.expression)
          ) {
            const replaced = transformTemplateLiteralIfStatic(
              val.expression,
              prefix,
              userOpts?.isTwToken,
            );
            if (replaced) {
              path.node.value = replaced;
            }
            return;
          }
        },
      });

      const out = generate(ast, { retainLines: true }, code);
      return { code: out.code, map: out.map ?? null };
    },
  };
});

/**
 * Default export compatible with Vite, Rollup, Webpack, and esbuild.
 * To use with Vite, for example, simply add this plugin to your vite.config.ts,
 * and call the `.vite()` method with desired options
 */
export default TailwindPrefixUnplugin;
