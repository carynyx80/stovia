import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/contracts/package.json", import.meta.url),
);
const solc = require("solc");
const root = path.resolve(import.meta.dirname, "..");
const sources = Object.fromEntries(
  fs
    .readdirSync(root + "/packages/contracts/src")
    .filter((f) => f.endsWith(".sol"))
    .map((f) => [
      f,
      {
        content: fs.readFileSync(root + "/packages/contracts/src/" + f, "utf8"),
      },
    ]),
);
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        viaIR: true,
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
          },
        },
      },
    }),
    {
      import: (p) => {
        try {
          return { contents: fs.readFileSync(require.resolve(p), "utf8") };
        } catch (e) {
          return { error: String(e) };
        }
      },
    },
  ),
);
for (const e of output.errors || []) console.log(e.formattedMessage);
if (output.errors?.some((e) => e.severity === "error")) process.exit(1);
fs.mkdirSync(root + "/packages/contracts/artifacts", { recursive: true });
for (const [name, c] of Object.values(output.contracts).flatMap((file) =>
  Object.entries(file),
)) {
  fs.writeFileSync(
    root + "/packages/contracts/artifacts/" + name + ".json",
    JSON.stringify(c, null, 2),
  );
  const size = c.evm.deployedBytecode.object.length / 2;
  console.log(name, size + " runtime bytes");
  if (size > 24576) throw Error(name + " exceeds EIP170");
}
