const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
const expectedMajor = 22;

if (major !== expectedMajor) {
  console.error(
    [
      `This repo requires Node ${expectedMajor}.x, but current Node is ${process.version}.`,
      "Please run `nvm use` in /Users/grahamhau/Documents/Loom and then reinstall or rebuild native dependencies if needed.",
      "Reason: better-sqlite3 is a native module and may fail on ABI-incompatible Node versions.",
    ].join("\n")
  );
  process.exit(1);
}
