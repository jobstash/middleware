import * as Sentry from "@sentry/node";
import { ResponseWithNoData } from "src/shared/interfaces/response.interface";
import { JobsController } from "./jobs.controller";

jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  captureException: jest.fn(),
}));

const operations = [
  {
    name: "classification",
    method: "changeJobClassification",
    failure: "Failed to change job classification",
    invoke: (controller: JobsController): Promise<ResponseWithNoData> =>
      controller.changeClassification(
        {
          address: "fixture-wallet",
          cryptoNative: false,
          permissions: ["SUPER_ADMIN"],
        },
        { shortUUIDs: ["fixture-job"], classification: "DEVOPS" },
      ),
  },
  {
    name: "feature",
    method: "featureJobpost",
    failure: "Failed to make job featured",
    invoke: (controller: JobsController): Promise<ResponseWithNoData> =>
      controller.featureJobpost({
        shortUUID: "fixture-job",
        startDate: "2026-11-06T00:00:00.000Z",
        endDate: "2026-11-07T00:00:00.000Z",
      }),
  },
] as const;

describe.each(operations)("job $name mutation result ownership", operation => {
  let action: jest.Mock;
  let controller: JobsController;

  beforeEach(() => {
    action = jest.fn();
    controller = Object.assign(Object.create(JobsController.prototype), {
      jobsService: { [operation.method]: action },
      logger: { log: jest.fn(), error: jest.fn() },
    }) as JobsController;
    jest
      .mocked(Sentry.captureException)
      .mockReset()
      .mockReturnValue("fixture-event");
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([true, false])(
    "preserves a fulfilled service result: %s",
    async success => {
      const response = { success, message: "Fixture service result" };
      action.mockResolvedValue(response);
      await expect(operation.invoke(controller)).resolves.toBe(response);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  it("handles a genuinely rejected service promise in the existing catch", async () => {
    const failure = new Error("Synthetic service rejection");
    action.mockRejectedValue(failure);
    await expect(operation.invoke(controller)).resolves.toEqual({
      success: false,
      message: operation.failure,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });
});
