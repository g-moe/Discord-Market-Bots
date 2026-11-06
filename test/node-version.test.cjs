const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const PACKAGE_DIRS = [".", "public-site", ...listDirs("services").filter(dir => exists(dir, "package.json"))];
const DOCKERFILES = fs.readdirSync(path.join(ROOT, "services")).filter(name => name.startsWith("dockerfile."));
const NODE_IMAGE_REGEX = /^FROM\s+(?:--platform=\S+\s+)?node:(\S+)/gm;

function exists(...parts) {
  return fs.existsSync(path.join(ROOT, ...parts));
}

function listDirs(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name));
}

// The root .nvmrc is the one source of truth for the Node version.
const nvmrc = fs.readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim();

test("every package.json pins engines.node to .nvmrc", () => {
  for (const dir of PACKAGE_DIRS) {
    const { engines } = JSON.parse(fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8"));
    assert.equal(engines?.node, nvmrc, `${dir}/package.json engines.node`);
  }
});

test("every Node Docker image uses the .nvmrc version", () => {
  const images = DOCKERFILES.flatMap(name => {
    const dockerfile = fs.readFileSync(path.join(ROOT, "services", name), "utf8");
    return [...dockerfile.matchAll(NODE_IMAGE_REGEX)].map(match => ({ name, tag: match[1] }));
  });

  assert.ok(images.length > 0, "no Node Docker images found");
  for (const { name, tag } of images) {
    assert.ok(tag.startsWith(`${nvmrc}-`), `services/${name} uses node:${tag}`);
  }
});

test("no other .nvmrc overrides the root version", () => {
  for (const dir of PACKAGE_DIRS.filter(dir => dir !== ".")) {
    assert.equal(exists(dir, ".nvmrc"), false, `${dir}/.nvmrc`);
  }
});
