import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export function mcpConfig(config: ConfigService) {
  const read = (key: string): string => {
    const raw = config.get<string>(key);
    if (!raw)
      throw new ServiceUnavailableException(
        "AI app connections are not configured",
      );
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ServiceUnavailableException(
        "Invalid AI app connection configuration",
      );
    }
    const local =
      config.get("NODE_ENV") !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol === "http:";
    if (
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new ServiceUnavailableException(
        "Invalid AI app connection configuration",
      );
    return url.href.replace(/\/$/, "");
  };
  const settings = {
    resource: read("MCP_RESOURCE_URL"),
    issuer: read("MCP_ISSUER_URL"),
    frontend: read("MCP_FRONTEND_URL"),
  };
  if (
    new URL(settings.issuer).pathname !== "/mcp" ||
    new URL(settings.frontend).pathname !== "/"
  )
    throw new ServiceUnavailableException(
      "Invalid AI app connection configuration",
    );
  return settings;
}
