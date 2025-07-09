import { z } from 'zod';

export const SCHEMA_PATH = 'schema';

export type TableInfo = {
  tableName: string;
};

export type ColumnInfo = {
  columnName: string;
  dataType: string;
};

export const QueryToolInputSchema = z.object({
  sql: z.string().describe('SQL query to execute'),
});

export type QueryToolInput = z.infer<typeof QueryToolInputSchema>;

export type PostgresError = {
  code: string;
  message: string;
  detail?: string;
};