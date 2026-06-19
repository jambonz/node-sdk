// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source of truth: @jambonz/schema@0.3.15 verbs/agent.schema.json (llm.vendor.enum)
// Regenerate with: npm run gen:types
//
// This file derives the LLM vendor list from the JSON schema so the SDK's
// types never drift from the schema when a new vendor is added.

/** Supported LLM vendors for the agent verb, derived from the schema enum. */
export const LLM_VENDORS = [
  'openai',
  'anthropic',
  'google',
  'vertex-gemini',
  'vertex-openai',
  'bedrock',
  'deepseek',
  'baseten',
  'azure-openai',
  'groq',
  'huggingface',
] as const;

/** Union of LLM vendor ids accepted by the agent verb's `llm.vendor`. */
export type LlmVendor = (typeof LLM_VENDORS)[number];
