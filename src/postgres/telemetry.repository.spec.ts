import { TelemetryRepository } from "./telemetry.repository";
import { PostgresService } from "./postgres.service";

type Row = Record<string, unknown>;

type LoginGraphState = {
  historyNodeId: string | null;
  loginHistoryInserts: number;
  loginHistoryUpdates: number;
  loginEventInserts: { nodeKey: string; properties: Row }[];
  relationshipInserts: { type: string; sourceId: string; targetId: string }[];
};

describe("TelemetryRepository", () => {
  let postgresQuery: jest.Mock;
  let managerQuery: jest.Mock;
  let transaction: jest.Mock;
  let repository: TelemetryRepository;

  beforeEach(() => {
    postgresQuery = jest.fn().mockResolvedValue([]);
    managerQuery = jest.fn();
    transaction = jest.fn(async work => work({ query: managerQuery }));
    repository = new TelemetryRepository({
      query: postgresQuery,
      transaction,
    } as unknown as PostgresService);
  });

  const stubLoginGraph = (
    options: { userFound?: boolean } = {},
  ): LoginGraphState => {
    const state: LoginGraphState = {
      historyNodeId: null,
      loginHistoryInserts: 0,
      loginHistoryUpdates: 0,
      loginEventInserts: [],
      relationshipInserts: [],
    };
    let insertCounter = 0;
    managerQuery.mockImplementation(
      async (sql: string, parameters: unknown[]): Promise<Row[]> => {
        if (sql.includes("WHERE label = 'User'")) {
          return options.userFound === false ? [] : [{ nodeId: "user-node-1" }];
        }
        if (sql.includes("JOIN graph_nodes history")) {
          return state.historyNodeId ? [{ nodeId: state.historyNodeId }] : [];
        }
        if (sql.includes("UPDATE graph_nodes")) {
          state.loginHistoryUpdates += 1;
          return [];
        }
        if (sql.includes("INSERT INTO graph_nodes")) {
          insertCounter += 1;
          const nodeId = `inserted-node-${insertCounter}`;
          const properties = JSON.parse(parameters[1] as string) as Row;
          if (sql.includes("'LoginHistory'")) {
            state.loginHistoryInserts += 1;
            state.historyNodeId = nodeId;
          }
          if (sql.includes("'LoginEvent'")) {
            state.loginEventInserts.push({
              nodeKey: parameters[0] as string,
              properties,
            });
          }
          return [{ nodeId }];
        }
        if (sql.includes("INSERT INTO graph_relationships")) {
          state.relationshipInserts.push({
            type: sql.includes("'HAS_LOGIN_EVENT'")
              ? "HAS_LOGIN_EVENT"
              : "LOGGED_IN",
            sourceId: parameters[0] as string,
            targetId: parameters[1] as string,
          });
          return [];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    return state;
  };

  it("appends one LoginEvent per login while keeping a single LoginHistory node", async () => {
    const state = stubLoginGraph();

    await repository.logUserLoginEvent("privy-1", { method: "email" });
    await repository.logUserLoginEvent("0xabc", { method: "google_oauth" });

    expect(state.loginHistoryInserts).toBe(1);
    expect(state.loginHistoryUpdates).toBe(1);
    expect(state.loginEventInserts).toHaveLength(2);
    const [first, second] = state.loginEventInserts;
    expect(first.properties.id).not.toBe(second.properties.id);
    expect(first.nodeKey).toBe(`runtime:${first.properties.id}`);
    expect(first.properties.at).toEqual(expect.any(Number));
    expect(first.properties.method).toBe("email");
    expect(second.properties.method).toBe("google_oauth");
    for (const event of state.loginEventInserts) {
      expect(event.properties).not.toHaveProperty("ip");
      expect(event.properties).not.toHaveProperty("userAgent");
    }
    const historyRelationships = state.relationshipInserts.filter(
      insert => insert.type === "LOGGED_IN",
    );
    const eventRelationships = state.relationshipInserts.filter(
      insert => insert.type === "HAS_LOGIN_EVENT",
    );
    expect(historyRelationships).toHaveLength(1);
    expect(eventRelationships).toHaveLength(2);
    for (const relationship of eventRelationships) {
      expect(relationship.sourceId).toBe("user-node-1");
    }
  });

  it("writes no telemetry when the user cannot be resolved", async () => {
    const state = stubLoginGraph({ userFound: false });

    await repository.logUserLoginEvent("0xunknown", { method: "email" });

    expect(state.loginHistoryInserts).toBe(0);
    expect(state.loginHistoryUpdates).toBe(0);
    expect(state.loginEventInserts).toHaveLength(0);
    expect(state.relationshipInserts).toHaveLength(0);
  });

  it("does not throw when a graph write fails", async () => {
    managerQuery.mockRejectedValue(new Error("connection reset"));

    await expect(
      repository.logUserLoginEvent("0xabc"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the transaction itself fails", async () => {
    transaction.mockImplementationOnce(async () => {
      throw new Error("database unavailable");
    });

    await expect(
      repository.logUserLoginEvent("0xabc"),
    ).resolves.toBeUndefined();
  });

  it("reads the latest login timestamp with a LoginHistory fallback", async () => {
    postgresQuery.mockResolvedValue([{ lastLoginAt: "1753431000000" }]);

    await expect(repository.getLastLoginAt("0xabc")).resolves.toBe(
      1753431000000,
    );
    const [sql, parameters] = postgresQuery.mock.calls[0];
    expect(sql).toContain("event.label = 'LoginEvent'");
    expect(sql).toContain("relationship.type = 'HAS_LOGIN_EVENT'");
    expect(sql).toContain("event.properties ->> 'at'");
    expect(sql).toContain("history.label = 'LoginHistory'");
    expect(sql).toContain("relationship.type = 'LOGGED_IN'");
    expect(parameters).toEqual(["0xabc"]);
  });

  it("returns null when no login telemetry exists", async () => {
    postgresQuery.mockResolvedValue([{ lastLoginAt: null }]);

    await expect(repository.getLastLoginAt("0xabc")).resolves.toBeNull();
  });
});
