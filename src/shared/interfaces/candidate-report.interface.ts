import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import * as t from "io-ts";

export class CandidateReportUser {
  public static readonly CandidateReportUserType = t.strict({
    wallet: t.union([t.string, t.null]),
    avatar: t.union([t.string, t.null]),
    github: t.string,
    cryptoNative: t.boolean,
    averageTenure: t.union([t.number, t.null]),
    stars: t.union([t.number, t.null]),
    tags: t.array(t.string),
  });

  wallet: string | null;
  avatar: string | null;
  github: string; // github username
  cryptoNative: boolean;
  averageTenure: number | null;
  stars: number | null;
  tags: string[];

  constructor(raw: CandidateReportUser) {
    const { wallet, avatar, github, cryptoNative, averageTenure, stars, tags } =
      raw;

    const result = CandidateReportUser.CandidateReportUserType.decode(raw);

    this.wallet = wallet;
    this.avatar = avatar;
    this.github = github;
    this.cryptoNative = cryptoNative;
    this.averageTenure = averageTenure;
    this.stars = stars;
    this.tags = tags;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `candidate report user instance with id ${this.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class Nft {
  public static readonly NftType = t.strict({
    name: t.string,
    previewUrl: t.union([t.string, t.null]),
    timestamp: t.union([t.number, t.null]),
  });

  name: string;
  previewUrl: string | null;
  timestamp: number | null;

  constructor(raw: Nft) {
    const { name, previewUrl, timestamp } = raw;
    const result = Nft.NftType.decode(raw);

    this.name = name;
    this.previewUrl = previewUrl;
    this.timestamp = timestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `nft instance with id ${this.name} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class CandidateReportRepository {
  public static readonly CandidateReportRepositoryType = t.strict({
    name: t.string,
    url: t.string,
    tenure: t.number,
    stars: t.number,
    commitCount: t.number,
    timeFirstCommit: t.number,
    timeLastCommit: t.number,
    skills: t.array(t.string),
  });

  name: string; // maybe unslugified repo-name e.g. github.com/jobstash/job-frame -> "Job Frame"
  url: string; // e.g. https://github.com/some-user/repo-name or gitlab etc
  tenure: number;
  stars: number;
  commitCount: number;
  timeFirstCommit: number;
  timeLastCommit: number;
  skills: string[];

  constructor(raw: CandidateReportRepository) {
    const {
      name,
      url,
      tenure,
      stars,
      commitCount,
      timeFirstCommit,
      timeLastCommit,
      skills,
    } = raw;

    const result =
      CandidateReportRepository.CandidateReportRepositoryType.decode(raw);

    this.name = name;
    this.url = url;
    this.tenure = tenure;
    this.stars = stars;
    this.commitCount = commitCount;
    this.timeFirstCommit = timeFirstCommit;
    this.timeLastCommit = timeLastCommit;
    this.skills = skills;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `candidate report repository instance with id ${this.name} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class CandidateReportAdjacentRepo {
  public static readonly CandidateReportAdjacentRepoType = t.strict({
    name: t.string,
    stars: t.number,
  });

  name: string;
  stars: number;

  constructor(raw: CandidateReportAdjacentRepo) {
    const { name, stars } = raw;
    const result =
      CandidateReportAdjacentRepo.CandidateReportAdjacentRepoType.decode(raw);

    this.name = name;
    this.stars = stars;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `candidate report adjacent repo instance with id ${this.name} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class CandidateReportOrganization {
  public static readonly CandidateReportOrganizationType = t.strict({
    name: t.union([t.string, t.null]),
    avatar: t.string,
    tenure: t.number,
    commits: t.number,
    url: t.union([t.string, t.null]),
    github: t.string,
    cryptoNative: t.boolean,
    repositories: t.array(
      CandidateReportRepository.CandidateReportRepositoryType,
    ),
  });

  name: string | null;
  avatar: string;
  tenure: number;
  commits: number;
  url: string | null;
  github: string; // github org username
  cryptoNative: boolean;
  repositories: CandidateReportRepository[];

  constructor(raw: CandidateReportOrganization) {
    const {
      name,
      avatar,
      tenure,
      commits,
      url,
      github,
      cryptoNative,
      repositories,
    } = raw;

    const result =
      CandidateReportOrganization.CandidateReportOrganizationType.decode(raw);

    this.name = name;
    this.avatar = avatar;
    this.tenure = tenure;
    this.commits = commits;
    this.url = url;
    this.github = github;
    this.cryptoNative = cryptoNative;
    this.repositories = repositories;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `candidate report organization instance with id ${this.github} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class TopOrgItem {
  public static readonly TopOrgItemType = t.strict({
    name: t.union([t.string, t.null]),
    github: t.string,
    avatar: t.string,
    tenure: t.number,
    commits: t.number,
    cryptoNative: t.boolean,
  });

  name: string | null;
  github: string;
  avatar: string;
  tenure: number;
  commits: number;
  cryptoNative: boolean;

  constructor(raw: TopOrgItem) {
    const { name, github, avatar, tenure, commits, cryptoNative } = raw;
    const result = TopOrgItem.TopOrgItemType.decode(raw);

    this.name = name;
    this.github = github;
    this.avatar = avatar;
    this.tenure = tenure;
    this.commits = commits;
    this.cryptoNative = cryptoNative;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `top org item instance with id ${this.github} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class CandidateReport {
  public static readonly CandidateReportType = t.strict({
    user: CandidateReportUser.CandidateReportUserType,
    topOrganizations: t.array(TopOrgItem.TopOrgItemType),
    nfts: t.array(Nft.NftType),
    orgs: t.array(CandidateReportOrganization.CandidateReportOrganizationType),
    adjacentRepos: t.array(
      CandidateReportAdjacentRepo.CandidateReportAdjacentRepoType,
    ),
  });

  user: CandidateReportUser;
  topOrganizations: TopOrgItem[];
  nfts: Nft[];
  orgs: CandidateReportOrganization[];
  adjacentRepos: CandidateReportAdjacentRepo[];

  constructor(raw: CandidateReport) {
    const { user, topOrganizations, nfts, orgs, adjacentRepos } = raw;
    const result = CandidateReport.CandidateReportType.decode(raw);

    this.user = user;
    this.topOrganizations = topOrganizations;
    this.nfts = nfts;
    this.orgs = orgs;
    this.adjacentRepos = adjacentRepos;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `candidate report instance with id ${this.user.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}
