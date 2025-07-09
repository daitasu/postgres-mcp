#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pg from 'pg';
import { createResourceHandlers } from './handlers/resourceHandlers.js';
import { createToolHandlers } from './handlers/toolHandlers.js';

const SERVER_NAME = 'postgres-mcp';
const SERVER_VERSION = '1.0.0';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Please provide a database URL as a command-line argument');
    process.exit(1);
  }

  const databaseUrl = args[0];
  
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const resourceHandlers = createResourceHandlers(pool);
  const toolHandlers = createToolHandlers(pool);

  // SQL query execution tool
  server.registerTool(
    'query',
    {
      description: 'Execute read-only SQL queries',
      inputSchema: {
        sql: z.string().describe('SQL query to execute'),
      },
    },
    async (input: { sql: string }) => {
      const result = await toolHandlers.executeQuery(input);
      
      return result.match(
        (rows) => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify(rows, null, 2),
            },
          ],
        }),
        (error) => {
          throw new Error(`Query error: ${error.message}${error.detail ? ` (${error.detail})` : ''}`);
        }
      );
    }
  );

  // List tables tool
  server.registerTool(
    'listTables',
    {
      description: 'Get a list of tables in the database',
      inputSchema: {},
    },
    async () => {
      const result = await resourceHandlers.listTables();
      
      return result.match(
        (tables) => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify(tables, null, 2),
            },
          ],
        }),
        (error) => {
          throw new Error(`Failed to list tables: ${error.message}`);
        }
      );
    }
  );

  // Get table schema tool
  server.registerTool(
    'getTableSchema',
    {
      description: 'Get schema information for a specified table',
      inputSchema: {
        tableName: z.string().describe('Table name to get schema for'),
      },
    },
    async (input: { tableName: string }) => {
      const result = await resourceHandlers.getTableSchema(input.tableName);
      
      return result.match(
        (columns) => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify(columns, null, 2),
            },
          ],
        }),
        (error) => {
          throw new Error(`Failed to get table schema: ${error.message}`);
        }
      );
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} MCP server running on stdio`);
};

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});