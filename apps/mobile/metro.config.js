const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  workspaceRoot,
  path.resolve(workspaceRoot, "packages/gf-core"),
];

config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(projectRoot, "node_modules"),
];

// Prefer workspace packages; still allow normal lookup for hoisted deps.
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  "@gf/core": path.resolve(workspaceRoot, "packages/gf-core"),
};

module.exports = config;
