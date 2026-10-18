import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export function assertPlatformInferenceEnabled(config: ConfigService): void {
  if (config.get<string>("RECRUITERS_LOCAL_MCP") === "true")
    throw new ForbiddenException({ code: "local_mcp_required", message: "Continue in connected ChatGPT or Claude. Your saved work remains available." });
}

export function configuredProviderModel(
  config: ConfigService,
  provider: unknown,
): string {
  assertPlatformInferenceEnabled(config);
  switch (provider) {
    case "codex":
      return config.get<string>("CAREER_CODEX_MODEL") || "gpt-6-sol";
    case "grok":
      return config.get<string>("CAREER_GROK_MODEL") || "grok-4.20";
    case "openai":
      return config.get<string>("CAREER_OPENAI_MODEL") || "gpt-6-sol";
    case "anthropic":
      return config.get<string>("CAREER_ANTHROPIC_MODEL") || "claude-sonnet-5";
    default:
      throw new BadRequestException("Unsupported AI provider");
  }
}

export function providerReasoningEffort(provider: unknown, model: string): "low" | null {
  return (provider === "codex" || provider === "openai") &&
    /^(?:gpt-(?:5|6)(?:[.-]|$)|o[134](?:-|$))/.test(model) && !/(?:^|-)pro(?:-|$)/.test(model)
    ? "low" : null;
}

export function selectedProviderModel(
  config: ConfigService,
  provider: unknown,
  publicState: Record<string, unknown> = {},
): { model: string; reasoningEffort: string | null } {
  assertPlatformInferenceEnabled(config);
  const selected = typeof publicState?.model === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$(?![\s\S])/.test(publicState.model);
  const model = selected ? String(publicState.model) : configuredProviderModel(config, provider);
  return {
    model,
    reasoningEffort: selected && Object.prototype.hasOwnProperty.call(publicState, "reasoningEffort")
      ? typeof publicState.reasoningEffort === "string" && /^[a-z][a-z0-9_-]{0,31}$(?![\s\S])/.test(publicState.reasoningEffort)
        ? publicState.reasoningEffort : null
      : providerReasoningEffort(provider, model),
  };
}
