import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolHandlers } from './toolHandlers';

describe('createToolHandlers', () => {
  let mockPool: Pool;
  let mockClient: PoolClient;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

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

    // Mock console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  describe('executeQuery', () => {
    describe('正常系', () => {
      it('SQLクエリを正しく実行すること', async () => {
        const handlers = createToolHandlers(mockPool);
        const mockRows = [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ];
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;

        // BEGIN TRANSACTION READ ONLY
        queryMock.mockResolvedValueOnce({ rows: [] });
        // Actual query
        queryMock.mockResolvedValueOnce({ rows: mockRows });
        // ROLLBACK
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({
          sql: 'SELECT * FROM users',
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual(mockRows);

        // Verify transaction handling
        expect(queryMock).toHaveBeenCalledTimes(3);
        expect(queryMock).toHaveBeenNthCalledWith(
          1,
          'BEGIN TRANSACTION READ ONLY',
        );
        expect(queryMock).toHaveBeenNthCalledWith(2, 'SELECT * FROM users');
        expect(queryMock).toHaveBeenNthCalledWith(3, 'ROLLBACK');

        expect(mockClient.release).toHaveBeenCalled();
      });

      it('空の結果を返すこと', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;

        queryMock.mockResolvedValueOnce({ rows: [] });
        queryMock.mockResolvedValueOnce({ rows: [] });
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({
          sql: 'SELECT * FROM empty_table',
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual([]);
      });
    });

    describe('異常系', () => {
      it('クエリエラー時にエラーを返すこと', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        const mockError = new Error('Syntax error in SQL');

        // BEGIN TRANSACTION READ ONLY
        queryMock.mockResolvedValueOnce({ rows: [] });
        // Actual query fails
        queryMock.mockRejectedValueOnce(mockError);
        // ROLLBACK after error
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({ sql: 'INVALID SQL' });

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('QUERY_ERROR');
        expect(error.message).toBe('Syntax error in SQL');
        expect(error.detail).toBeUndefined();

        expect(mockClient.release).toHaveBeenCalled();
      });

      it('詳細エラー情報を含むエラーを返すこと', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        interface PostgresError extends Error {
          detail?: string;
        }
        const mockError = new Error('Column does not exist') as PostgresError;
        mockError.detail =
          'Column "unknown_column" does not exist in table "users"';

        queryMock.mockResolvedValueOnce({ rows: [] });
        queryMock.mockRejectedValueOnce(mockError);
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({
          sql: 'SELECT unknown_column FROM users',
        });

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('QUERY_ERROR');
        expect(error.message).toBe('Column does not exist');
        expect(error.detail).toBe(
          'Column "unknown_column" does not exist in table "users"',
        );
      });

      it('ロールバックに失敗した場合でも警告を出力すること', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        const mockError = new Error('Query failed');
        const rollbackError = new Error('Rollback failed');

        queryMock.mockResolvedValueOnce({ rows: [] });
        queryMock.mockRejectedValueOnce(mockError);
        // ROLLBACK also fails
        queryMock.mockRejectedValueOnce(rollbackError);

        const result = await handlers.executeQuery({ sql: 'FAILING QUERY' });

        expect(result.isErr()).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Could not roll back transaction:',
          rollbackError,
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('Error以外のエラー時にデフォルトメッセージを返すこと', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;

        queryMock.mockResolvedValueOnce({ rows: [] });
        queryMock.mockRejectedValueOnce('String error');
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({ sql: 'QUERY' });

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('QUERY_ERROR');
        expect(error.message).toBe('Unknown query error');
        expect(error.detail).toBeUndefined();
      });

      it('トランザクション開始時にエラーが発生した場合', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        const mockError = new Error('Cannot start transaction');

        // BEGIN TRANSACTION READ ONLY fails
        queryMock.mockRejectedValueOnce(mockError);
        // ROLLBACK attempt
        queryMock.mockResolvedValueOnce({ rows: [] });

        const result = await handlers.executeQuery({ sql: 'SELECT 1' });

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('QUERY_ERROR');
        expect(error.message).toBe('Cannot start transaction');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('リソース管理', () => {
      it('成功時にクライアントをリリースすること', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        queryMock.mockResolvedValue({ rows: [] });

        await handlers.executeQuery({ sql: 'SELECT 1' });

        expect(mockClient.release).toHaveBeenCalledTimes(1);
      });

      it('エラー時にクライアントをリリースすること', async () => {
        const handlers = createToolHandlers(mockPool);
        const queryMock = mockClient.query as ReturnType<typeof vi.fn>;
        queryMock.mockRejectedValue(new Error('Error'));

        await handlers.executeQuery({ sql: 'INVALID' });

        expect(mockClient.release).toHaveBeenCalledTimes(1);
      });
    });
  });
});
