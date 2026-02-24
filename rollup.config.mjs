import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
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
        if (isWatching) {
          this.addWatchFile(`${sdPlugin}/manifest.json`);
        }
      },
    },
    resolve({
      browser: false,
      exportConditions: ["node"],
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      sourceMap: isWatching,
      inlineSources: isWatching,
      declaration: false,
      declarationMap: false,
    }),
  ],
};

export default config;
