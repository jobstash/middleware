import { join } from "node:path";
import {
  Decorator,
  Expression,
  Node,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  RELEASE_OPENAPI_MANIFEST,
  RELEASE_ROUTE_MANIFEST,
} from "./release-route-manifest";

type RegisteredRoute = readonly [
  controller: string,
  handler: string,
  verb: string,
  path: string,
];

const HTTP_DECORATORS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
};

function importedSource(source: SourceFile, name: string): SourceFile | null {
  for (const declaration of source.getImportDeclarations()) {
    const importsName =
      declaration.getNamedImports().some(item => item.getName() === name) ||
      declaration.getDefaultImport()?.getText() === name;
    if (importsName) return declaration.getModuleSpecifierSourceFile() ?? null;
  }
  return null;
}

function decoratorPaths(decorator: Decorator | undefined): string[] {
  const argument = decorator?.getArguments()[0];
  if (!argument) return [""];
  if (
    Node.isStringLiteral(argument) ||
    Node.isNoSubstitutionTemplateLiteral(argument)
  ) {
    return [argument.getLiteralText()];
  }
  if (Node.isArrayLiteralExpression(argument)) {
    return argument.getElements().map(element => {
      if (
        !Node.isStringLiteral(element) &&
        !Node.isNoSubstitutionTemplateLiteral(element)
      ) {
        throw new Error(
          `Route array uses a dynamic path: ${element.getText()}`,
        );
      }
      return element.getLiteralText();
    });
  }
  throw new Error(`Route decorator uses a dynamic path: ${argument.getText()}`);
}

function moduleArray(
  source: SourceFile,
  propertyName: string,
): Expression[] | undefined {
  const moduleClass = source
    .getClasses()
    .find(candidate => candidate.getDecorator("Module"));
  const object = moduleClass
    ?.getDecorator("Module")
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  return object
    ?.getProperty(propertyName)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression)
    ?.getElements();
}

function importedModuleName(expression: Expression): string {
  const forwardReference = expression
    .getText()
    .match(/^forwardRef\(\(\)\s*=>\s*([A-Za-z_$][\w$]*)\)$/);
  return forwardReference?.[1] ?? expression.getText().split(/[.(]/, 1)[0];
}

function discoverRegisteredRoutes(): RegisteredRoute[] {
  const root = join(__dirname, "..");
  const project = new Project({
    tsConfigFilePath: join(root, "tsconfig.json"),
  });
  const visited = new Set<string>();
  const controllers = new Map<string, SourceFile>();

  const visitModule = (source: SourceFile | null): void => {
    if (!source || visited.has(source.getFilePath())) return;
    visited.add(source.getFilePath());
    for (const expression of moduleArray(source, "controllers") ?? []) {
      const name = expression.getText();
      controllers.set(name, importedSource(source, name) ?? source);
    }
    for (const expression of moduleArray(source, "imports") ?? []) {
      const name = importedModuleName(expression);
      const imported = importedSource(source, name);
      if (imported?.getFilePath().startsWith(root)) visitModule(imported);
    }
  };
  visitModule(project.getSourceFileOrThrow("src/app.module.ts"));

  const routes: RegisteredRoute[] = [];
  for (const [controllerName, source] of controllers) {
    const controller = source.getClassOrThrow(controllerName);
    const bases = decoratorPaths(controller.getDecorator("Controller"));
    for (const handler of controller.getMethods()) {
      for (const decorator of handler.getDecorators()) {
        const verb = HTTP_DECORATORS[decorator.getName()];
        if (!verb) continue;
        for (const base of bases) {
          for (const suffix of decoratorPaths(decorator)) {
            const path = [base, suffix]
              .filter(Boolean)
              .join("/")
              .replace(/^\/+|\/+$/g, "")
              .replace(/\/+/g, "/");
            routes.push([controllerName, handler.getName(), verb, path]);
          }
        }
      }
    }
  }
  return routes.sort((left, right) =>
    `${left[2]} ${left[3]} ${left[0]} ${left[1]}`.localeCompare(
      `${right[2]} ${right[3]} ${right[0]} ${right[1]}`,
    ),
  );
}

describe("reviewed route/OpenAPI manifest", () => {
  it("documents every route registered from AppModule, with no extras", () => {
    const manifestRoutes = RELEASE_ROUTE_MANIFEST.map(
      ([controller, handler, verb, path]) =>
        [controller, handler, verb, path] as RegisteredRoute,
    ).sort((left, right) =>
      `${left[2]} ${left[3]} ${left[0]} ${left[1]}`.localeCompare(
        `${right[2]} ${right[3]} ${right[0]} ${right[1]}`,
      ),
    );
    expect(manifestRoutes).toEqual(discoverRegisteredRoutes());
  });

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
      ).toMatchObject({
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

  it("documents truthful Codex subscription metadata and at-most-once counters", () => {
    expect(
      RELEASE_OPENAPI_MANIFEST.components.schemas.InferenceSubscriptionMetadata,
    ).toMatchObject({
      required: ["provider", "accessMode", "launcher", "model"],
      properties: {
        provider: { enum: ["openai"] },
        accessMode: { enum: ["chatgpt_subscription"] },
        launcher: { enum: ["codex_exec"] },
        model: { type: "string", minLength: 1 },
      },
    });
    const runTelemetry =
      RELEASE_OPENAPI_MANIFEST.components.schemas.InferenceRunTelemetry;
    expect(runTelemetry).toMatchObject({
      required: expect.arrayContaining([
        "inference",
        "callsStarted",
        "successfulResults",
        "callOutcomeUnknown",
        "prelaunchFailures",
        "paidFallbackCount",
      ]),
    });
    expect(
      RELEASE_OPENAPI_MANIFEST.paths["/admin/ingestion/inference/runs/{id}"].get
        .responses?.["200"],
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/InferenceRunTelemetry" },
        },
      },
    });
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
    expect(activePaths).not.toContain(
      "admin/ingestion/provider-specific/runs/:id",
    );
  });

  it("marks exactly the registered identity tombstones as gone", () => {
    expect(
      RELEASE_ROUTE_MANIFEST.filter(([, , , , state]) => state === "gone").map(
        ([controller, handler, verb, path]) => [
          controller,
          handler,
          verb,
          path,
        ],
      ),
    ).toEqual([
      [
        "OrganizationsController",
        "getOrgTeamBySlug",
        "GET",
        "organizations/details/slug/:slug/team",
      ],
      ["PeopleIntelligenceController", "profile", "GET", "people/:login"],
      ["PeopleIntelligenceController", "directory", "GET", "people/directory"],
    ]);
  });
});
