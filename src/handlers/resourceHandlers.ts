import { Pool } from 'pg';
import { ok, err, Result } from 'neverthrow';
import { SCHEMA_PATH, TableInfo, ColumnInfo, PostgresError } from '../types/postgres.js';

export const createResourceHandlers = (pool: Pool) => {
  const listTables = async (): Promise<Result<TableInfo[], PostgresError>> => {
    const client = await pool.connect();
    try {
      const result = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      
      const tableInfos: TableInfo[] = result.rows.map(row => ({
        tableName: row.table_name,
      }));
      
      return ok(tableInfos);
    } catch (error) {
      const pgError: PostgresError = {
        code: 'LIST_TABLES_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      return err(pgError);
    } finally {
      client.release();
    }
  };

  const getTableSchema = async (tableName: string): Promise<Result<ColumnInfo[], PostgresError>> => {
    const client = await pool.connect();
    try {
      const result = await client.query<{ column_name: string; data_type: string }>(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
        [tableName]
      );

      if (result.rows.length === 0) {
        return err({
          code: 'TABLE_NOT_FOUND',
          message: `Table "${tableName}" not found`,
        });
      }

      const columnInfos: ColumnInfo[] = result.rows.map(row => ({
        columnName: row.column_name,
        dataType: row.data_type,
      }));

      return ok(columnInfos);
    } catch (error) {
      const pgError: PostgresError = {
        code: 'GET_SCHEMA_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      return err(pgError);
    } finally {
      client.release();
    }
  };

  const parseResourceUri = (uri: string): Result<string, PostgresError> => {
    try {
      const resourceUrl = new URL(uri);
      const pathComponents = resourceUrl.pathname.split('/');
      const schema = pathComponents.pop();
      const tableName = pathComponents.pop();

      if (schema !== SCHEMA_PATH || !tableName) {
        return err({
          code: 'INVALID_URI',
          message: 'Invalid resource URI format',
        });
      }

      return ok(tableName);
    } catch (error) {
      return err({
        code: 'URI_PARSE_ERROR',
        message: 'Failed to parse resource URI',
      });
    }
  };

  return {
    listTables,
    getTableSchema,
    parseResourceUri,
  };
};