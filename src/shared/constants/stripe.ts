import { MeteredService } from "../interfaces/org";

export const LOOKUP_KEYS: Record<string, string> = {
  JOB_PROMOTION_PRICE: "job_promo",
  STASH_ALERT_PRICE: "stash_alert",
  EXTRA_SEATS_PRICE: "extra_seats",
  VERI_PAYG_PRICE: "veri_payg",
};

export const METERED_SERVICE_LOOKUP_KEYS: Record<
  MeteredService,
  {
    eventName: string;
    valueKey: string;
  }
> = {
  veri: {
    eventName: "veri_pay_as_you_go_meter",
    valueKey: "credits",
  },
};

export const BUNDLE_LOOKUP_KEYS = {
  JOBSTASH: {
    starter: "jobstash_starter",
    growth: "jobstash_growth",
    pro: "jobstash_pro",
    max: "jobstash_max",
  },
  VERI: {
    lite: "veri_lite",
    plus: "veri_plus",
    elite: "veri_elite",
    ultra: "veri_ultra",
  },
};
