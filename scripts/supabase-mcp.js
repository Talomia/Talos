import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";


const STUDIO_URL = process.env.STUDIO_URL;
const STUDIO_USER = process.env.STUDIO_USER;
const STUDIO_PASS = process.env.STUDIO_PASS;

if (!STUDIO_URL || !STUDIO_USER || !STUDIO_PASS) {
  console.error("Error: Missing STUDIO_URL, STUDIO_USER, or STUDIO_PASS env variables.");
  process.exit(1);
}

const server = new Server(
  {
    name: "supabase-selfhosted",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_sql",
      description: "Execute a raw SQL query on the self-hosted Supabase database.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The SQL query to execute."
          }
        },
        required: ["query"]
      }
    },
    {
      name: "list_tables",
      description: "List all tables in the database schema.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  const headers = {
    "Authorization": "Basic " + Buffer.from(`${STUDIO_USER}:${STUDIO_PASS}`).toString("base64"),
    "Content-Type": "application/json"
  };

  try {
    if (name === "execute_sql") {
      const response = await fetch(`${STUDIO_URL}/api/platform/pg-meta/default/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: args.query })
      });
      
      const result = await response.json();
      if (!response.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "list_tables") {
      const response = await fetch(`${STUDIO_URL}/api/platform/pg-meta/default/tables`, {
        method: "GET",
        headers
      });
      
      const result = await response.json();
      if (!response.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
