import * as SendGrid from "@sendgrid/mail";

export const emailPreviewText = (text: string): string =>
  `<span class="preheader" style="color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0;">${text}</span>`;

const defaultFooter = `
Cheers, <br/>
The JobStash.xyz Team
`;
export const emailBuilder = (data: {
  from: string;
  to: string;
  subject: string;
  previewText?: string;
  title: string;
  bodySections: {
    t: "text" | "button" | "link" | "raw";
    link?: string;
    text: string;
  }[];
  footer?: string;
}): SendGrid.MailDataRequired => {
  const { from, to, subject, previewText, title, bodySections, footer } = data;
  return {
    from,
    to,
    subject,
    html: `
      <!DOCTYPE html>

<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">

<head>
  <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
  <meta content="width=device-width, initial-scale=1.0" name="viewport" />
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]--><!--[if !mso]><!--><!--<![endif]-->
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
    }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: inherit !important;
    }

    #MessageViewBody a {
      color: inherit;
      text-decoration: none;
    }

    p {
      line-height: inherit
    }

    .desktop_hide,
    .desktop_hide table {
      mso-hide: all;
      display: none;
      max-height: 0px;
      overflow: hidden;
    }

    .image_block img+div {
      display: none;
    }

    sup,
    sub {
      font-size: 75%;
      line-height: 0;
    }

    @media (max-width:520px) {
      .desktop_hide table.icons-inner {
        display: inline-block !important;
      }

      .icons-inner {
        text-align: center;
      }

      .icons-inner td {
        margin: 0 auto;
      }

      .mobile_hide {
        display: none;
      }

      .row-content {
        width: 100% !important;
      }

      .stack .column {
        width: 100%;
        display: block;
      }

      .mobile_hide {
        min-height: 0;
        max-height: 0;
        max-width: 0;
        overflow: hidden;
        font-size: 0px;
      }

      .desktop_hide,
      .desktop_hide table {
        display: table !important;
        max-height: none !important;
      }
    }
  </style>
  <!--[if mso ]><style>sup, sub { font-size: 100% !important; } sup { mso-text-raise:10% } sub { mso-text-raise:-10% }</style> <![endif]-->
</head>

<body class="body"
  style="background-color: #FFFFFF; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
  <table border="0" cellpadding="0" cellspacing="0" class="nl-container" role="presentation"
    style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #FFFFFF;" width="100%">
    <tbody>
      <tr>
        <td>
          <table align="center" border="0" cellpadding="0" cellspacing="0" class="row row-1" role="presentation"
            style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;" width="100%">
            <tbody>
              <tr>
                <td>
                  <table align="center" border="0" cellpadding="0" cellspacing="0" class="row-content"
                    role="presentation"
                    style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #ffffff; border-bottom: 4px solid #000000; border-left: 4px solid #000000; border-radius: 0; border-right: 4px solid #000000; border-top: 4px solid #000000; color: #000000; padding: 10px; width: 500px; margin: 0 auto;"
                    width="500">
                    <tbody>
                      <tr>
                        <td class="column column-1"
                          style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; background-color: rgb(18, 18, 22); padding-bottom: 15px; padding-left: 15px; padding-right: 15px; padding-top: 15px; vertical-align: top;"
                          width="100%">
                          <table border="0" cellpadding="0" cellspacing="0" class="heading_block block-1"
                            role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;" width="100%">
                            <tr>
                              <td class="pad"
                                style="padding-bottom:10px;padding-top:10px;text-align:center;width:100%;">
                                <h3
                                  style="margin: 0; color: #ffffff; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: normal; line-height: 120%; text-align: left; margin-top: 0; margin-bottom: 0; mso-line-height-alt: 28.799999999999997px;">
                                  <span class="tinyMce-placeholder" style="word-break: break-word;">${title}</span>
                                </h3>
                                ${previewText ? emailPreviewText(previewText) : ""}
                              </td>
                            </tr>
                          </table>
                          <table border="0" cellpadding="0" cellspacing="0" class="paragraph_block block-2"
                            role="presentation"
                            style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;" width="100%">
                            <tr>
                              <td class="pad">
                                <div
                                  style="color:#ffffff !important;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:16px;font-weight:400;letter-spacing:0px;line-height:150%;text-align:justify;mso-line-height-alt:24px;">
                                  ${bodySections
                                    .map((section, index) => {
                                      if (section.t === "text") {
                                        if (index !== bodySections.length - 1) {
                                          return `<p style="margin: 0; margin-bottom: 7px;">${section.text}</p>`;
                                        } else {
                                          return `<p style="margin: 0;">${section.text}</p>`;
                                        }
                                      } else if (section.t === "link") {
                                        return `<a href="${section.link}" style="color: #ffffff !important; underline: none !important; text-decoration: none !important;"><span style="color: #ffffff !important;">${section.text}</span></a>`;
                                      } else if (section.t === "raw") {
                                        return section.text;
                                      } else {
                                        return `
                                        <div align="center" class="alignment"><!--[if mso]>
                                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" style="height:42px;width:217px;v-text-anchor:middle;" arcsize="10%" fillcolor="#7747ff">
                                          <v:stroke dashstyle="Solid" weight="0px" color="#7747ff"/>
                                          <w:anchorlock/>
                                          <v:textbox inset="0px,0px,0px,0px">
                                          <center dir="false" style="color:#ffffff;font-family:sans-serif;font-size:16px">
                                          <![endif]--><span class="button" style="background-color: #7747ff; border-bottom: 0px solid transparent; border-left: 0px solid transparent; border-radius: 4px; border-right: 0px solid transparent; border-top: 0px solid transparent; color: #ffffff; display: inline-block; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; font-weight: 400; mso-border-alt: none; padding-bottom: 5px; padding-top: 5px; padding-left: 20px; padding-right: 20px; text-align: center; width: auto; word-break: keep-all; letter-spacing: normal;"><a href=${section.link} style="outline:none"
                                      tabindex="-1" target="_blank"><span
                                          style="word-break: break-word; line-height: 32px;">${section.text}</span></a></span><!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                                        </div>
                                      `;
                                      }
                                    })
                                    .join("")}
                                  <p style="margin: 0;">${footer?.split("\n")?.join("<br/>") ?? defaultFooter}</p>
                                </div>
                              </td>
                              
                            </tr>
                          </table>
                          <table border="0" cellpadding="10" cellspacing="0" class="divider_block block-5" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;" width="100%">
<tr>
<td >
<div align="center" class="alignment">
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;" width="100%">
<tr>
<td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #dddddd;"><span style="word-break: break-word;"> </span></td>
</tr>
</table>
                          <table border="0" cellpadding="0" cellspacing="0" class="image_block block-6"
                            role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;" width="100%">
                            <tr>
                              <td class="pad" style="width:100%;padding-right:0px;padding-left:0px;">
                                <div align="center" class="alignment" style="line-height:10px">
                                  <div style="max-width: 272.58px;"><a href="https://jobstash.xyz" style="outline:none"
                                      tabindex="-1" target="_blank"><img alt="" height="auto" src="https://raw.githubusercontent.com/jobstash/app/refs/heads/main/apps/web/public/JobStash-Wordmark-800.png"
                                        style="display: block; height: auto; border: 0; width: 100%;" title=""
                                        width="272.58" /></a></div>
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table><!-- End -->
</body>
</html>
    `,
  };
};

export const text = (text: string): { t: "text"; text: string } => ({
  t: "text",
  text,
});

export const button = (
  text: string,
  link: string,
): { t: "button"; text: string; link: string } => ({
  t: "button",
  text,
  link,
});

export const link = (
  text: string,
  link: string,
): { t: "link"; text: string; link: string } => ({
  t: "link",
  text,
  link,
});

export const raw = (text: string): { t: "raw"; text: string } => ({
  t: "raw",
  text,
});
