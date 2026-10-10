// The live model adapter (A6). Only run.mjs --live imports this file; tests
// never do. The API key must be passed in from the shell environment: the
// runner never reads .env, and an empty key is refused here rather than
// letting the SDK look for credentials anywhere else.

import Anthropic from '@anthropic-ai/sdk';

export function liveModel({ model, apiKey, effort = 'medium' }) {
  if (!apiKey) throw new Error('No API key. Set ANTHROPIC_API_KEY in the shell that runs this; .env is never read.');
  // One retry at most, for a dropped connection or a 5xx; nothing else retries.
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    async respond({ system, messages, tools, maxTokens }) {
      // Thinking is adaptive (on by default on these models); effort is set
      // explicitly. The reply's content, thinking blocks included, goes back
      // into the history unchanged.
      const reply = await client.messages.create({ model, max_tokens: maxTokens, system, messages, tools, output_config: { effort } });
      return { content: reply.content, stop_reason: reply.stop_reason, usage: reply.usage };
    },
  };
}
