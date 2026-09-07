import type { MailDataRequired } from "@sendgrid/mail";
import type { JobListResult } from "src/shared/interfaces";
import { slugify } from "src/shared/helpers";

export type WeeklyEmailJob = Pick<
  JobListResult,
  | "shortUUID"
  | "title"
  | "timestamp"
  | "location"
  | "locationType"
  | "seniority"
  | "commitment"
> & {
  organization?: { name: string } | null;
  project?: { name: string } | null;
};

export const isRecentWeeklyJob = (
  job: Pick<WeeklyEmailJob, "timestamp">,
  now: number,
): boolean =>
  typeof job.timestamp === "number" &&
  Number.isFinite(job.timestamp) &&
  job.timestamp >= now - 21 * 24 * 60 * 60 * 1000 &&
  job.timestamp <= now;

const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const label = (value: string | null): string =>
  (value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());

export const weeklyJobsEmail = (input: {
  from: string;
  to: string;
  frontend: string;
  unsubscribeUrl: string;
  jobs: WeeklyEmailJob[];
}): MailDataRequired => {
  const matchesUrl = `${input.frontend}/profile/jobs`;
  const roles = input.jobs.map(job => {
    const title = job.title || "Open role";
    const employer = job.organization?.name || job.project?.name || "JobStash";
    const href = `${input.frontend}/${slugify(`${title}-${employer}`)}/${encodeURIComponent(job.shortUUID)}?utm_source=weekly_job_digest&utm_medium=email`;
    const details = [
      ...new Set(
        [
          label(job.locationType),
          label(job.seniority),
          label(job.commitment),
        ].filter(Boolean),
      ),
    ].join(" · ");
    const location =
      job.location &&
      job.location.toLowerCase() !== (job.locationType ?? "").toLowerCase()
        ? job.location
        : "";
    const posted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(job.timestamp!);
    return { title, employer, href, details, location, posted };
  });
  const preview = `${roles.length} fresh ${roles.length === 1 ? "role" : "roles"} in your weekly shortlist. Posted within the last 3 weeks.`;
  const cards = roles
    .map(
      role => `
    <tr><td style="padding:0 0 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7f7fb" style="width:100%;background-color:#f7f7fb;border:1px solid #e6e6ef;border-radius:12px">
        <tr><td class="card-pad" style="padding:24px;text-align:left">
          <p style="margin:0 0 10px;font-size:14px;line-height:20px;font-weight:700;color:#655977">${escape(role.employer)}</p>
          <h2 style="margin:0 0 12px;font-size:22px;line-height:29px;font-weight:700;letter-spacing:-0.4px;overflow-wrap:break-word"><a href="${escape(role.href)}" style="color:#191622;text-decoration:none">${escape(role.title)}</a></h2>
          ${role.details ? `<p style="margin:0 0 4px;font-size:14px;line-height:22px;color:#514d60">${escape(role.details)}</p>` : ""}
          ${role.location ? `<p style="margin:0 0 4px;font-size:14px;line-height:22px;color:#514d60;overflow-wrap:break-word">${escape(role.location)}</p>` : ""}
          <p style="margin:0 0 18px;font-size:12px;line-height:20px;color:#716b7d">Posted ${escape(role.posted)}</p>
          <a href="${escape(role.href)}" style="font-size:14px;line-height:22px;font-weight:700;color:#6330ce;text-decoration:none">View role&nbsp; &rarr;</a>
        </td></tr>
      </table>
    </td></tr>`,
    )
    .join("");

  return {
    from: input.from,
    to: input.to,
    subject: "Your weekly JobStash matches",
    text: `Your next move.\n${preview}\n\n${roles
      .map(
        role =>
          `${role.title}\n${role.employer}\n${[role.details, role.location, `Posted ${role.posted}`].filter(Boolean).join("\n")}\nView role: ${role.href}`,
      )
      .join(
        "\n\n",
      )}\n\nSee all matches: ${matchesUrl}\n\nYou're receiving this because you opted in to weekly job matches.\nUnsubscribe: ${input.unsubscribeUrl}\nJobStash · Find your next move.`,
    html: `<!doctype html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your weekly JobStash matches</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none;text-decoration:none}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:600px){.outer-pad{padding:12px 8px!important}.section-pad{padding:28px 20px!important}.card-pad{padding:20px!important}.headline{font-size:32px!important;line-height:38px!important}}
</style></head>
<body style="margin:0;padding:0;background-color:#eeedf3;font-family:Arial,Helvetica,sans-serif;color:#191622;text-align:left">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escape(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eeedf3" style="width:100%;background-color:#eeedf3">
<tr><td class="outer-pad" align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px">
  <tr><td class="section-pad" bgcolor="#15121e" style="padding:32px;background-color:#15121e;border-radius:16px 16px 0 0;text-align:left">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
      <td width="40"><a href="${escape(input.frontend)}" style="text-decoration:none"><img src="https://jobstash.xyz/jobstash-logo.png" width="36" height="36" alt="" style="display:block;width:36px;height:36px"></a></td>
      <td style="padding-left:8px;font-size:21px;line-height:28px;font-weight:700;letter-spacing:-0.5px"><a href="${escape(input.frontend)}" style="color:#ffffff;text-decoration:none">JobStash</a></td>
    </tr></table>
    <p style="margin:30px 0 12px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;color:#bda6ff">YOUR WEEKLY SHORTLIST</p>
    <h1 class="headline" style="margin:0 0 12px;font-size:40px;line-height:46px;font-weight:700;letter-spacing:-1.2px;color:#ffffff">Your next move.</h1>
    <p style="margin:0;max-width:390px;font-size:16px;line-height:25px;color:#c9c3d5">Fresh opportunities, selected for you.<br>Every role posted within the last 3 weeks.</p>
  </td></tr>
  <tr><td class="section-pad" style="padding:28px 32px 32px;text-align:left">
    <p style="margin:0 0 18px;font-size:13px;line-height:20px;font-weight:700;color:#716b7d">${roles.length} ${roles.length === 1 ? "role" : "roles"} to explore</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%">${cards}</table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:8px"><tr><td align="center" bgcolor="#6330ce" style="background-color:#6330ce;border-radius:8px;mso-padding-alt:16px 24px"><a href="${escape(matchesUrl)}" style="display:block;padding:16px 24px;font-size:16px;line-height:22px;font-weight:700;text-align:center;text-decoration:none;color:#ffffff"><span style="color:#ffffff">See all matches &rarr;</span></a></td></tr></table>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px"><tr><td align="center" style="padding:24px 16px 8px;font-size:12px;line-height:20px;color:#716b7d">
  <p style="margin:0 0 8px">You're receiving this because you opted in to weekly job matches.</p>
  <p style="margin:0 0 16px"><a href="${escape(`${input.frontend}/profile/settings`)}" style="color:#514d60;text-decoration:underline">Email preferences</a> &nbsp;&middot;&nbsp; <a href="${escape(input.unsubscribeUrl)}" style="color:#514d60;text-decoration:underline">Unsubscribe</a></p>
  <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.2px;color:#514d60">JobStash &middot; Find your next move.</p>
</td></tr></table>
</td></tr></table>
</body></html>`,
  };
};
