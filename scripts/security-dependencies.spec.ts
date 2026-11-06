import { createRequire } from "node:module";
import type * as LangChainTools from "@langchain/core/tools";
import { Client } from "@sendgrid/client";
import SendGrid = require("@sendgrid/mail");
import MailService = require("@sendgrid/mail/src/classes/mail-service");
import { emailBuilder } from "../src/shared/helpers/email";
import merge = require("deepmerge");
import { z } from "zod/v3";

const implementations: Array<[string, typeof merge]> = [
  ["commonjs", require("deepmerge/dist/cjs.js")],
  ["umd", require("deepmerge/dist/umd.js")],
];

describe.each(implementations)("deepmerge %s prototype poisoning", (_name, deepmerge) => {
  const malicious = () => JSON.parse('{"__proto__":{"admin":true}}');

  it.each(["source", "target", "nested"])("rejects magic keys from %s", location => {
    const result = location === "source"
      ? deepmerge(Object.create(null), malicious())
      : location === "target"
        ? deepmerge(malicious(), { safe: true })
        : deepmerge({}, { nested: malicious() }).nested;

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
    expect(result.admin).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "admin")).toBe(false);
  });

  it("preserves nested data, arrays, symbol keys, and custom merge callbacks", () => {
    const symbol = Symbol("metadata");
    const result = deepmerge(
      { nested: { first: true }, values: [1], [symbol]: { first: true } },
      { nested: { second: true }, values: [2], [symbol]: { second: true } },
    );
    expect(result.nested).toEqual({ first: true, second: true });
    expect(result.values).toEqual([1, 2]);
    expect(result[symbol]).toEqual({ first: true, second: true });
    expect(deepmerge({ count: 1 }, { count: 2 }, {
      customMerge: key => key === "count" ? (left, right) => left + right : undefined,
      isMergeableObject: value => typeof value === "number" || (value !== null && typeof value === "object"),
    }).count).toBe(3);
  });
});

describe("Zod v3 bounded collections", () => {
  it.each(["max", "length", "set"] as const)(
    "rejects oversized %s before element parsing and collection refinement",
    async kind => {
      const element = jest.fn((value: string) => value.toUpperCase());
      const refinement = jest.fn(() => true);
      const item = z.string().transform(element);
      const schema = kind === "set"
        ? z.set(item).max(2, "collection limit").refine(refinement)
        : kind === "length"
          ? z.array(item).length(2, "collection limit").refine(refinement)
          : z.array(item).max(2, "collection limit").refine(refinement);
      const oversized = kind === "set" ? new Set(["a", "b", "c"]) : ["a", "b", "c"];
      for (const result of [schema.safeParse(oversized), await schema.safeParseAsync(oversized)]) {
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toEqual([
            expect.objectContaining({ code: "too_big", maximum: 2, message: "collection limit" }),
          ]);
        }
      }
      expect(element).not.toHaveBeenCalled();
      expect(refinement).not.toHaveBeenCalled();
      const valid = kind === "set" ? new Set(["a", "b"]) : ["a", "b"];
      expect(schema.parse(valid)).toEqual(kind === "set" ? new Set(["A", "B"]) : ["A", "B"]);
      expect(element).toHaveBeenCalledTimes(2);
      expect(refinement).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves unbounded, minimum-only, and invalid-element behavior", () => {
    const values = ["a", "b", "c"];
    expect(z.array(z.string()).parse(values)).toEqual(values);
    expect(z.array(z.string()).min(2).parse(values)).toEqual(values);
    expect(z.set(z.string()).min(2).parse(new Set(values))).toEqual(new Set(values));
    expect(z.array(z.string()).max(2).safeParse([123]).success).toBe(false);
    expect(z.array(z.string()).length(2).safeParse(["a"]).success).toBe(false);
  });
});

describe("SendGrid production mail-building consumer", () => {
  it.each(["none", "global", "recipient"] as const)(
    "preserves mail and merges template data with %s prototype-poisoning input",
    async location => {
      const globalData = {
        profile: { company: "JobStash", name: "Default" },
        jobs: ["global-job"],
      };
      const recipientData = {
        profile: { name: "Ada" },
        jobs: ["recipient-job"],
      };
      if (location !== "none") {
        const data = location === "global" ? globalData : recipientData;
        // SendGrid merges global data as deepmerge's target. Own magic keys on
        // that target must be rejected, including on recursively cloned data.
        for (const target of [data, data.profile]) {
          Object.defineProperty(target, "__proto__", {
            enumerable: true,
            value: { securityConsumerPoisoned: true },
          });
        }
      }

      const mail = emailBuilder({
        from: "jobs@example.com",
        to: "ada@example.com",
        subject: "Your matching jobs",
        title: "Jobs for Ada",
        bodySections: [{ t: "text", text: "A new engineering role is available." }],
      });
      const client = new Client();
      // Only the network boundary is replaced: SendGrid's Mail,
      // Personalization, serialization, and deepmerge all execute unchanged.
      const request = jest.spyOn(client, "request").mockResolvedValue([
        { statusCode: 202, headers: {}, body: {} },
        {},
      ]);
      const sender: typeof SendGrid = new MailService();
      sender.setClient(client);
      try {
        await expect(sender.send({
          ...mail,
          templateId: "d-security-consumer",
          dynamicTemplateData: globalData,
          personalizations: [{
            to: "ada@example.com",
            dynamicTemplateData: recipientData,
          }],
        })).resolves.toEqual([{ statusCode: 202, headers: {}, body: {} }, {}]);

        expect(request).toHaveBeenCalledTimes(1);
        const outbound = request.mock.calls[0][0];
        expect(outbound).toMatchObject({ method: "POST", url: "/v3/mail/send" });
        expect(JSON.parse(JSON.stringify(outbound.body))).toEqual({
          from: { email: "jobs@example.com" },
          subject: "Your matching jobs",
          template_id: "d-security-consumer",
          content: [{ type: "text/html", value: mail.html }],
          personalizations: [{
            to: [{ email: "ada@example.com" }],
            dynamic_template_data: {
              profile: { company: "JobStash", name: "Ada" },
              jobs: ["global-job", "recipient-job"],
            },
          }],
        });
        expect(mail.html).toContain("A new engineering role is available.");
        const merged = outbound.body.personalizations[0].dynamic_template_data;
        // Equality alone misses inherited poison; inspect the live request
        // objects before JSON serialization could hide an altered prototype.
        for (const object of [merged, merged.profile]) {
          expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
          expect(Object.prototype.hasOwnProperty.call(object, "__proto__")).toBe(false);
          expect(object.securityConsumerPoisoned).toBeUndefined();
        }
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, "securityConsumerPoisoned")).toBe(false);
      } finally {
        request.mockRestore();
      }
    },
  );
});

describe("LangChain-owned Zod v3 tool-input consumer", () => {
  // Resolve through the installed application dependency, not the test's
  // hoisted Zod import, so a vulnerable nested consumer copy cannot pass.
  const openaiRequire = createRequire(require.resolve("@langchain/openai"));
  const toolsPath = openaiRequire.resolve("@langchain/core/tools");
  const { DynamicStructuredTool, ToolInputParsingException }: typeof LangChainTools =
    require(toolsPath);
  const { z: consumerZ }: { z: typeof z } =
    require(createRequire(toolsPath).resolve("zod/v3"));

  it.each(["max", "length", "set"] as const)(
    "rejects oversized %s tool inputs before transforms, refinements, or execution",
    async kind => {
      const transform = jest.fn((value: string) => value.toUpperCase());
      const refinement = jest.fn(() => true);
      const item = consumerZ.string().transform(transform);
      const collection = kind === "set"
        ? consumerZ.set(item).max(2, "tool collection limit").refine(refinement)
        : kind === "length"
          ? consumerZ.array(item).length(2, "tool collection limit").refine(refinement)
          : consumerZ.array(item).max(2, "tool collection limit").refine(refinement);
      const execute = jest.fn(async ({ items }: { items: string[] | Set<string> }) =>
        Array.from(items).join(","));
      const tool = new DynamicStructuredTool({
        name: `bounded_${kind}`,
        description: "Process a bounded collection",
        schema: consumerZ.object({ items: collection }),
        verboseParsingErrors: true,
        func: execute,
      });
      const oversized = kind === "set" ? new Set(["a", "b", "c"]) : ["a", "b", "c"];
      const rejected = tool.invoke({ items: oversized });
      await expect(rejected).rejects.toBeInstanceOf(ToolInputParsingException);
      await expect(rejected).rejects.toMatchObject({
        message: expect.stringContaining("tool collection limit"),
      });
      await expect(rejected).rejects.toMatchObject({
        message: expect.stringContaining('"code": "too_big"'),
      });
      expect(transform).not.toHaveBeenCalled();
      expect(refinement).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();

      const valid = kind === "set" ? new Set(["a", "b"]) : ["a", "b"];
      await expect(tool.invoke({ items: valid })).resolves.toBe("A,B");
      expect(transform).toHaveBeenCalledTimes(2);
      expect(refinement).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0]).toEqual({
        items: kind === "set" ? new Set(["A", "B"]) : ["A", "B"],
      });
    },
  );
});
