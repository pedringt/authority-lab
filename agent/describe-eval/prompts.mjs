// The prompt versions the eval can run. describe-v1 is the default; a frozen
// held-out set names the one it must be run with (freeze.mjs).
import * as v1 from './prompt.mjs';
import * as v2 from './prompt-v2.mjs';

export const PROMPTS = { [v1.PROMPT_VERSION]: v1, [v2.PROMPT_VERSION]: v2 };
export const DEFAULT_PROMPT = v1.PROMPT_VERSION;
