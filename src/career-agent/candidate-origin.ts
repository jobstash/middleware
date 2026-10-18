import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export function candidateOrigin(config: ConfigService): string {
  const configured = config.get<string>("RECRUITERS_PUBLIC_ORIGIN");
  if (!configured)
    throw new ServiceUnavailableException("Candidate frontend origin is not configured");
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
      throw new Error("Invalid origin");
    return url.origin;
  } catch {
    throw new ServiceUnavailableException("Candidate frontend origin is invalid");
  }
}
