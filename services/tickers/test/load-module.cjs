const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const vm = require("node:vm");

/**
 * Run a compiled `dist/<name>.js` module with stand-in modules and globals, so tests never reach the network or disk.
 *
 * @example
 * const { updateDiscordBot } = loadModule("updates", { "./logger": { __esModule: true, default: logger } }, { fetch });
 */
function loadModule(name, substitutes, globals = {}) {
  const filename = path.join(__dirname, "../dist", `${name}.js`);
  const localRequire = createRequire(filename);
  const module = { exports: {} };

  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    exports: module.exports,
    module,
    require: name => substitutes[name] ?? localRequire(name),
    console,
    setTimeout,
    ...globals,
  }, { filename });

  return module.exports;
}

module.exports = { loadModule };
