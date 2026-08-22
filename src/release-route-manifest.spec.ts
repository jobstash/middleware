import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces/access-workspaces.controller";
import { AdminIngestionController } from "./admin-ingestion/admin-ingestion.controller";
import { PublicProfilesController } from "./auth/profile/public-profiles.controller";
import { JobClassificationsController } from "./jobs/job-classifications.controller";
import { JobsController } from "./jobs/jobs.controller";
import { OrganizationsController } from "./organizations/organizations.controller";
import { PeopleIntelligenceController } from "./people-intelligence/people-intelligence.controller";
import {
  RELEASE_OPENAPI_MANIFEST,
  RELEASE_ROUTE_MANIFEST,
} from "./release-route-manifest";
import { SearchController } from "./search/search.controller";
import { SearchV2Controller } from "./search/v2/search-v2.controller";
import { StripeController } from "./stripe/stripe.controller";
import { UserController } from "./user/user.controller";

const controllers = {
  AccessWorkspacesController,
  AdminIngestionController,
  InspectController,
  JobClassificationsController,
  JobsController,
  OrganizationsController,
  PeopleIntelligenceController,
  PublicProfilesController,
  SearchController,
  SearchV2Controller,
  StripeController,
  UserController,
};

const methods: Record<string, RequestMethod> = {
  GET: RequestMethod.GET,
  POST: RequestMethod.POST,
  PUT: RequestMethod.PUT,
  DELETE: RequestMethod.DELETE,
};

describe("reviewed route/OpenAPI manifest", () => {
  it.each(RELEASE_ROUTE_MANIFEST)(
    "%s_%s is %s %s (%s)",
    (controllerName, methodName, verb, path) => {
      const controller = controllers[controllerName];
      const handler = controller.prototype[methodName];
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller);
      const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) ?? "";
      const resolvedPath = [controllerPath, handlerPath]
        .filter(Boolean)
        .join("/")
        .replace(/\/+/, "/")
        .replace(/\/$/, "");

      expect(resolvedPath).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(methods[verb]);
      expect(`${controllerName}_${methodName}`).toMatch(
        /^[A-Za-z][A-Za-z0-9]*Controller_[A-Za-z][A-Za-z0-9]*$/,
      );
    },
  );

  it("contains unique method/path and OpenAPI-operation identities", () => {
    const routes = RELEASE_ROUTE_MANIFEST.map(
      ([, , verb, path]) => `${verb} ${path}`,
    );
    const operations = RELEASE_ROUTE_MANIFEST.map(
      ([controller, method]) => `${controller}_${method}`,
    );
    expect(new Set(routes).size).toBe(routes.length);
    expect(new Set(operations).size).toBe(operations.length);
  });

  it.each(RELEASE_ROUTE_MANIFEST)(
    "includes %s_%s in the explicit OpenAPI manifest",
    (controller, handler, verb, path, state) => {
      const openApiPath = `/${path.replace(/:([^/]+)/g, "{$1}")}`;
      expect(
        RELEASE_OPENAPI_MANIFEST.paths[openApiPath]?.[verb.toLowerCase()],
      ).toEqual({
        operationId: `${controller}_${handler}`,
        "x-jobstash-route-state": state,
      });
    },
  );

  it("uses an OpenAPI 3 manifest with no undocumented reviewed paths", () => {
    expect(RELEASE_OPENAPI_MANIFEST.openapi).toBe("3.0.3");
    const operationCount = Object.values(
      RELEASE_OPENAPI_MANIFEST.paths,
    ).flatMap(path => Object.values(path)).length;
    expect(operationCount).toBe(RELEASE_ROUTE_MANIFEST.length);
  });

  it("does not advertise removed aliases as active operations", () => {
    const activePaths = RELEASE_ROUTE_MANIFEST.filter(
      ([, , , , state]) => state === "active",
    ).map(([, , , path]) => path);
    expect(activePaths).not.toContain("people/directory");
    expect(activePaths).not.toContain("people/:login");
    expect(activePaths).not.toContain("organizations/details/slug/:slug/team");
    expect(activePaths).not.toContain("jobs/for-me/:country");
    expect(activePaths).not.toContain("job-classifications/:legacyAlias");
  });
});
