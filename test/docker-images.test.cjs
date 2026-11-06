const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const SERVICES_DIR = path.join(__dirname, "..", "services");
const FROM_REGEX = /^FROM\s+(?:--platform=\S+\s+)?(\S+)/gm;
const COMPOSE_IMAGE_REGEX = /^\s+image:\s*(\S+)/gm;
const LOCAL_BUILD_IMAGE_REGEX = /^\s+image:\s*(\S+)\n\s+build:/gm;

/**
 * Every image reference in the Dockerfiles and docker-compose.yml, with the file it came from.
 *
 * @example
 * listImages(); // [{ image: "node:24.22.2-bookworm-slim", source: "dockerfile.tickers" }, ...]
 */
function listImages() {
  const dockerfiles = fs.readdirSync(SERVICES_DIR).filter(name => name.startsWith("dockerfile."));
  const fromImages = dockerfiles.flatMap(name => {
    const dockerfile = fs.readFileSync(path.join(SERVICES_DIR, name), "utf8");
    return [...dockerfile.matchAll(FROM_REGEX)].map(match => ({ image: match[1], source: name }));
  });

  const compose = fs.readFileSync(path.join(SERVICES_DIR, "docker-compose.yml"), "utf8");
  const localBuilds = new Set([...compose.matchAll(LOCAL_BUILD_IMAGE_REGEX)].map(match => match[1]));
  const composeImages = [...compose.matchAll(COMPOSE_IMAGE_REGEX)]
    .map(match => ({ image: match[1], source: "docker-compose.yml" }))
    .filter(({ image }) => !localBuilds.has(image));

  return [...fromImages, ...composeImages];
}

/**
 * Split an image reference into repository and tag; the tag is `undefined` when omitted.
 *
 * @example
 * splitImage("node:24.22.2-bookworm-slim"); // { repository: "node", tag: "24.22.2-bookworm-slim" }
 */
function splitImage(image) {
  const separator = image.lastIndexOf(":");
  if (separator === -1) return { repository: image, tag: undefined };

  return { repository: image.slice(0, separator), tag: image.slice(separator + 1) };
}

const images = listImages();

test("every external Docker image is pinned to an explicit, non-latest tag", () => {
  assert.ok(images.length > 0, "no Docker images found");

  for (const { image, source } of images) {
    const { tag } = splitImage(image);
    assert.ok(tag && tag !== "latest", `${source} uses unpinned image ${image}`);
  }
});

test("the same Docker image uses the same tag everywhere", () => {
  const tagsByRepository = new Map();
  for (const { image, source } of images) {
    const { repository, tag } = splitImage(image);
    tagsByRepository.set(repository, [...(tagsByRepository.get(repository) ?? []), `${tag} (${source})`]);
  }

  for (const [repository, tags] of tagsByRepository) {
    const distinctTags = new Set(tags.map(entry => entry.split(" ")[0]));
    assert.equal(distinctTags.size, 1, `${repository} has drifting tags: ${tags.join(", ")}`);
  }
});
