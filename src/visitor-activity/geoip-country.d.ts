declare module "geoip-country" {
  export function lookup(ip: string): { country: string } | null;
}
