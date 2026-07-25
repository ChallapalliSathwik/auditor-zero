import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools, ToolName } from "./tools";

const server = new Server(
  {
    name: process.env.MCP_SERVER_NAME || "auditor-zero",
    version: process.env.MCP_SERVER_VERSION || "1.0.0",
  },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: zodToJsonSchema(def.schema as any, { target: "openApi3" }) as any,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name as ToolName;
  const def = tools[name];
  if (!def) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    const parsed = def.schema.parse(request.params.arguments ?? {});
    const result = await (def.handler as (i: unknown) => Promise<unknown>)(parsed);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[auditor-zero MCP] listening on stdio, ${Object.keys(tools).length} tools registered`);
}

main().catch((err) => {
  console.error("[auditor-zero MCP] fatal:", err);
  process.exit(1);
});
