import { EcosystemJobListParams } from "src/ecosystems/dto/ecosystem-job-list.input";
import { ChainListParams } from "src/chains/dto/chain-list.input";
import { InvestorListParams } from "src/investors/dto/investor-list.input";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { OrgListParams } from "src/organizations/dto/org-list.input";
import { SearchOrganizationsInput } from "src/organizations/dto/search-organizations.input";
import { ProjectListParams } from "src/projects/dto/project-list.input";
import { SearchProjectsInput } from "src/projects/dto/search-projects.input";
import {
  FILTER_ENDPOINT_SPECS,
  FilterEndpointSpec,
  expectedPairCoverage,
  generateFilterMatrix,
} from "./filter-parity-matrix";

describe("filter parity matrix manifest", () => {
  it("has one specification per operation", () => {
    const operationIds = FILTER_ENDPOINT_SPECS.map(spec => spec.operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it.each([
    ["JobsController_getJobsListWithSearch", new JobListParams()],
    ["PublicController_getAllJobs", new JobListParams()],
    ["PublicController_getAllJobsList", new JobListParams()],
    ["OrganizationsController_getOrgsListWithSearch", new OrgListParams()],
    [
      "OrganizationsController_searchOrganizations",
      new SearchOrganizationsInput(),
    ],
    ["ProjectsController_getProjectsListWithSearch", new ProjectListParams()],
    ["ProjectsController_searchProjects", new SearchProjectsInput()],
    ["EcosystemsController_getEcosystemJobs", new EcosystemJobListParams()],
    ["ChainsController_getChainList", new ChainListParams()],
    ["InvestorsController_getInvestorList", new InvestorListParams()],
  ])("models every DTO property for %s", (operationId, dto) => {
    const spec = findSpec(operationId as string);
    expect(spec.parameters.map(parameter => parameter.name).sort()).toEqual(
      Object.keys(dto).sort(),
    );
  });

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "generates every value class for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "single");
      for (const parameter of spec.parameters) {
        for (const item of parameter.values) {
          expect(
            cases.some(
              matrixCase =>
                matrixCase.coveredParameters.includes(parameter.name) &&
                matrixCase.query[parameter.name] === item.value,
            ),
          ).toBe(true);
        }
      }
    },
  );

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "generates every invalid value class for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "single");
      for (const parameter of spec.parameters) {
        for (const item of parameter.invalidValues ?? []) {
          expect(
            cases.some(
              matrixCase =>
                matrixCase.kind === "validation" &&
                matrixCase.coveredParameters.includes(parameter.name) &&
                matrixCase.query[parameter.name] === item.value,
            ),
          ).toBe(true);
        }
      }
    },
  );

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "covers every modeled parameter pair for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "pair");
      const covered = new Set(
        cases.flatMap(matrixCase => {
          const parameters = matrixCase.coveredParameters.filter(name =>
            spec.parameters.some(
              parameter =>
                parameter.name === name && parameter.interaction !== false,
            ),
          );
          return parameters.flatMap((left, index) =>
            parameters.slice(index + 1).map(right => `${left}|${right}`),
          );
        }),
      );
      expect([...covered].sort()).toEqual(expectedPairCoverage(spec).sort());
    },
  );

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "tests every supported sort in both directions for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "single");
      const orderBy = spec.parameters.find(
        parameter => parameter.name === "orderBy",
      );
      const order = spec.parameters.find(
        parameter => parameter.name === "order",
      );
      if (!orderBy || !order) return;

      for (const field of orderBy.values) {
        for (const direction of order.values) {
          expect(
            cases.some(
              matrixCase =>
                matrixCase.kind === "sort" &&
                matrixCase.query.orderBy === field.value &&
                matrixCase.query.order === direction.value,
            ),
          ).toBe(true);
        }
      }
    },
  );

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "tests valid, equal, and invalid range permutations for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "single");
      for (const range of spec.ranges ?? []) {
        const rangeCases = cases.filter(
          matrixCase =>
            matrixCase.kind === "range" &&
            matrixCase.coveredParameters.includes(range.minimum) &&
            matrixCase.coveredParameters.includes(range.maximum),
        );
        expect(rangeCases).toHaveLength(3);
      }
    },
  );

  it.each(FILTER_ENDPOINT_SPECS.map(spec => [spec.operationId, spec]))(
    "does not generate duplicate requests for %s",
    (_operationId, rawSpec) => {
      const spec = rawSpec as FilterEndpointSpec;
      const cases = generateFilterMatrix(spec, "pair");
      const requests = cases.map(matrixCase =>
        JSON.stringify([matrixCase.path, matrixCase.query, matrixCase.headers]),
      );
      expect(new Set(requests).size).toBe(requests.length);
    },
  );
});

const findSpec = (operationId: string): FilterEndpointSpec => {
  const spec = FILTER_ENDPOINT_SPECS.find(
    candidate => candidate.operationId === operationId,
  );
  if (!spec) throw new Error(`Missing filter endpoint spec: ${operationId}`);
  return spec;
};
