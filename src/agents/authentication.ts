import { AuthScheme, NormalizedApiModel } from "../models/schemas.js";

export function analyzeAuthentication(model: NormalizedApiModel): {
  schemes: AuthScheme[];
  envVars: string[];
  notes: string[];
} {
  const schemes = model.authentication;
  const envVars = [...new Set(schemes.flatMap((s) => s.envVars))];
  const notes = [
    "Generated tests read credentials from environment variables only.",
    ...schemes.map((s) => `${s.name}: type=${s.type} env=${s.envVars.join(",")}`),
  ];
  if (schemes.length === 0) {
    notes.push("No security schemes detected; requests will be unauthenticated unless you add headers via env.");
  }
  return { schemes, envVars, notes };
}
