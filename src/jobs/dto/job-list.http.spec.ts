import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import request = require("supertest");
import { JobsController } from "../jobs.controller";
import { JobsService } from "../jobs.service";
import { TagsService } from "src/tags/tags.service";
import { UserService } from "src/user/user.service";
import { StripeService } from "src/stripe/stripe.service";
import { AccountService } from "src/auth/account/account.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { AuthService } from "src/auth/auth.service";
import { JobListParams } from "./job-list.input";
import { JobFeedParams } from "./job-feed.input";
import { parseHttpQuery } from "src/shared/helpers/http-query-parser";

const listKeys = [
  "tags",
  "organizations",
  "chains",
  "ecosystems",
  "projects",
  "classifications",
  "organizationClassifications",
  "commitments",
  "fundingRounds",
  "fundingStages",
  "investors",
  "seniority",
  "workModes",
  "availability",
  "cities",
  "regions",
  "countries",
  "continents",
  "timezones",
  "collaborationHours",
] as const;

// Exercise the real production controller, PBAC guard, DTO and Express extended
// query parser. Only the post-validation service boundary is captured here;
// repository/HTTP-to-PostgreSQL behavior is covered by the projection suite.
describe("job filter HTTP input bounds", () => {
  let app: INestApplication;
  const getJobFeed = jest.fn().mockResolvedValue({
    mode: "individual",
    page: 1,
    count: 0,
    total: 0,
    totalJobs: 0,
    data: [],
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: { getJobFeed } },
        {
          provide: AuthService,
          useValue: {
            getSession: async (): Promise<{ permissions: string[] }> => ({
              permissions: [],
            }),
          },
        },
        ...[
          TagsService,
          UserService,
          StripeService,
          AccountService,
          ProfileService,
          SubscriptionsService,
        ].map(provide => ({ provide, useValue: {} })),
      ],
    }).compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set("query parser", parseHttpQuery);
    app.useLogger(false);
    await app.init();
  });
  beforeEach(() => getJobFeed.mockClear());
  afterAll(async () => app?.close());

  it.each(["query", "titleQuery", "organizationId"] as const)(
    "accepts 256 and rejects 257 decoded characters for %s",
    async key => {
      const allowed = "é".repeat(256);
      await request(app.getHttpServer())
        .get(`/jobs/feed?${key}=${encodeURIComponent(allowed)}`)
        .expect(200);
      expect(getJobFeed.mock.calls[0][0][key]).toBe(allowed);
      getJobFeed.mockClear();
      await request(app.getHttpServer())
        .get(`/jobs/feed?${key}=${encodeURIComponent(allowed + "é")}`)
        .expect(400);
      expect(getJobFeed).not.toHaveBeenCalled();
    },
  );

  it.each(listKeys)(
    "accepts 100 and rejects 101 repeated %s values without deduplication",
    async key => {
      const value =
        key === "organizationClassifications"
          ? "crypto"
          : key === "workModes"
            ? "remote"
            : "selected";
      const query = Array.from({ length: 100 }, () => `${key}=${value}`).join(
        "&",
      );
      await request(app.getHttpServer()).get(`/jobs/feed?${query}`).expect(200);
      expect(getJobFeed.mock.calls[0][0][key]).toEqual(Array(100).fill(value));
      getJobFeed.mockClear();
      await request(app.getHttpServer())
        .get(`/jobs/feed?${query}&${key}=${value}`)
        .expect(400);
      expect(getJobFeed).not.toHaveBeenCalled();
    },
  );

  it.each(
    listKeys.filter(
      key => key !== "organizationClassifications" && key !== "workModes",
    ),
  )("bounds every individual %s value after comma decoding", async key => {
    const allowed = "x".repeat(256);
    await request(app.getHttpServer())
      .get(`/jobs/feed?${key}=${allowed}%2Csecond`)
      .expect(200);
    expect(getJobFeed.mock.calls[0][0][key]).toEqual([allowed, "second"]);
    getJobFeed.mockClear();
    await request(app.getHttpServer())
      .get(`/jobs/feed?${key}=${allowed}x%2Csecond`)
      .expect(400);
    expect(getJobFeed).not.toHaveBeenCalled();
  });

  it("preserves comma, repeated and bracket-array order, duplicates and empty values", async () => {
    for (const query of [
      "tags=b%2Ca%2Cb%2C",
      "tags=b&tags=a&tags=b&tags=",
      "tags[]=b&tags[]=a&tags[]=b&tags[]=",
    ]) {
      await request(app.getHttpServer())
        .get(`/jobs/feed?${query}&page=-1&limit=5000`)
        .expect(200);
      expect(getJobFeed.mock.calls.at(-1)[0]).toMatchObject({
        tags: ["b", "a", "b", ""],
        page: -1,
        limit: 5000,
      });
    }
    for (const query of [
      "tags=" + Array(101).fill("x").join("%2C"),
      Array(101).fill("tags[]=x").join("&"),
      "tags[object][value]=x",
      "tags[0][value]=x",
      "query[]=x&query[]=y",
      "organizationId[nested]=x",
      "titleQuery[nested]=x",
    ]) {
      getJobFeed.mockClear();
      await request(app.getHttpServer()).get(`/jobs/feed?${query}`).expect(400);
      expect(getJobFeed).not.toHaveBeenCalled();
    }
  });

  it("preserves indexed and mixed arrays while rejecting index overflow", async () => {
    const values = Array.from({ length: 100 }, (_, index) => String(index));
    const indexed = values
      .map((value, index) => `tags[${index}]=${value}`)
      .join("&");
    await request(app.getHttpServer()).get(`/jobs/feed?${indexed}`).expect(200);
    expect(getJobFeed.mock.calls.at(-1)[0].tags).toEqual(values);
    getJobFeed.mockClear();
    await request(app.getHttpServer())
      .get(`/jobs/feed?${indexed}&tags[100]=overflow`)
      .expect(400);
    expect(getJobFeed).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get("/jobs/feed?tags=first&tags[]=second&tags[]=first&query=123")
      .expect(200);
    expect(getJobFeed.mock.calls.at(-1)[0]).toMatchObject({
      tags: ["first", "second", "first"],
      query: "123",
    });
  });

  it("validates decoded Unicode characters without measuring percent-encoded bytes", async () => {
    const allowed = "😀".repeat(256);
    expect(allowed.length).toBe(512);
    await request(app.getHttpServer())
      .get(`/jobs/feed?query=${encodeURIComponent(allowed)}`)
      .expect(200);
    expect(getJobFeed.mock.calls.at(-1)[0].query).toBe(allowed);
    getJobFeed.mockClear();
    await request(app.getHttpServer())
      .get(`/jobs/feed?query=${encodeURIComponent(allowed + "😀")}`)
      .expect(400);
    expect(getJobFeed).not.toHaveBeenCalled();
  });

  it("never truncates excess parameters or admits prototype-key objects", async () => {
    const prefix = Array(1000).fill("ignored").join("&");
    await request(app.getHttpServer())
      .get(`/jobs/feed?${prefix}&query=${"x".repeat(257)}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/jobs/feed?${Array(4097).fill("a").join("&")}`)
      .expect(400);
    expect(getJobFeed).not.toHaveBeenCalled();
    for (const query of [
      "__proto__[polluted]=true&query=123",
      "tags[constructor]=x",
      "tags[__proto__]=x",
      "tags%5Bconstr%75ctor%5D=x",
      "tags[prototype]=x",
      "tags[toString]=x",
    ]) {
      await request(app.getHttpServer()).get(`/jobs/feed?${query}`).expect(400);
      expect(getJobFeed).not.toHaveBeenCalled();
    }
    expect(Object.prototype).not.toHaveProperty("polluted");
    await request(app.getHttpServer())
      .get("/jobs/feed?tags=constructor&query=__proto__")
      .expect(200);
    expect(getJobFeed.mock.calls.at(-1)[0]).toMatchObject({
      tags: ["constructor"],
      query: "__proto__",
    });
    getJobFeed.mockClear();
    await request(app.getHttpServer())
      .get("/jobs/feed?tags[a][b][c][d][e][f]=x")
      .expect(400);
    expect(getJobFeed).not.toHaveBeenCalled();
  });

  it.each([JobListParams, JobFeedParams])(
    "preserves omitted, empty and null optional inputs in %p",
    async Input => {
      for (const value of [undefined, null, ""]) {
        const input = plainToInstance(
          Input,
          Object.fromEntries([
            ...listKeys
              .filter(
                key =>
                  key !== "organizationClassifications" && key !== "workModes",
              )
              .map(key => [key, value]),
            ...["query", "titleQuery", "organizationId"].map(key => [
              key,
              value,
            ]),
          ]),
        );
        expect(await validate(input, { whitelist: true })).toEqual([]);
      }
      const emptyLists = plainToInstance(
        Input,
        Object.fromEntries(listKeys.map(key => [key, []])),
      );
      expect(await validate(emptyLists, { whitelist: true })).toEqual([]);
      for (const key of listKeys) expect(emptyLists[key]).toEqual([]);
      await request(app.getHttpServer())
        .get("/jobs/feed?query=&titleQuery=&organizationId=&tags=")
        .expect(200);
      expect(getJobFeed.mock.calls.at(-1)[0]).toMatchObject({
        query: "",
        titleQuery: "",
        organizationId: "",
        tags: [""],
      });
    },
  );
});
