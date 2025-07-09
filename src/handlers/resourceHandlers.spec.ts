import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceHandlers } from './resourceHandlers';

describe('createResourceHandlers', () => {
  let mockPool: Pool;
  let mockClient: PoolClient;

  beforeEach(() => {
    // Mock client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolClient;

    // Mock pool
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    vi.clearAllMocks();
  });

  describe('listTables', () => {
    describe('正常系', () => {
      it('テーブル一覧を正しく取得すること', async () => {
        const handlers = createResourceHandlers(mockPool);
        const mockRows = [
          { table_name: 'users' },
          { table_name: 'posts' },
          { table_name: 'comments' },
        ];
        (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          rows: mockRows,
        });

        const result = await handlers.listTables();

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual([
          { tableName: 'users' },
          { tableName: 'posts' },
          { tableName: 'comments' },
        ]);
        expect(mockClient.query).toHaveBeenCalledWith(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('空のテーブル一覧を返すこと', async () => {
        const handlers = createResourceHandlers(mockPool);
        (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          rows: [],
        });

        const result = await handlers.listTables();

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual([]);
      });
    });

    describe('異常系', () => {
      it('クエリエラー時にエラーを返すこと', async () => {
        const handlers = createResourceHandlers(mockPool);
        const mockError = new Error('Database connection error');
        (mockClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          mockError,
        );

        const result = await handlers.listTables();

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('LIST_TABLES_ERROR');
        expect(error.message).toBe('Database connection error');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('Error以外のエラー時にデフォルトメッセージを返すこと', async () => {
        const handlers = createResourceHandlers(mockPool);
        (mockClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          'String error',
        );

        const result = await handlers.listTables();

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('LIST_TABLES_ERROR');
        expect(error.message).toBe('Unknown error');
      });
    });
  });

  describe('getTableSchema', () => {
    describe('正常系', () => {
      it('テーブルスキーマを正しく取得すること', async () => {
        const handlers = createResourceHandlers(mockPool);
        const mockRows = [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'name', data_type: 'character varying' },
          {
            column_name: 'created_at',
            data_type: 'timestamp without time zone',
          },
        ];
        (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          rows: mockRows,
        });

        const result = await handlers.getTableSchema('users');

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual([
          { columnName: 'id', dataType: 'integer' },
          { columnName: 'name', dataType: 'character varying' },
          { columnName: 'created_at', dataType: 'timestamp without time zone' },
        ]);
        expect(mockClient.query).toHaveBeenCalledWith(
          'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
          ['users'],
        );
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('異常系', () => {
      it('存在しないテーブルの場合エラーを返すこと', async () => {
        const handlers = createResourceHandlers(mockPool);
        (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          rows: [],
        });

        const result = await handlers.getTableSchema('non_existent_table');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('TABLE_NOT_FOUND');
        expect(error.message).toBe('Table "non_existent_table" not found');
      });

      it('クエリエラー時にエラーを返すこと', async () => {
        const handlers = createResourceHandlers(mockPool);
        const mockError = new Error('Query execution failed');
        (mockClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          mockError,
        );

        const result = await handlers.getTableSchema('users');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('GET_SCHEMA_ERROR');
        expect(error.message).toBe('Query execution failed');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });

  describe('parseResourceUri', () => {
    describe('正常系', () => {
      it('正しいURIからテーブル名を抽出すること', () => {
        const handlers = createResourceHandlers(mockPool);
        const result = handlers.parseResourceUri(
          'postgres://localhost/users/schema',
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe('users');
      });

      it('複雑なパスからテーブル名を抽出すること', () => {
        const handlers = createResourceHandlers(mockPool);
        const result = handlers.parseResourceUri(
          'postgres://db.example.com:5432/database/posts/schema',
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe('posts');
      });
    });

    describe('異常系', () => {
      it('スキーマパスが正しくない場合エラーを返すこと', () => {
        const handlers = createResourceHandlers(mockPool);
        const result = handlers.parseResourceUri(
          'postgres://localhost/users/wrong',
        );

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('INVALID_URI');
        expect(error.message).toBe('Invalid resource URI format');
      });

      it('テーブル名がない場合エラーを返すこと', () => {
        const handlers = createResourceHandlers(mockPool);
        const result = handlers.parseResourceUri(
          'postgres://localhost//schema',
        );

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('INVALID_URI');
        expect(error.message).toBe('Invalid resource URI format');
      });

      it('無効なURIの場合エラーを返すこと', () => {
        const handlers = createResourceHandlers(mockPool);
        const result = handlers.parseResourceUri('not-a-valid-uri');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('URI_PARSE_ERROR');
        expect(error.message).toBe('Failed to parse resource URI');
      });
    });
  });
});
