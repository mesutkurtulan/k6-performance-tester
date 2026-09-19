import { readFileSync } from "node:fs";
import { NormalizedApiModel, NormalizedApiModelSchema } from "../models/schemas.js";
import { detectFromContents, detectSource } from "./detect.js";
import { parseOpenApi } from "./openapi.js";
import { parsePostman } from "./postman.js";
import { parseCurl } from "./curl.js";
import { parseK6 } from "./k6.js";
import { parseHar } from "./har.js";

export function parseInput(input: string): NormalizedApiModel {
  const source = detectSource(input);
  const contents = isProbablyPath(input) ? readFileSync(input, "utf8") : input;
  const path = isProbablyPath(input) ? input : "inline";
  return parseContents(contents, path, source);
}

export function parseContents(
  contents: string,
  path: string,
  source = detectFromContents(contents, path),
): NormalizedApiModel {
  let model: NormalizedApiModel;
  switch (source) {
    case "openapi":
      model = parseOpenApi(contents, path);
      break;
    case "postman":
      model = parsePostman(contents, path);
      break;
    case "curl":
      model = parseCurl(contents, path);
      break;
    case "k6":
      model = parseK6(contents, path);
      break;
    case "har":
      model = parseHar(contents, path);
      break;
  }
  return NormalizedApiModelSchema.parse(model);
}

function isProbablyPath(input: string): boolean {
  return !input.trim().startsWith("curl ") && !input.trim().startsWith("{") && !input.includes("\n");
}

export { detectSource, detectFromContents };
export { parseOpenApi, parsePostman, parseCurl, parseK6, parseHar };
