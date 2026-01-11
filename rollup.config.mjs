import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.anthropic.claude-deck.sdPlugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "es",
    sourcemap: isWatching,
  },
  plugins: [
    {
      name: "watch-externals",
      buildStart: function () {
        this.addWatchFile(`${sdPlugin}/manifest.json`);
      },
    },
    typescript({
      mapRoot: isWatching
        ? "./"
        : undefined,
    }),
    resolve({
      browser: false,
      exportConditions: ["node"],
      preferBuiltins: true,
    }),
  ],
  external: ["@anthropic-ai/claude-agent-sdk", "ws"],
};

export default config;
