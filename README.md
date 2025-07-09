# PostgreSQL MCP Server

Implementation of PostgreSQL Model Context Protocol (MCP) server. Enables read-only SQL query execution and database schema information retrieval.

## Features

- **query**: Execute read-only SQL queries
- **listTables**: Get a list of tables in the database
- **getTableSchema**: Get schema information for a specified table

## Installation

### From npm

```bash
npm install -g @daitasu/postgres-mcp
```

### From source

```bash
# Clone the repository
git clone https://github.com/daitasu/postgres-mcp.git
cd postgres-mcp

# Install dependencies
pnpm install

# Build
pnpm run build
```

## Configuration

### Using npx (Recommended)

Add to your Claude Desktop or MCP client configuration:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["@daitasu/postgres-mcp", "postgresql://user:password@localhost:5432/database"]
    }
  }
}
```

### Using global installation

If you installed globally:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "postgres-mcp",
      "args": ["postgresql://user:password@localhost:5432/database"]
    }
  }
}
```

### Using local installation

```json
{
  "mcpServers": {
    "postgres": {
      "command": "node",
      "args": ["/path/to/postgres-mcp/dist/index.js", "postgresql://user:password@localhost:5432/database"]
    }
  }
}
```

### Command-line execution

```bash
# Using npx (no installation required)
npx @daitasu/postgres-mcp postgresql://user:password@localhost:5432/database

# Using global installation
postgres-mcp postgresql://user:password@localhost:5432/database

# Using node directly
node dist/index.js postgresql://user:password@localhost:5432/database
```

## Tool Usage

### 1. query - Execute SQL queries

```
Input: { "sql": "SELECT * FROM users LIMIT 10" }
Output: Query results (JSON format)
```

### 2. listTables - Get table list

```
Input: {}
Output: List of table names
```

### 3. getTableSchema - Get table schema

```
Input: { "tableName": "users" }
Output: List of column names and data types
```

## Security

- All queries are executed within READ ONLY transactions
- Data modification is not possible
- Automatically rolled back

## Development

```bash
# Development mode
pnpm run dev

# Tests
pnpm test

# Type checking
pnpm run typecheck

# Lint
pnpm run lint
```

## License

MIT