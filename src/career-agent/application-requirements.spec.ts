import { applicationRequirements } from "./application-requirements";

it("finds requirements after a long company introduction without retaining navigation or headings", () => {
  const introduction = Array.from(
    { length: 50 },
    (_, i) => `Our platform serves market ${i}.`,
  ).join("\n");
  expect(
    applicationRequirements({
      description: `Senior Product Manager\n* [](https://example.com)\n=====================\n**About us**\n${introduction}\n**Requirements:**\n-------------------\n* Experience building TypeScript APIs.\n* Lead product discovery with customers.\n**Benefits**\nWe offer a generous holiday allowance.`,
    }),
  ).toEqual([
    "* Experience building TypeScript APIs.",
    "* Lead product discovery with customers.",
  ]);
});
it("retains explicit requirements and identifies candidate language without headings", () => {
  expect(
    applicationRequirements({
      requirements: [
        "Build reliable PostgreSQL services",
        "Communicate clearly with colleagues",
      ],
    }),
  ).toHaveLength(2);
  expect(
    applicationRequirements({
      description:
        "We are backed by investors. You will develop PostgreSQL services. We build the future.",
    }),
  ).toEqual(["You will develop PostgreSQL services."]);
});
