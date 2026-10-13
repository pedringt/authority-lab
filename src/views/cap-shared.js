// Helpers shared by the capability tabs.

import { TOOLS, toolLabel } from '../store/index.js';

export const toolWords = (tool) => (Object.hasOwn(TOOLS, tool) ? toolLabel(tool) : 'Unknown tool');
