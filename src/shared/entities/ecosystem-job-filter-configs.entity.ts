import { EcosystemJobFilterConfigs } from "../interfaces";
import {
  JobFilterConfigsEntity,
  RawJobFilters,
} from "./job-filter-configs.entity";
import {
  FILTER_CONFIG_PRESETS,
  FILTER_PARAM_KEY_PRESETS,
} from "../presets/ecosystem-job-filter-configs";

export class EcosystemJobFilterConfigsEntity extends JobFilterConfigsEntity {
  constructor(raw: RawJobFilters) {
    super(raw);
    this.raw = raw;
    this.configPresets = FILTER_CONFIG_PRESETS;
    this.paramKeyPresets = FILTER_PARAM_KEY_PRESETS;
  }

  getProperties(): EcosystemJobFilterConfigs {
    const base = super.getProperties();
    return new EcosystemJobFilterConfigs({
      ...base,
      online: this.getSingleSelectPresets("online"),
      blocked: this.getSingleSelectPresets("blocked"),
    });
  }
}
