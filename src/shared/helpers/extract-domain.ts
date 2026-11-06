function throwTypeError(): never {
  throw new TypeError(
    "The given URL is not a string. Please verify your string|array.",
  );
}

const endings = ["/", ":", "?", "#"];
const starters = [".", "/", "@"];

type Urls = string | Array<string>;
type ReturnUrls = Array<string> | Array<Promise<string>>;
type ReturnUrl = string | Promise<string | null>;

/**
 * Options to extract domain.
 */
type GetDomainOptions = {
  tld?: boolean;
};

/**
 * @param {string} url
 * @param {GetDomainOptions} opts `{ tld: true }` permit to get Top Level Domain like `*.co.uk`
 * @returns {ReturnUrl} Returns a URL or a promise of a URL if the PSL lib is being used
 */
function getDomainFromUrl(url: string, opts: GetDomainOptions): ReturnUrl {
  let domainInc = 0;
  let offsetDomain = 0;
  let offsetStartSlice = 0;
  let offsetPath = 0;
  let len: number = url.length;
  let i = 0;

  // Find end offset of domain
  while (len-- && ++i) {
    if (domainInc && endings.includes(url[i])) {
      break;
    }

    if (url[i] !== ".") {
      continue;
    }

    ++domainInc;

    offsetDomain = i;
  }

  offsetPath = i;

  i = offsetDomain;

  // Find offset before domain name.
  while (i--) {
    // Look for sub domain, protocol or basic auth
    if (!starters.includes(url[i])) {
      continue;
    }

    offsetStartSlice = i + 1;

    break;
  }

  if (offsetStartSlice === 0 && offsetPath > 3) {
    return url;
  }

  if (offsetStartSlice > 0 && offsetStartSlice < 2) {
    return "";
  }

  // Very customized if statement for tlds
  if (opts.tld) {
    return getTopLevelDomain(url, offsetDomain, offsetPath);
  }

  // Tried several approaches slicing a string. Can't get it any faster than this.
  return url.slice(offsetStartSlice, offsetPath);
}

function getTopLevelDomain(
  url: string,
  offsetDomain: number,
  offsetPath: number,
): Promise<string | null> {
  let offsetStart = 0;
  let i = offsetDomain;

  while (i--) {
    if (url[i] === "/" || url[i] === "@") {
      offsetStart = i + 1;
      break;
    }
  }

  return import("psl")
    .then(psl => psl.get(url.slice(offsetStart, offsetPath)))
    .catch(error => {
      console.error(error);
      throw new Error(
        "You must install psl library (https://www.npmjs.com/package/psl) to use `tld` option",
      );
    });
}

/**
 * @param {Urls} urls ["https://www.google.com", "https://www.github.com"] or "https://www.google.com"
 * @param {GetDomainOptions} opts `{ tld: true }` permit to get Top Level Domain like `*.co.uk`
 * @returns {Urls | Promise<Urls>} Return URLs or a promise of URLs if the PSL lib is being used
 */
export default function extractDomain(
  urls: Urls,
  opts: GetDomainOptions = {},
): ReturnUrl | ReturnUrls | null {
  if (typeof urls === "string") {
    return getDomainFromUrl(urls, opts);
  } else if (Array.isArray(urls)) {
    // lazy type checking (^o^)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractedUrls: any = [];
    const len: number = urls.length;
    let i = 0;

    for (; i < len; i++) {
      const url = getDomainFromUrl(urls[i], opts);

      extractedUrls.push(url);
    }

    return extractedUrls;
  } else {
    throwTypeError();
  }
}
