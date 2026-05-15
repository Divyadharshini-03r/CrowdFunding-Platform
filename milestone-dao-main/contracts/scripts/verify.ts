import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const file = path.resolve(__dirname, `../deployments/${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing deployment file: ${file}`);
  const { address, args } = JSON.parse(fs.readFileSync(file, "utf8"));

  console.log(`Verifying ${address} on ${network.name}…`);
  await run("verify:verify", { address, constructorArguments: args });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
