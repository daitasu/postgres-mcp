import { Pool } from 'pg';
import { ok, err, Result } from 'neverthrow';
import { QueryToolInput, PostgresError } from '../types/postgres.js';

export const createToolHandlers = (pool: Pool) => {
  const executeQuery = async (input: QueryToolInput): Promise<Result<any[], PostgresError>> => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      
      const result = await client.query(input.sql);
      
      await client.query('ROLLBACK');
      
      return ok(result.rows);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.warn('Could not roll back transaction:', rollbackError);
      }
      
      const pgError: PostgresError = {
        code: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown query error',
        detail: error instanceof Error && 'detail' in error ? (error as any).detail : undefined,
      };
      
      return err(pgError);
    } finally {
      client.release();
    }
  };

  return {
    executeQuery,
  };
};