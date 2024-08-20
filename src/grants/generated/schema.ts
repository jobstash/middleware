/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type Scalars = {
  ID: string;
  String: string;
  Int: number;
  JSON: any;
  BigFloat: any;
  Float: number;
  Datetime: any;
  Boolean: boolean;
  BigInt: any;
};

/** The root query type which gives access points into the data universe. */
export interface Query {
  /**
   * Exposes the root query type nested one level down. This is helpful for Relay 1
   * which can only query top level fields if they are in a particular form.
   */
  query: Query;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId: Scalars["ID"];
  /** Fetches an object given its globally unique `ID`. */
  node: Node | null;
  /** Reads a set of `Application`. */
  applications: Application[] | null;
  /** Reads a set of `ApplicationsPayout`. */
  applicationsPayouts: ApplicationsPayout[] | null;
  /** Reads a set of `Donation`. */
  donations: Donation[] | null;
  /** Reads a set of `LegacyProject`. */
  legacyProjects: LegacyProject[] | null;
  /** Reads a set of `PendingProjectRole`. */
  pendingProjectRoles: PendingProjectRole[] | null;
  /** Reads a set of `PendingRoundRole`. */
  pendingRoundRoles: PendingRoundRole[] | null;
  /** Reads a set of `Price`. */
  prices: Price[] | null;
  /** Reads a set of `ProjectRole`. */
  projectRoles: ProjectRole[] | null;
  /** Reads a set of `Project`. */
  projects: Project[] | null;
  /** Reads a set of `RoundRole`. */
  roundRoles: RoundRole[] | null;
  /** Reads a set of `Round`. */
  rounds: Round[] | null;
  /** Reads a set of `Subscription`. */
  subscriptions: Subscription[] | null;
  application: Application | null;
  applicationsPayout: ApplicationsPayout | null;
  donation: Donation | null;
  legacyProject: LegacyProject | null;
  legacyProjectByV1ProjectId: LegacyProject | null;
  legacyProjectByV2ProjectId: LegacyProject | null;
  pendingProjectRole: PendingProjectRole | null;
  pendingRoundRole: PendingRoundRole | null;
  price: Price | null;
  projectRole: ProjectRole | null;
  project: Project | null;
  roundRole: RoundRole | null;
  round: Round | null;
  subscription: Subscription | null;
  /** Reads and enables pagination through a set of `Project`. */
  searchProjects: Project[] | null;
  /** Reads a single `Application` using its globally unique `ID`. */
  applicationByNodeId: Application | null;
  /** Reads a single `ApplicationsPayout` using its globally unique `ID`. */
  applicationsPayoutByNodeId: ApplicationsPayout | null;
  /** Reads a single `Donation` using its globally unique `ID`. */
  donationByNodeId: Donation | null;
  /** Reads a single `LegacyProject` using its globally unique `ID`. */
  legacyProjectByNodeId: LegacyProject | null;
  /** Reads a single `PendingProjectRole` using its globally unique `ID`. */
  pendingProjectRoleByNodeId: PendingProjectRole | null;
  /** Reads a single `PendingRoundRole` using its globally unique `ID`. */
  pendingRoundRoleByNodeId: PendingRoundRole | null;
  /** Reads a single `Price` using its globally unique `ID`. */
  priceByNodeId: Price | null;
  /** Reads a single `ProjectRole` using its globally unique `ID`. */
  projectRoleByNodeId: ProjectRole | null;
  /** Reads a single `Project` using its globally unique `ID`. */
  projectByNodeId: Project | null;
  /** Reads a single `RoundRole` using its globally unique `ID`. */
  roundRoleByNodeId: RoundRole | null;
  /** Reads a single `Round` using its globally unique `ID`. */
  roundByNodeId: Round | null;
  /** Reads a single `Subscription` using its globally unique `ID`. */
  subscriptionByNodeId: Subscription | null;
  __typename: "Query";
}

/** An object with a globally unique `ID`. */
export type Node = (
  | Query
  | Application
  | Round
  | Project
  | ProjectRole
  | RoundRole
  | Donation
  | ApplicationsPayout
  | LegacyProject
  | PendingProjectRole
  | PendingRoundRole
  | Price
  | Subscription
) & { __isUnion?: true };

export interface Application {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["String"];
  chainId: Scalars["Int"];
  roundId: Scalars["String"];
  projectId: Scalars["String"] | null;
  anchorAddress: Scalars["String"] | null;
  status: ApplicationStatus | null;
  statusSnapshots: Scalars["JSON"] | null;
  distributionTransaction: Scalars["String"] | null;
  metadataCid: Scalars["String"] | null;
  metadata: Scalars["JSON"] | null;
  createdByAddress: Scalars["String"] | null;
  createdAtBlock: Scalars["BigFloat"] | null;
  statusUpdatedAtBlock: Scalars["BigFloat"] | null;
  totalDonationsCount: Scalars["Int"] | null;
  totalAmountDonatedInUsd: Scalars["Float"] | null;
  uniqueDonorsCount: Scalars["Int"] | null;
  tags: (Scalars["String"] | null)[] | null;
  /** Reads a single `Round` that is related to this `Application`. */
  round: Round | null;
  /** Reads and enables pagination through a set of `ApplicationsPayout`. */
  applicationsPayoutsByChainIdAndRoundIdAndApplicationId: ApplicationsPayout[];
  /** Reads and enables pagination through a set of `Donation`. */
  donations: Donation[];
  canonicalProject: Project | null;
  project: Project | null;
  __typename: "Application";
}

export type ApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "IN_REVIEW";

export interface Round {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["String"];
  chainId: Scalars["Int"];
  tags: (Scalars["String"] | null)[] | null;
  matchAmount: Scalars["BigFloat"] | null;
  matchTokenAddress: Scalars["String"] | null;
  matchAmountInUsd: Scalars["Float"] | null;
  fundedAmount: Scalars["BigFloat"] | null;
  fundedAmountInUsd: Scalars["Float"] | null;
  applicationMetadataCid: Scalars["String"] | null;
  applicationMetadata: Scalars["JSON"] | null;
  roundMetadataCid: Scalars["String"] | null;
  roundMetadata: Scalars["JSON"] | null;
  applicationsStartTime: Scalars["Datetime"] | null;
  applicationsEndTime: Scalars["Datetime"] | null;
  donationsStartTime: Scalars["Datetime"] | null;
  donationsEndTime: Scalars["Datetime"] | null;
  createdByAddress: Scalars["String"] | null;
  createdAtBlock: Scalars["BigFloat"] | null;
  updatedAtBlock: Scalars["BigFloat"] | null;
  managerRole: Scalars["String"] | null;
  adminRole: Scalars["String"] | null;
  strategyAddress: Scalars["String"] | null;
  strategyId: Scalars["String"] | null;
  strategyName: Scalars["String"] | null;
  matchingDistribution: Scalars["JSON"] | null;
  readyForPayoutTransaction: Scalars["String"] | null;
  projectId: Scalars["String"] | null;
  totalAmountDonatedInUsd: Scalars["Float"] | null;
  totalDonationsCount: Scalars["Int"] | null;
  uniqueDonorsCount: Scalars["Int"] | null;
  totalDistributed: Scalars["BigFloat"] | null;
  /** Reads a single `Project` that is related to this `Round`. */
  project: Project | null;
  /** Reads and enables pagination through a set of `RoundRole`. */
  roles: RoundRole[];
  /** Reads and enables pagination through a set of `Application`. */
  applications: Application[];
  /** Reads and enables pagination through a set of `Donation`. */
  donations: Donation[];
  __typename: "Round";
}

export interface Project {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["String"];
  name: Scalars["String"] | null;
  nonce: Scalars["BigFloat"] | null;
  anchorAddress: Scalars["String"] | null;
  chainId: Scalars["Int"];
  projectNumber: Scalars["Int"] | null;
  registryAddress: Scalars["String"] | null;
  metadataCid: Scalars["String"] | null;
  metadata: Scalars["JSON"] | null;
  createdByAddress: Scalars["String"] | null;
  createdAtBlock: Scalars["BigFloat"] | null;
  updatedAtBlock: Scalars["BigFloat"] | null;
  tags: (Scalars["String"] | null)[] | null;
  projectType: ProjectType | null;
  /** Reads and enables pagination through a set of `ProjectRole`. */
  roles: ProjectRole[];
  /** Reads and enables pagination through a set of `Round`. */
  rounds: Round[];
  /** Reads and enables pagination through a set of `Application`. */
  applications: Application[] | null;
  __typename: "Project";
}

export type ProjectType = "CANONICAL" | "LINKED";

export interface ProjectRole {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  chainId: Scalars["Int"];
  projectId: Scalars["String"];
  address: Scalars["String"];
  role: ProjectRoleName;
  createdAtBlock: Scalars["BigFloat"] | null;
  /** Reads a single `Project` that is related to this `ProjectRole`. */
  project: Project | null;
  __typename: "ProjectRole";
}

export type ProjectRoleName = "OWNER" | "MEMBER";

/** Methods to use when ordering `ProjectRole`. */
export type ProjectRolesOrderBy =
  | "NATURAL"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "PROJECT_ID_ASC"
  | "PROJECT_ID_DESC"
  | "ADDRESS_ASC"
  | "ADDRESS_DESC"
  | "ROLE_ASC"
  | "ROLE_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export type RoundRoleName = "ADMIN" | "MANAGER";

/** Methods to use when ordering `Round`. */
export type RoundsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "TAGS_ASC"
  | "TAGS_DESC"
  | "MATCH_AMOUNT_ASC"
  | "MATCH_AMOUNT_DESC"
  | "MATCH_TOKEN_ADDRESS_ASC"
  | "MATCH_TOKEN_ADDRESS_DESC"
  | "MATCH_AMOUNT_IN_USD_ASC"
  | "MATCH_AMOUNT_IN_USD_DESC"
  | "FUNDED_AMOUNT_ASC"
  | "FUNDED_AMOUNT_DESC"
  | "FUNDED_AMOUNT_IN_USD_ASC"
  | "FUNDED_AMOUNT_IN_USD_DESC"
  | "APPLICATION_METADATA_CID_ASC"
  | "APPLICATION_METADATA_CID_DESC"
  | "APPLICATION_METADATA_ASC"
  | "APPLICATION_METADATA_DESC"
  | "ROUND_METADATA_CID_ASC"
  | "ROUND_METADATA_CID_DESC"
  | "ROUND_METADATA_ASC"
  | "ROUND_METADATA_DESC"
  | "APPLICATIONS_START_TIME_ASC"
  | "APPLICATIONS_START_TIME_DESC"
  | "APPLICATIONS_END_TIME_ASC"
  | "APPLICATIONS_END_TIME_DESC"
  | "DONATIONS_START_TIME_ASC"
  | "DONATIONS_START_TIME_DESC"
  | "DONATIONS_END_TIME_ASC"
  | "DONATIONS_END_TIME_DESC"
  | "CREATED_BY_ADDRESS_ASC"
  | "CREATED_BY_ADDRESS_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "UPDATED_AT_BLOCK_ASC"
  | "UPDATED_AT_BLOCK_DESC"
  | "MANAGER_ROLE_ASC"
  | "MANAGER_ROLE_DESC"
  | "ADMIN_ROLE_ASC"
  | "ADMIN_ROLE_DESC"
  | "STRATEGY_ADDRESS_ASC"
  | "STRATEGY_ADDRESS_DESC"
  | "STRATEGY_ID_ASC"
  | "STRATEGY_ID_DESC"
  | "STRATEGY_NAME_ASC"
  | "STRATEGY_NAME_DESC"
  | "MATCHING_DISTRIBUTION_ASC"
  | "MATCHING_DISTRIBUTION_DESC"
  | "READY_FOR_PAYOUT_TRANSACTION_ASC"
  | "READY_FOR_PAYOUT_TRANSACTION_DESC"
  | "PROJECT_ID_ASC"
  | "PROJECT_ID_DESC"
  | "TOTAL_AMOUNT_DONATED_IN_USD_ASC"
  | "TOTAL_AMOUNT_DONATED_IN_USD_DESC"
  | "TOTAL_DONATIONS_COUNT_ASC"
  | "TOTAL_DONATIONS_COUNT_DESC"
  | "UNIQUE_DONORS_COUNT_ASC"
  | "UNIQUE_DONORS_COUNT_DESC"
  | "TOTAL_DISTRIBUTED_ASC"
  | "TOTAL_DISTRIBUTED_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface RoundRole {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  chainId: Scalars["Int"];
  roundId: Scalars["String"];
  address: Scalars["String"];
  role: RoundRoleName;
  createdAtBlock: Scalars["BigFloat"] | null;
  /** Reads a single `Round` that is related to this `RoundRole`. */
  round: Round | null;
  __typename: "RoundRole";
}

/** Methods to use when ordering `RoundRole`. */
export type RoundRolesOrderBy =
  | "NATURAL"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "ROUND_ID_ASC"
  | "ROUND_ID_DESC"
  | "ADDRESS_ASC"
  | "ADDRESS_DESC"
  | "ROLE_ASC"
  | "ROLE_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

/** Methods to use when ordering `Application`. */
export type ApplicationsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "ROUND_ID_ASC"
  | "ROUND_ID_DESC"
  | "PROJECT_ID_ASC"
  | "PROJECT_ID_DESC"
  | "ANCHOR_ADDRESS_ASC"
  | "ANCHOR_ADDRESS_DESC"
  | "STATUS_ASC"
  | "STATUS_DESC"
  | "STATUS_SNAPSHOTS_ASC"
  | "STATUS_SNAPSHOTS_DESC"
  | "DISTRIBUTION_TRANSACTION_ASC"
  | "DISTRIBUTION_TRANSACTION_DESC"
  | "METADATA_CID_ASC"
  | "METADATA_CID_DESC"
  | "METADATA_ASC"
  | "METADATA_DESC"
  | "CREATED_BY_ADDRESS_ASC"
  | "CREATED_BY_ADDRESS_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "STATUS_UPDATED_AT_BLOCK_ASC"
  | "STATUS_UPDATED_AT_BLOCK_DESC"
  | "TOTAL_DONATIONS_COUNT_ASC"
  | "TOTAL_DONATIONS_COUNT_DESC"
  | "TOTAL_AMOUNT_DONATED_IN_USD_ASC"
  | "TOTAL_AMOUNT_DONATED_IN_USD_DESC"
  | "UNIQUE_DONORS_COUNT_ASC"
  | "UNIQUE_DONORS_COUNT_DESC"
  | "TAGS_ASC"
  | "TAGS_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

/**    */
export interface Donation {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["String"];
  chainId: Scalars["Int"] | null;
  roundId: Scalars["String"] | null;
  applicationId: Scalars["String"] | null;
  donorAddress: Scalars["String"] | null;
  recipientAddress: Scalars["String"] | null;
  projectId: Scalars["String"] | null;
  transactionHash: Scalars["String"] | null;
  blockNumber: Scalars["BigFloat"] | null;
  tokenAddress: Scalars["String"] | null;
  timestamp: Scalars["Datetime"] | null;
  amount: Scalars["BigFloat"] | null;
  amountInUsd: Scalars["Float"] | null;
  amountInRoundMatchToken: Scalars["BigFloat"] | null;
  /** Reads a single `Round` that is related to this `Donation`. */
  round: Round | null;
  /** Reads a single `Application` that is related to this `Donation`. */
  application: Application | null;
  __typename: "Donation";
}

/** Methods to use when ordering `Donation`. */
export type DonationsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "ROUND_ID_ASC"
  | "ROUND_ID_DESC"
  | "APPLICATION_ID_ASC"
  | "APPLICATION_ID_DESC"
  | "DONOR_ADDRESS_ASC"
  | "DONOR_ADDRESS_DESC"
  | "RECIPIENT_ADDRESS_ASC"
  | "RECIPIENT_ADDRESS_DESC"
  | "PROJECT_ID_ASC"
  | "PROJECT_ID_DESC"
  | "TRANSACTION_HASH_ASC"
  | "TRANSACTION_HASH_DESC"
  | "BLOCK_NUMBER_ASC"
  | "BLOCK_NUMBER_DESC"
  | "TOKEN_ADDRESS_ASC"
  | "TOKEN_ADDRESS_DESC"
  | "TIMESTAMP_ASC"
  | "TIMESTAMP_DESC"
  | "AMOUNT_ASC"
  | "AMOUNT_DESC"
  | "AMOUNT_IN_USD_ASC"
  | "AMOUNT_IN_USD_DESC"
  | "AMOUNT_IN_ROUND_MATCH_TOKEN_ASC"
  | "AMOUNT_IN_ROUND_MATCH_TOKEN_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface ApplicationsPayout {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["Int"];
  chainId: Scalars["Int"] | null;
  applicationId: Scalars["String"] | null;
  roundId: Scalars["String"] | null;
  amount: Scalars["BigFloat"] | null;
  tokenAddress: Scalars["String"] | null;
  amountInUsd: Scalars["Float"] | null;
  amountInRoundMatchToken: Scalars["String"] | null;
  transactionHash: Scalars["String"] | null;
  timestamp: Scalars["Datetime"] | null;
  sender: Scalars["String"] | null;
  /** Reads a single `Application` that is related to this `ApplicationsPayout`. */
  chainRoundApplication: Application | null;
  __typename: "ApplicationsPayout";
}

/** Methods to use when ordering `ApplicationsPayout`. */
export type ApplicationsPayoutsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "APPLICATION_ID_ASC"
  | "APPLICATION_ID_DESC"
  | "ROUND_ID_ASC"
  | "ROUND_ID_DESC"
  | "AMOUNT_ASC"
  | "AMOUNT_DESC"
  | "TOKEN_ADDRESS_ASC"
  | "TOKEN_ADDRESS_DESC"
  | "AMOUNT_IN_USD_ASC"
  | "AMOUNT_IN_USD_DESC"
  | "AMOUNT_IN_ROUND_MATCH_TOKEN_ASC"
  | "AMOUNT_IN_ROUND_MATCH_TOKEN_DESC"
  | "TRANSACTION_HASH_ASC"
  | "TRANSACTION_HASH_DESC"
  | "TIMESTAMP_ASC"
  | "TIMESTAMP_DESC"
  | "SENDER_ASC"
  | "SENDER_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface LegacyProject {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["Int"];
  v1ProjectId: Scalars["String"] | null;
  v2ProjectId: Scalars["String"] | null;
  __typename: "LegacyProject";
}

/** Methods to use when ordering `LegacyProject`. */
export type LegacyProjectsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "V1_PROJECT_ID_ASC"
  | "V1_PROJECT_ID_DESC"
  | "V2_PROJECT_ID_ASC"
  | "V2_PROJECT_ID_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface PendingProjectRole {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["Int"];
  chainId: Scalars["Int"] | null;
  role: Scalars["String"] | null;
  address: Scalars["String"] | null;
  createdAtBlock: Scalars["BigFloat"] | null;
  __typename: "PendingProjectRole";
}

/** Methods to use when ordering `PendingProjectRole`. */
export type PendingProjectRolesOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "ROLE_ASC"
  | "ROLE_DESC"
  | "ADDRESS_ASC"
  | "ADDRESS_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface PendingRoundRole {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["Int"];
  chainId: Scalars["Int"] | null;
  role: Scalars["String"] | null;
  address: Scalars["String"] | null;
  createdAtBlock: Scalars["BigFloat"] | null;
  __typename: "PendingRoundRole";
}

/** Methods to use when ordering `PendingRoundRole`. */
export type PendingRoundRolesOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "ROLE_ASC"
  | "ROLE_DESC"
  | "ADDRESS_ASC"
  | "ADDRESS_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface Price {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["Int"];
  chainId: Scalars["Int"] | null;
  tokenAddress: Scalars["String"] | null;
  priceInUsd: Scalars["Float"] | null;
  timestamp: Scalars["Datetime"] | null;
  blockNumber: Scalars["BigFloat"] | null;
  __typename: "Price";
}

/** Methods to use when ordering `Price`. */
export type PricesOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "TOKEN_ADDRESS_ASC"
  | "TOKEN_ADDRESS_DESC"
  | "PRICE_IN_USD_ASC"
  | "PRICE_IN_USD_DESC"
  | "TIMESTAMP_ASC"
  | "TIMESTAMP_DESC"
  | "BLOCK_NUMBER_ASC"
  | "BLOCK_NUMBER_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

/** Methods to use when ordering `Project`. */
export type ProjectsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "NAME_ASC"
  | "NAME_DESC"
  | "NONCE_ASC"
  | "NONCE_DESC"
  | "ANCHOR_ADDRESS_ASC"
  | "ANCHOR_ADDRESS_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "PROJECT_NUMBER_ASC"
  | "PROJECT_NUMBER_DESC"
  | "REGISTRY_ADDRESS_ASC"
  | "REGISTRY_ADDRESS_DESC"
  | "METADATA_CID_ASC"
  | "METADATA_CID_DESC"
  | "METADATA_ASC"
  | "METADATA_DESC"
  | "CREATED_BY_ADDRESS_ASC"
  | "CREATED_BY_ADDRESS_DESC"
  | "CREATED_AT_BLOCK_ASC"
  | "CREATED_AT_BLOCK_DESC"
  | "UPDATED_AT_BLOCK_ASC"
  | "UPDATED_AT_BLOCK_DESC"
  | "TAGS_ASC"
  | "TAGS_DESC"
  | "PROJECT_TYPE_ASC"
  | "PROJECT_TYPE_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

export interface Subscription {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId: Scalars["ID"];
  id: Scalars["String"];
  chainId: Scalars["Int"] | null;
  contractName: Scalars["String"] | null;
  contractAddress: Scalars["String"] | null;
  fromBlock: Scalars["BigInt"] | null;
  toBlock: Scalars["String"] | null;
  indexedToBlock: Scalars["BigInt"] | null;
  indexedToLogIndex: Scalars["Int"] | null;
  createdAt: Scalars["Datetime"];
  updatedAt: Scalars["Datetime"];
  __typename: "Subscription";
}

/** Methods to use when ordering `Subscription`. */
export type SubscriptionsOrderBy =
  | "NATURAL"
  | "ID_ASC"
  | "ID_DESC"
  | "CHAIN_ID_ASC"
  | "CHAIN_ID_DESC"
  | "CONTRACT_NAME_ASC"
  | "CONTRACT_NAME_DESC"
  | "CONTRACT_ADDRESS_ASC"
  | "CONTRACT_ADDRESS_DESC"
  | "FROM_BLOCK_ASC"
  | "FROM_BLOCK_DESC"
  | "TO_BLOCK_ASC"
  | "TO_BLOCK_DESC"
  | "INDEXED_TO_BLOCK_ASC"
  | "INDEXED_TO_BLOCK_DESC"
  | "INDEXED_TO_LOG_INDEX_ASC"
  | "INDEXED_TO_LOG_INDEX_DESC"
  | "CREATED_AT_ASC"
  | "CREATED_AT_DESC"
  | "UPDATED_AT_ASC"
  | "UPDATED_AT_DESC"
  | "PRIMARY_KEY_ASC"
  | "PRIMARY_KEY_DESC";

/** The root query type which gives access points into the data universe. */
export interface QueryGenqlSelection {
  /**
   * Exposes the root query type nested one level down. This is helpful for Relay 1
   * which can only query top level fields if they are in a particular form.
   */
  query?: QueryGenqlSelection;
  /** The root query type must be a `Node` to work well with Relay 1 mutations. This just resolves to `query`. */
  nodeId?: boolean | number;
  /** Fetches an object given its globally unique `ID`. */
  node?: NodeGenqlSelection & {
    __args: {
      /** The globally unique `ID`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a set of `Application`. */
  applications?: ApplicationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Application`. */
      orderBy?: ApplicationsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ApplicationCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ApplicationFilter | null;
    };
  };
  /** Reads a set of `ApplicationsPayout`. */
  applicationsPayouts?: ApplicationsPayoutGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `ApplicationsPayout`. */
      orderBy?: ApplicationsPayoutsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ApplicationsPayoutCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ApplicationsPayoutFilter | null;
    };
  };
  /** Reads a set of `Donation`. */
  donations?: DonationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Donation`. */
      orderBy?: DonationsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: DonationCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: DonationFilter | null;
    };
  };
  /** Reads a set of `LegacyProject`. */
  legacyProjects?: LegacyProjectGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `LegacyProject`. */
      orderBy?: LegacyProjectsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: LegacyProjectCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: LegacyProjectFilter | null;
    };
  };
  /** Reads a set of `PendingProjectRole`. */
  pendingProjectRoles?: PendingProjectRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `PendingProjectRole`. */
      orderBy?: PendingProjectRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: PendingProjectRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: PendingProjectRoleFilter | null;
    };
  };
  /** Reads a set of `PendingRoundRole`. */
  pendingRoundRoles?: PendingRoundRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `PendingRoundRole`. */
      orderBy?: PendingRoundRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: PendingRoundRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: PendingRoundRoleFilter | null;
    };
  };
  /** Reads a set of `Price`. */
  prices?: PriceGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Price`. */
      orderBy?: PricesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: PriceCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: PriceFilter | null;
    };
  };
  /** Reads a set of `ProjectRole`. */
  projectRoles?: ProjectRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `ProjectRole`. */
      orderBy?: ProjectRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ProjectRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ProjectRoleFilter | null;
    };
  };
  /** Reads a set of `Project`. */
  projects?: ProjectGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Project`. */
      orderBy?: ProjectsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ProjectCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ProjectFilter | null;
    };
  };
  /** Reads a set of `RoundRole`. */
  roundRoles?: RoundRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `RoundRole`. */
      orderBy?: RoundRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: RoundRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: RoundRoleFilter | null;
    };
  };
  /** Reads a set of `Round`. */
  rounds?: RoundGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Round`. */
      orderBy?: RoundsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: RoundCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: RoundFilter | null;
    };
  };
  /** Reads a set of `Subscription`. */
  subscriptions?: SubscriptionGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Subscription`. */
      orderBy?: SubscriptionsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: SubscriptionCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: SubscriptionFilter | null;
    };
  };
  application?: ApplicationGenqlSelection & {
    __args: {
      chainId: Scalars["Int"];
      roundId: Scalars["String"];
      id: Scalars["String"];
    };
  };
  applicationsPayout?: ApplicationsPayoutGenqlSelection & {
    __args: { id: Scalars["Int"] };
  };
  donation?: DonationGenqlSelection & { __args: { id: Scalars["String"] } };
  legacyProject?: LegacyProjectGenqlSelection & {
    __args: { id: Scalars["Int"] };
  };
  legacyProjectByV1ProjectId?: LegacyProjectGenqlSelection & {
    __args: { v1ProjectId: Scalars["String"] };
  };
  legacyProjectByV2ProjectId?: LegacyProjectGenqlSelection & {
    __args: { v2ProjectId: Scalars["String"] };
  };
  pendingProjectRole?: PendingProjectRoleGenqlSelection & {
    __args: { id: Scalars["Int"] };
  };
  pendingRoundRole?: PendingRoundRoleGenqlSelection & {
    __args: { id: Scalars["Int"] };
  };
  price?: PriceGenqlSelection & { __args: { id: Scalars["Int"] } };
  projectRole?: ProjectRoleGenqlSelection & {
    __args: {
      chainId: Scalars["Int"];
      projectId: Scalars["String"];
      address: Scalars["String"];
      role: ProjectRoleName;
    };
  };
  project?: ProjectGenqlSelection & {
    __args: { id: Scalars["String"]; chainId: Scalars["Int"] };
  };
  roundRole?: RoundRoleGenqlSelection & {
    __args: {
      chainId: Scalars["Int"];
      roundId: Scalars["String"];
      address: Scalars["String"];
      role: RoundRoleName;
    };
  };
  round?: RoundGenqlSelection & {
    __args: { id: Scalars["String"]; chainId: Scalars["Int"] };
  };
  subscription?: SubscriptionGenqlSelection & {
    __args: { id: Scalars["String"] };
  };
  /** Reads and enables pagination through a set of `Project`. */
  searchProjects?: ProjectGenqlSelection & {
    __args?: {
      searchTerm?: Scalars["String"] | null;
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ProjectFilter | null;
    };
  };
  /** Reads a single `Application` using its globally unique `ID`. */
  applicationByNodeId?: ApplicationGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Application`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `ApplicationsPayout` using its globally unique `ID`. */
  applicationsPayoutByNodeId?: ApplicationsPayoutGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `ApplicationsPayout`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `Donation` using its globally unique `ID`. */
  donationByNodeId?: DonationGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Donation`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `LegacyProject` using its globally unique `ID`. */
  legacyProjectByNodeId?: LegacyProjectGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `LegacyProject`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `PendingProjectRole` using its globally unique `ID`. */
  pendingProjectRoleByNodeId?: PendingProjectRoleGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `PendingProjectRole`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `PendingRoundRole` using its globally unique `ID`. */
  pendingRoundRoleByNodeId?: PendingRoundRoleGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `PendingRoundRole`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `Price` using its globally unique `ID`. */
  priceByNodeId?: PriceGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Price`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `ProjectRole` using its globally unique `ID`. */
  projectRoleByNodeId?: ProjectRoleGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `ProjectRole`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `Project` using its globally unique `ID`. */
  projectByNodeId?: ProjectGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Project`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `RoundRole` using its globally unique `ID`. */
  roundRoleByNodeId?: RoundRoleGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `RoundRole`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `Round` using its globally unique `ID`. */
  roundByNodeId?: RoundGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Round`. */
      nodeId: Scalars["ID"];
    };
  };
  /** Reads a single `Subscription` using its globally unique `ID`. */
  subscriptionByNodeId?: SubscriptionGenqlSelection & {
    __args: {
      /** The globally unique `ID` to be used in selecting a single `Subscription`. */
      nodeId: Scalars["ID"];
    };
  };
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/** An object with a globally unique `ID`. */
export interface NodeGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  on_Query?: QueryGenqlSelection;
  on_Application?: ApplicationGenqlSelection;
  on_Round?: RoundGenqlSelection;
  on_Project?: ProjectGenqlSelection;
  on_ProjectRole?: ProjectRoleGenqlSelection;
  on_RoundRole?: RoundRoleGenqlSelection;
  on_Donation?: DonationGenqlSelection;
  on_ApplicationsPayout?: ApplicationsPayoutGenqlSelection;
  on_LegacyProject?: LegacyProjectGenqlSelection;
  on_PendingProjectRole?: PendingProjectRoleGenqlSelection;
  on_PendingRoundRole?: PendingRoundRoleGenqlSelection;
  on_Price?: PriceGenqlSelection;
  on_Subscription?: SubscriptionGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

export interface ApplicationGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  roundId?: boolean | number;
  projectId?: boolean | number;
  anchorAddress?: boolean | number;
  status?: boolean | number;
  statusSnapshots?: boolean | number;
  distributionTransaction?: boolean | number;
  metadataCid?: boolean | number;
  metadata?: boolean | number;
  createdByAddress?: boolean | number;
  createdAtBlock?: boolean | number;
  statusUpdatedAtBlock?: boolean | number;
  totalDonationsCount?: boolean | number;
  totalAmountDonatedInUsd?: boolean | number;
  uniqueDonorsCount?: boolean | number;
  tags?: boolean | number;
  /** Reads a single `Round` that is related to this `Application`. */
  round?: RoundGenqlSelection;
  /** Reads and enables pagination through a set of `ApplicationsPayout`. */
  applicationsPayoutsByChainIdAndRoundIdAndApplicationId?: ApplicationsPayoutGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `ApplicationsPayout`. */
      orderBy?: ApplicationsPayoutsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ApplicationsPayoutCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ApplicationsPayoutFilter | null;
    };
  };
  /** Reads and enables pagination through a set of `Donation`. */
  donations?: DonationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Donation`. */
      orderBy?: DonationsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: DonationCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: DonationFilter | null;
    };
  };
  canonicalProject?: ProjectGenqlSelection;
  project?: ProjectGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

export interface RoundGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  tags?: boolean | number;
  matchAmount?: boolean | number;
  matchTokenAddress?: boolean | number;
  matchAmountInUsd?: boolean | number;
  fundedAmount?: boolean | number;
  fundedAmountInUsd?: boolean | number;
  applicationMetadataCid?: boolean | number;
  applicationMetadata?: boolean | number;
  roundMetadataCid?: boolean | number;
  roundMetadata?: boolean | number;
  applicationsStartTime?: boolean | number;
  applicationsEndTime?: boolean | number;
  donationsStartTime?: boolean | number;
  donationsEndTime?: boolean | number;
  createdByAddress?: boolean | number;
  createdAtBlock?: boolean | number;
  updatedAtBlock?: boolean | number;
  managerRole?: boolean | number;
  adminRole?: boolean | number;
  strategyAddress?: boolean | number;
  strategyId?: boolean | number;
  strategyName?: boolean | number;
  matchingDistribution?: boolean | number;
  readyForPayoutTransaction?: boolean | number;
  projectId?: boolean | number;
  totalAmountDonatedInUsd?: boolean | number;
  totalDonationsCount?: boolean | number;
  uniqueDonorsCount?: boolean | number;
  totalDistributed?: boolean | number;
  /** Reads a single `Project` that is related to this `Round`. */
  project?: ProjectGenqlSelection;
  /** Reads and enables pagination through a set of `RoundRole`. */
  roles?: RoundRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `RoundRole`. */
      orderBy?: RoundRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: RoundRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: RoundRoleFilter | null;
    };
  };
  /** Reads and enables pagination through a set of `Application`. */
  applications?: ApplicationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Application`. */
      orderBy?: ApplicationsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ApplicationCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ApplicationFilter | null;
    };
  };
  /** Reads and enables pagination through a set of `Donation`. */
  donations?: DonationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Donation`. */
      orderBy?: DonationsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: DonationCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: DonationFilter | null;
    };
  };
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

export interface ProjectGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  name?: boolean | number;
  nonce?: boolean | number;
  anchorAddress?: boolean | number;
  chainId?: boolean | number;
  projectNumber?: boolean | number;
  registryAddress?: boolean | number;
  metadataCid?: boolean | number;
  metadata?: boolean | number;
  createdByAddress?: boolean | number;
  createdAtBlock?: boolean | number;
  updatedAtBlock?: boolean | number;
  tags?: boolean | number;
  projectType?: boolean | number;
  /** Reads and enables pagination through a set of `ProjectRole`. */
  roles?: ProjectRoleGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `ProjectRole`. */
      orderBy?: ProjectRolesOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: ProjectRoleCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ProjectRoleFilter | null;
    };
  };
  /** Reads and enables pagination through a set of `Round`. */
  rounds?: RoundGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** The method to use when ordering `Round`. */
      orderBy?: RoundsOrderBy[] | null;
      /** A condition to be used in determining which values should be returned by the collection. */
      condition?: RoundCondition | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: RoundFilter | null;
    };
  };
  /** Reads and enables pagination through a set of `Application`. */
  applications?: ApplicationGenqlSelection & {
    __args?: {
      /** Only read the first `n` values of the set. */
      first?: Scalars["Int"] | null;
      /** Skip the first `n` values. */
      offset?: Scalars["Int"] | null;
      /** A filter to be used in determining which values should be returned by the collection. */
      filter?: ApplicationFilter | null;
    };
  };
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

export interface ProjectRoleGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  chainId?: boolean | number;
  projectId?: boolean | number;
  address?: boolean | number;
  role?: boolean | number;
  createdAtBlock?: boolean | number;
  /** Reads a single `Project` that is related to this `ProjectRole`. */
  project?: ProjectGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `ProjectRole` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export interface ProjectRoleCondition {
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `projectId` field. */
  projectId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `address` field. */
  address?: Scalars["String"] | null;
  /** Checks for equality with the object’s `role` field. */
  role?: ProjectRoleName | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
}

/** A filter to be used against `ProjectRole` object types. All fields are combined with a logical ‘and.’ */
export interface ProjectRoleFilter {
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `projectId` field. */
  projectId?: StringFilter | null;
  /** Filter by the object’s `address` field. */
  address?: StringFilter | null;
  /** Filter by the object’s `role` field. */
  role?: ProjectRoleNameFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `project` relation. */
  project?: ProjectFilter | null;
  /** Checks for all expressions in this list. */
  and?: ProjectRoleFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: ProjectRoleFilter[] | null;
  /** Negates the expression. */
  not?: ProjectRoleFilter | null;
}

/** A filter to be used against Int fields. All fields are combined with a logical ‘and.’ */
export interface IntFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["Int"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["Int"] | null;
  /** Included in the specified list. */
  in?: Scalars["Int"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["Int"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["Int"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["Int"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["Int"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["Int"] | null;
}

/** A filter to be used against String fields. All fields are combined with a logical ‘and.’ */
export interface StringFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["String"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["String"] | null;
  /** Included in the specified list. */
  in?: Scalars["String"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["String"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["String"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["String"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["String"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["String"] | null;
}

/** A filter to be used against ProjectRoleName fields. All fields are combined with a logical ‘and.’ */
export interface ProjectRoleNameFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: ProjectRoleName | null;
  /** Not equal to the specified value. */
  notEqualTo?: ProjectRoleName | null;
  /** Included in the specified list. */
  in?: ProjectRoleName[] | null;
  /** Not included in the specified list. */
  notIn?: ProjectRoleName[] | null;
  /** Less than the specified value. */
  lessThan?: ProjectRoleName | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: ProjectRoleName | null;
  /** Greater than the specified value. */
  greaterThan?: ProjectRoleName | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: ProjectRoleName | null;
}

/** A filter to be used against BigFloat fields. All fields are combined with a logical ‘and.’ */
export interface BigFloatFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["BigFloat"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["BigFloat"] | null;
  /** Included in the specified list. */
  in?: Scalars["BigFloat"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["BigFloat"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["BigFloat"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["BigFloat"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["BigFloat"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["BigFloat"] | null;
}

/** A filter to be used against `Project` object types. All fields are combined with a logical ‘and.’ */
export interface ProjectFilter {
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null;
  /** Filter by the object’s `name` field. */
  name?: StringFilter | null;
  /** Filter by the object’s `nonce` field. */
  nonce?: BigFloatFilter | null;
  /** Filter by the object’s `anchorAddress` field. */
  anchorAddress?: StringFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `projectNumber` field. */
  projectNumber?: IntFilter | null;
  /** Filter by the object’s `registryAddress` field. */
  registryAddress?: StringFilter | null;
  /** Filter by the object’s `metadataCid` field. */
  metadataCid?: StringFilter | null;
  /** Filter by the object’s `metadata` field. */
  metadata?: JSONFilter | null;
  /** Filter by the object’s `createdByAddress` field. */
  createdByAddress?: StringFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `updatedAtBlock` field. */
  updatedAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `tags` field. */
  tags?: StringListFilter | null;
  /** Filter by the object’s `projectType` field. */
  projectType?: ProjectTypeFilter | null;
  /** Filter by the object’s `roles` relation. */
  roles?: ProjectToManyProjectRoleFilter | null;
  /** Some related `roles` exist. */
  rolesExist?: Scalars["Boolean"] | null;
  /** Filter by the object’s `rounds` relation. */
  rounds?: ProjectToManyRoundFilter | null;
  /** Some related `rounds` exist. */
  roundsExist?: Scalars["Boolean"] | null;
  /** Checks for all expressions in this list. */
  and?: ProjectFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: ProjectFilter[] | null;
  /** Negates the expression. */
  not?: ProjectFilter | null;
}

/** A filter to be used against JSON fields. All fields are combined with a logical ‘and.’ */
export interface JSONFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["JSON"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["JSON"] | null;
  /** Included in the specified list. */
  in?: Scalars["JSON"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["JSON"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["JSON"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["JSON"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["JSON"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["JSON"] | null;
  /** Contains the specified JSON. */
  contains?: Scalars["JSON"] | null;
}

/** A filter to be used against String List fields. All fields are combined with a logical ‘and.’ */
export interface StringListFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: (Scalars["String"] | null)[] | null;
  /** Not equal to the specified value. */
  notEqualTo?: (Scalars["String"] | null)[] | null;
  /** Less than the specified value. */
  lessThan?: (Scalars["String"] | null)[] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: (Scalars["String"] | null)[] | null;
  /** Greater than the specified value. */
  greaterThan?: (Scalars["String"] | null)[] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: (Scalars["String"] | null)[] | null;
  /** Contains the specified list of values. */
  contains?: (Scalars["String"] | null)[] | null;
}

/** A filter to be used against ProjectType fields. All fields are combined with a logical ‘and.’ */
export interface ProjectTypeFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: ProjectType | null;
  /** Not equal to the specified value. */
  notEqualTo?: ProjectType | null;
  /** Included in the specified list. */
  in?: ProjectType[] | null;
  /** Not included in the specified list. */
  notIn?: ProjectType[] | null;
  /** Less than the specified value. */
  lessThan?: ProjectType | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: ProjectType | null;
  /** Greater than the specified value. */
  greaterThan?: ProjectType | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: ProjectType | null;
}

/** A filter to be used against many `ProjectRole` object types. All fields are combined with a logical ‘and.’ */
export interface ProjectToManyProjectRoleFilter {
  /** Every related `ProjectRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ProjectRoleFilter | null;
  /** Some related `ProjectRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ProjectRoleFilter | null;
  /** No related `ProjectRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ProjectRoleFilter | null;
}

/** A filter to be used against many `Round` object types. All fields are combined with a logical ‘and.’ */
export interface ProjectToManyRoundFilter {
  /** Every related `Round` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: RoundFilter | null;
  /** Some related `Round` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: RoundFilter | null;
  /** No related `Round` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: RoundFilter | null;
}

/** A filter to be used against `Round` object types. All fields are combined with a logical ‘and.’ */
export interface RoundFilter {
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `tags` field. */
  tags?: StringListFilter | null;
  /** Filter by the object’s `matchAmount` field. */
  matchAmount?: BigFloatFilter | null;
  /** Filter by the object’s `matchTokenAddress` field. */
  matchTokenAddress?: StringFilter | null;
  /** Filter by the object’s `matchAmountInUsd` field. */
  matchAmountInUsd?: FloatFilter | null;
  /** Filter by the object’s `fundedAmount` field. */
  fundedAmount?: BigFloatFilter | null;
  /** Filter by the object’s `fundedAmountInUsd` field. */
  fundedAmountInUsd?: FloatFilter | null;
  /** Filter by the object’s `applicationMetadataCid` field. */
  applicationMetadataCid?: StringFilter | null;
  /** Filter by the object’s `applicationMetadata` field. */
  applicationMetadata?: JSONFilter | null;
  /** Filter by the object’s `roundMetadataCid` field. */
  roundMetadataCid?: StringFilter | null;
  /** Filter by the object’s `roundMetadata` field. */
  roundMetadata?: JSONFilter | null;
  /** Filter by the object’s `applicationsStartTime` field. */
  applicationsStartTime?: DatetimeFilter | null;
  /** Filter by the object’s `applicationsEndTime` field. */
  applicationsEndTime?: DatetimeFilter | null;
  /** Filter by the object’s `donationsStartTime` field. */
  donationsStartTime?: DatetimeFilter | null;
  /** Filter by the object’s `donationsEndTime` field. */
  donationsEndTime?: DatetimeFilter | null;
  /** Filter by the object’s `createdByAddress` field. */
  createdByAddress?: StringFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `updatedAtBlock` field. */
  updatedAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `managerRole` field. */
  managerRole?: StringFilter | null;
  /** Filter by the object’s `adminRole` field. */
  adminRole?: StringFilter | null;
  /** Filter by the object’s `strategyAddress` field. */
  strategyAddress?: StringFilter | null;
  /** Filter by the object’s `strategyId` field. */
  strategyId?: StringFilter | null;
  /** Filter by the object’s `strategyName` field. */
  strategyName?: StringFilter | null;
  /** Filter by the object’s `matchingDistribution` field. */
  matchingDistribution?: JSONFilter | null;
  /** Filter by the object’s `readyForPayoutTransaction` field. */
  readyForPayoutTransaction?: StringFilter | null;
  /** Filter by the object’s `projectId` field. */
  projectId?: StringFilter | null;
  /** Filter by the object’s `totalAmountDonatedInUsd` field. */
  totalAmountDonatedInUsd?: FloatFilter | null;
  /** Filter by the object’s `totalDonationsCount` field. */
  totalDonationsCount?: IntFilter | null;
  /** Filter by the object’s `uniqueDonorsCount` field. */
  uniqueDonorsCount?: IntFilter | null;
  /** Filter by the object’s `totalDistributed` field. */
  totalDistributed?: BigFloatFilter | null;
  /** Filter by the object’s `roles` relation. */
  roles?: RoundToManyRoundRoleFilter | null;
  /** Some related `roles` exist. */
  rolesExist?: Scalars["Boolean"] | null;
  /** Filter by the object’s `applications` relation. */
  applications?: RoundToManyApplicationFilter | null;
  /** Some related `applications` exist. */
  applicationsExist?: Scalars["Boolean"] | null;
  /** Filter by the object’s `donations` relation. */
  donations?: RoundToManyDonationFilter | null;
  /** Some related `donations` exist. */
  donationsExist?: Scalars["Boolean"] | null;
  /** Filter by the object’s `project` relation. */
  project?: ProjectFilter | null;
  /** A related `project` exists. */
  projectExists?: Scalars["Boolean"] | null;
  /** Checks for all expressions in this list. */
  and?: RoundFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: RoundFilter[] | null;
  /** Negates the expression. */
  not?: RoundFilter | null;
}

/** A filter to be used against Float fields. All fields are combined with a logical ‘and.’ */
export interface FloatFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["Float"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["Float"] | null;
  /** Included in the specified list. */
  in?: Scalars["Float"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["Float"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["Float"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["Float"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["Float"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["Float"] | null;
}

/** A filter to be used against Datetime fields. All fields are combined with a logical ‘and.’ */
export interface DatetimeFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["Datetime"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["Datetime"] | null;
  /** Included in the specified list. */
  in?: Scalars["Datetime"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["Datetime"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["Datetime"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["Datetime"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["Datetime"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["Datetime"] | null;
}

/** A filter to be used against many `RoundRole` object types. All fields are combined with a logical ‘and.’ */
export interface RoundToManyRoundRoleFilter {
  /** Every related `RoundRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: RoundRoleFilter | null;
  /** Some related `RoundRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: RoundRoleFilter | null;
  /** No related `RoundRole` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: RoundRoleFilter | null;
}

/** A filter to be used against `RoundRole` object types. All fields are combined with a logical ‘and.’ */
export interface RoundRoleFilter {
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `roundId` field. */
  roundId?: StringFilter | null;
  /** Filter by the object’s `address` field. */
  address?: StringFilter | null;
  /** Filter by the object’s `role` field. */
  role?: RoundRoleNameFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `round` relation. */
  round?: RoundFilter | null;
  /** Checks for all expressions in this list. */
  and?: RoundRoleFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: RoundRoleFilter[] | null;
  /** Negates the expression. */
  not?: RoundRoleFilter | null;
}

/** A filter to be used against RoundRoleName fields. All fields are combined with a logical ‘and.’ */
export interface RoundRoleNameFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: RoundRoleName | null;
  /** Not equal to the specified value. */
  notEqualTo?: RoundRoleName | null;
  /** Included in the specified list. */
  in?: RoundRoleName[] | null;
  /** Not included in the specified list. */
  notIn?: RoundRoleName[] | null;
  /** Less than the specified value. */
  lessThan?: RoundRoleName | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: RoundRoleName | null;
  /** Greater than the specified value. */
  greaterThan?: RoundRoleName | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: RoundRoleName | null;
}

/** A filter to be used against many `Application` object types. All fields are combined with a logical ‘and.’ */
export interface RoundToManyApplicationFilter {
  /** Every related `Application` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ApplicationFilter | null;
  /** Some related `Application` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ApplicationFilter | null;
  /** No related `Application` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ApplicationFilter | null;
}

/** A filter to be used against `Application` object types. All fields are combined with a logical ‘and.’ */
export interface ApplicationFilter {
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `roundId` field. */
  roundId?: StringFilter | null;
  /** Filter by the object’s `projectId` field. */
  projectId?: StringFilter | null;
  /** Filter by the object’s `anchorAddress` field. */
  anchorAddress?: StringFilter | null;
  /** Filter by the object’s `status` field. */
  status?: ApplicationStatusFilter | null;
  /** Filter by the object’s `statusSnapshots` field. */
  statusSnapshots?: JSONFilter | null;
  /** Filter by the object’s `distributionTransaction` field. */
  distributionTransaction?: StringFilter | null;
  /** Filter by the object’s `metadataCid` field. */
  metadataCid?: StringFilter | null;
  /** Filter by the object’s `metadata` field. */
  metadata?: JSONFilter | null;
  /** Filter by the object’s `createdByAddress` field. */
  createdByAddress?: StringFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `statusUpdatedAtBlock` field. */
  statusUpdatedAtBlock?: BigFloatFilter | null;
  /** Filter by the object’s `totalDonationsCount` field. */
  totalDonationsCount?: IntFilter | null;
  /** Filter by the object’s `totalAmountDonatedInUsd` field. */
  totalAmountDonatedInUsd?: FloatFilter | null;
  /** Filter by the object’s `uniqueDonorsCount` field. */
  uniqueDonorsCount?: IntFilter | null;
  /** Filter by the object’s `tags` field. */
  tags?: StringListFilter | null;
  /** Filter by the object’s `applicationsPayoutsByChainIdAndRoundIdAndApplicationId` relation. */
  applicationsPayoutsByChainIdAndRoundIdAndApplicationId?: ApplicationToManyApplicationsPayoutFilter | null;
  /** Some related `applicationsPayoutsByChainIdAndRoundIdAndApplicationId` exist. */
  applicationsPayoutsByChainIdAndRoundIdAndApplicationIdExist?:
    | Scalars["Boolean"]
    | null;
  /** Filter by the object’s `donations` relation. */
  donations?: ApplicationToManyDonationFilter | null;
  /** Some related `donations` exist. */
  donationsExist?: Scalars["Boolean"] | null;
  /** Filter by the object’s `round` relation. */
  round?: RoundFilter | null;
  /** Checks for all expressions in this list. */
  and?: ApplicationFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: ApplicationFilter[] | null;
  /** Negates the expression. */
  not?: ApplicationFilter | null;
}

/** A filter to be used against ApplicationStatus fields. All fields are combined with a logical ‘and.’ */
export interface ApplicationStatusFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: ApplicationStatus | null;
  /** Not equal to the specified value. */
  notEqualTo?: ApplicationStatus | null;
  /** Included in the specified list. */
  in?: ApplicationStatus[] | null;
  /** Not included in the specified list. */
  notIn?: ApplicationStatus[] | null;
  /** Less than the specified value. */
  lessThan?: ApplicationStatus | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: ApplicationStatus | null;
  /** Greater than the specified value. */
  greaterThan?: ApplicationStatus | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: ApplicationStatus | null;
}

/** A filter to be used against many `ApplicationsPayout` object types. All fields are combined with a logical ‘and.’ */
export interface ApplicationToManyApplicationsPayoutFilter {
  /** Every related `ApplicationsPayout` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: ApplicationsPayoutFilter | null;
  /** Some related `ApplicationsPayout` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: ApplicationsPayoutFilter | null;
  /** No related `ApplicationsPayout` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: ApplicationsPayoutFilter | null;
}

/** A filter to be used against `ApplicationsPayout` object types. All fields are combined with a logical ‘and.’ */
export interface ApplicationsPayoutFilter {
  /** Filter by the object’s `id` field. */
  id?: IntFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `applicationId` field. */
  applicationId?: StringFilter | null;
  /** Filter by the object’s `roundId` field. */
  roundId?: StringFilter | null;
  /** Filter by the object’s `amount` field. */
  amount?: BigFloatFilter | null;
  /** Filter by the object’s `tokenAddress` field. */
  tokenAddress?: StringFilter | null;
  /** Filter by the object’s `amountInUsd` field. */
  amountInUsd?: FloatFilter | null;
  /** Filter by the object’s `amountInRoundMatchToken` field. */
  amountInRoundMatchToken?: StringFilter | null;
  /** Filter by the object’s `transactionHash` field. */
  transactionHash?: StringFilter | null;
  /** Filter by the object’s `timestamp` field. */
  timestamp?: DatetimeFilter | null;
  /** Filter by the object’s `sender` field. */
  sender?: StringFilter | null;
  /** Filter by the object’s `chainRoundApplication` relation. */
  chainRoundApplication?: ApplicationFilter | null;
  /** A related `chainRoundApplication` exists. */
  chainRoundApplicationExists?: Scalars["Boolean"] | null;
  /** Checks for all expressions in this list. */
  and?: ApplicationsPayoutFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: ApplicationsPayoutFilter[] | null;
  /** Negates the expression. */
  not?: ApplicationsPayoutFilter | null;
}

/** A filter to be used against many `Donation` object types. All fields are combined with a logical ‘and.’ */
export interface ApplicationToManyDonationFilter {
  /** Every related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: DonationFilter | null;
  /** Some related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: DonationFilter | null;
  /** No related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: DonationFilter | null;
}

/** A filter to be used against `Donation` object types. All fields are combined with a logical ‘and.’ */
export interface DonationFilter {
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `roundId` field. */
  roundId?: StringFilter | null;
  /** Filter by the object’s `applicationId` field. */
  applicationId?: StringFilter | null;
  /** Filter by the object’s `donorAddress` field. */
  donorAddress?: StringFilter | null;
  /** Filter by the object’s `recipientAddress` field. */
  recipientAddress?: StringFilter | null;
  /** Filter by the object’s `projectId` field. */
  projectId?: StringFilter | null;
  /** Filter by the object’s `transactionHash` field. */
  transactionHash?: StringFilter | null;
  /** Filter by the object’s `blockNumber` field. */
  blockNumber?: BigFloatFilter | null;
  /** Filter by the object’s `tokenAddress` field. */
  tokenAddress?: StringFilter | null;
  /** Filter by the object’s `timestamp` field. */
  timestamp?: DatetimeFilter | null;
  /** Filter by the object’s `amount` field. */
  amount?: BigFloatFilter | null;
  /** Filter by the object’s `amountInUsd` field. */
  amountInUsd?: FloatFilter | null;
  /** Filter by the object’s `amountInRoundMatchToken` field. */
  amountInRoundMatchToken?: BigFloatFilter | null;
  /** Filter by the object’s `round` relation. */
  round?: RoundFilter | null;
  /** A related `round` exists. */
  roundExists?: Scalars["Boolean"] | null;
  /** Filter by the object’s `application` relation. */
  application?: ApplicationFilter | null;
  /** A related `application` exists. */
  applicationExists?: Scalars["Boolean"] | null;
  /** Checks for all expressions in this list. */
  and?: DonationFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: DonationFilter[] | null;
  /** Negates the expression. */
  not?: DonationFilter | null;
}

/** A filter to be used against many `Donation` object types. All fields are combined with a logical ‘and.’ */
export interface RoundToManyDonationFilter {
  /** Every related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  every?: DonationFilter | null;
  /** Some related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  some?: DonationFilter | null;
  /** No related `Donation` matches the filter criteria. All fields are combined with a logical ‘and.’ */
  none?: DonationFilter | null;
}

/** A condition to be used against `Round` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export interface RoundCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["String"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `tags` field. */
  tags?: (Scalars["String"] | null)[] | null;
  /** Checks for equality with the object’s `matchAmount` field. */
  matchAmount?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `matchTokenAddress` field. */
  matchTokenAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `matchAmountInUsd` field. */
  matchAmountInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `fundedAmount` field. */
  fundedAmount?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `fundedAmountInUsd` field. */
  fundedAmountInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `applicationMetadataCid` field. */
  applicationMetadataCid?: Scalars["String"] | null;
  /** Checks for equality with the object’s `applicationMetadata` field. */
  applicationMetadata?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `roundMetadataCid` field. */
  roundMetadataCid?: Scalars["String"] | null;
  /** Checks for equality with the object’s `roundMetadata` field. */
  roundMetadata?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `applicationsStartTime` field. */
  applicationsStartTime?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `applicationsEndTime` field. */
  applicationsEndTime?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `donationsStartTime` field. */
  donationsStartTime?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `donationsEndTime` field. */
  donationsEndTime?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `createdByAddress` field. */
  createdByAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `updatedAtBlock` field. */
  updatedAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `managerRole` field. */
  managerRole?: Scalars["String"] | null;
  /** Checks for equality with the object’s `adminRole` field. */
  adminRole?: Scalars["String"] | null;
  /** Checks for equality with the object’s `strategyAddress` field. */
  strategyAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `strategyId` field. */
  strategyId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `strategyName` field. */
  strategyName?: Scalars["String"] | null;
  /** Checks for equality with the object’s `matchingDistribution` field. */
  matchingDistribution?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `readyForPayoutTransaction` field. */
  readyForPayoutTransaction?: Scalars["String"] | null;
  /** Checks for equality with the object’s `projectId` field. */
  projectId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `totalAmountDonatedInUsd` field. */
  totalAmountDonatedInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `totalDonationsCount` field. */
  totalDonationsCount?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `uniqueDonorsCount` field. */
  uniqueDonorsCount?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `totalDistributed` field. */
  totalDistributed?: Scalars["BigFloat"] | null;
}

export interface RoundRoleGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  chainId?: boolean | number;
  roundId?: boolean | number;
  address?: boolean | number;
  role?: boolean | number;
  createdAtBlock?: boolean | number;
  /** Reads a single `Round` that is related to this `RoundRole`. */
  round?: RoundGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `RoundRole` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export interface RoundRoleCondition {
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `roundId` field. */
  roundId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `address` field. */
  address?: Scalars["String"] | null;
  /** Checks for equality with the object’s `role` field. */
  role?: RoundRoleName | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
}

/**
 * A condition to be used against `Application` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export interface ApplicationCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["String"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `roundId` field. */
  roundId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `projectId` field. */
  projectId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `anchorAddress` field. */
  anchorAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `status` field. */
  status?: ApplicationStatus | null;
  /** Checks for equality with the object’s `statusSnapshots` field. */
  statusSnapshots?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `distributionTransaction` field. */
  distributionTransaction?: Scalars["String"] | null;
  /** Checks for equality with the object’s `metadataCid` field. */
  metadataCid?: Scalars["String"] | null;
  /** Checks for equality with the object’s `metadata` field. */
  metadata?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `createdByAddress` field. */
  createdByAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `statusUpdatedAtBlock` field. */
  statusUpdatedAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `totalDonationsCount` field. */
  totalDonationsCount?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `totalAmountDonatedInUsd` field. */
  totalAmountDonatedInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `uniqueDonorsCount` field. */
  uniqueDonorsCount?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `tags` field. */
  tags?: (Scalars["String"] | null)[] | null;
}

/**    */
export interface DonationGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  roundId?: boolean | number;
  applicationId?: boolean | number;
  donorAddress?: boolean | number;
  recipientAddress?: boolean | number;
  projectId?: boolean | number;
  transactionHash?: boolean | number;
  blockNumber?: boolean | number;
  tokenAddress?: boolean | number;
  timestamp?: boolean | number;
  amount?: boolean | number;
  amountInUsd?: boolean | number;
  amountInRoundMatchToken?: boolean | number;
  /** Reads a single `Round` that is related to this `Donation`. */
  round?: RoundGenqlSelection;
  /** Reads a single `Application` that is related to this `Donation`. */
  application?: ApplicationGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `Donation` object types. All fields are tested
 * for equality and combined with a logical ‘and.’
 */
export interface DonationCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["String"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `roundId` field. */
  roundId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `applicationId` field. */
  applicationId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `donorAddress` field. */
  donorAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `recipientAddress` field. */
  recipientAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `projectId` field. */
  projectId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `transactionHash` field. */
  transactionHash?: Scalars["String"] | null;
  /** Checks for equality with the object’s `blockNumber` field. */
  blockNumber?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `tokenAddress` field. */
  tokenAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `timestamp` field. */
  timestamp?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `amount` field. */
  amount?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `amountInUsd` field. */
  amountInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `amountInRoundMatchToken` field. */
  amountInRoundMatchToken?: Scalars["BigFloat"] | null;
}

export interface ApplicationsPayoutGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  applicationId?: boolean | number;
  roundId?: boolean | number;
  amount?: boolean | number;
  tokenAddress?: boolean | number;
  amountInUsd?: boolean | number;
  amountInRoundMatchToken?: boolean | number;
  transactionHash?: boolean | number;
  timestamp?: boolean | number;
  sender?: boolean | number;
  /** Reads a single `Application` that is related to this `ApplicationsPayout`. */
  chainRoundApplication?: ApplicationGenqlSelection;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `ApplicationsPayout` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export interface ApplicationsPayoutCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `applicationId` field. */
  applicationId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `roundId` field. */
  roundId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `amount` field. */
  amount?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `tokenAddress` field. */
  tokenAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `amountInUsd` field. */
  amountInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `amountInRoundMatchToken` field. */
  amountInRoundMatchToken?: Scalars["String"] | null;
  /** Checks for equality with the object’s `transactionHash` field. */
  transactionHash?: Scalars["String"] | null;
  /** Checks for equality with the object’s `timestamp` field. */
  timestamp?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `sender` field. */
  sender?: Scalars["String"] | null;
}

export interface LegacyProjectGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  v1ProjectId?: boolean | number;
  v2ProjectId?: boolean | number;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `LegacyProject` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export interface LegacyProjectCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `v1ProjectId` field. */
  v1ProjectId?: Scalars["String"] | null;
  /** Checks for equality with the object’s `v2ProjectId` field. */
  v2ProjectId?: Scalars["String"] | null;
}

/** A filter to be used against `LegacyProject` object types. All fields are combined with a logical ‘and.’ */
export interface LegacyProjectFilter {
  /** Filter by the object’s `id` field. */
  id?: IntFilter | null;
  /** Filter by the object’s `v1ProjectId` field. */
  v1ProjectId?: StringFilter | null;
  /** Filter by the object’s `v2ProjectId` field. */
  v2ProjectId?: StringFilter | null;
  /** Checks for all expressions in this list. */
  and?: LegacyProjectFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: LegacyProjectFilter[] | null;
  /** Negates the expression. */
  not?: LegacyProjectFilter | null;
}

export interface PendingProjectRoleGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  role?: boolean | number;
  address?: boolean | number;
  createdAtBlock?: boolean | number;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `PendingProjectRole` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export interface PendingProjectRoleCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `role` field. */
  role?: Scalars["String"] | null;
  /** Checks for equality with the object’s `address` field. */
  address?: Scalars["String"] | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
}

/** A filter to be used against `PendingProjectRole` object types. All fields are combined with a logical ‘and.’ */
export interface PendingProjectRoleFilter {
  /** Filter by the object’s `id` field. */
  id?: IntFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `role` field. */
  role?: StringFilter | null;
  /** Filter by the object’s `address` field. */
  address?: StringFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Checks for all expressions in this list. */
  and?: PendingProjectRoleFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: PendingProjectRoleFilter[] | null;
  /** Negates the expression. */
  not?: PendingProjectRoleFilter | null;
}

export interface PendingRoundRoleGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  role?: boolean | number;
  address?: boolean | number;
  createdAtBlock?: boolean | number;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `PendingRoundRole` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export interface PendingRoundRoleCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `role` field. */
  role?: Scalars["String"] | null;
  /** Checks for equality with the object’s `address` field. */
  address?: Scalars["String"] | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
}

/** A filter to be used against `PendingRoundRole` object types. All fields are combined with a logical ‘and.’ */
export interface PendingRoundRoleFilter {
  /** Filter by the object’s `id` field. */
  id?: IntFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `role` field. */
  role?: StringFilter | null;
  /** Filter by the object’s `address` field. */
  address?: StringFilter | null;
  /** Filter by the object’s `createdAtBlock` field. */
  createdAtBlock?: BigFloatFilter | null;
  /** Checks for all expressions in this list. */
  and?: PendingRoundRoleFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: PendingRoundRoleFilter[] | null;
  /** Negates the expression. */
  not?: PendingRoundRoleFilter | null;
}

export interface PriceGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  tokenAddress?: boolean | number;
  priceInUsd?: boolean | number;
  timestamp?: boolean | number;
  blockNumber?: boolean | number;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/** A condition to be used against `Price` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export interface PriceCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `tokenAddress` field. */
  tokenAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `priceInUsd` field. */
  priceInUsd?: Scalars["Float"] | null;
  /** Checks for equality with the object’s `timestamp` field. */
  timestamp?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `blockNumber` field. */
  blockNumber?: Scalars["BigFloat"] | null;
}

/** A filter to be used against `Price` object types. All fields are combined with a logical ‘and.’ */
export interface PriceFilter {
  /** Filter by the object’s `id` field. */
  id?: IntFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `tokenAddress` field. */
  tokenAddress?: StringFilter | null;
  /** Filter by the object’s `priceInUsd` field. */
  priceInUsd?: FloatFilter | null;
  /** Filter by the object’s `timestamp` field. */
  timestamp?: DatetimeFilter | null;
  /** Filter by the object’s `blockNumber` field. */
  blockNumber?: BigFloatFilter | null;
  /** Checks for all expressions in this list. */
  and?: PriceFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: PriceFilter[] | null;
  /** Negates the expression. */
  not?: PriceFilter | null;
}

/** A condition to be used against `Project` object types. All fields are tested for equality and combined with a logical ‘and.’ */
export interface ProjectCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["String"] | null;
  /** Checks for equality with the object’s `name` field. */
  name?: Scalars["String"] | null;
  /** Checks for equality with the object’s `nonce` field. */
  nonce?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `anchorAddress` field. */
  anchorAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `projectNumber` field. */
  projectNumber?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `registryAddress` field. */
  registryAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `metadataCid` field. */
  metadataCid?: Scalars["String"] | null;
  /** Checks for equality with the object’s `metadata` field. */
  metadata?: Scalars["JSON"] | null;
  /** Checks for equality with the object’s `createdByAddress` field. */
  createdByAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `createdAtBlock` field. */
  createdAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `updatedAtBlock` field. */
  updatedAtBlock?: Scalars["BigFloat"] | null;
  /** Checks for equality with the object’s `tags` field. */
  tags?: (Scalars["String"] | null)[] | null;
  /** Checks for equality with the object’s `projectType` field. */
  projectType?: ProjectType | null;
}

export interface SubscriptionGenqlSelection {
  /** A globally unique identifier. Can be used in various places throughout the system to identify this single value. */
  nodeId?: boolean | number;
  id?: boolean | number;
  chainId?: boolean | number;
  contractName?: boolean | number;
  contractAddress?: boolean | number;
  fromBlock?: boolean | number;
  toBlock?: boolean | number;
  indexedToBlock?: boolean | number;
  indexedToLogIndex?: boolean | number;
  createdAt?: boolean | number;
  updatedAt?: boolean | number;
  __typename?: boolean | number;
  __scalar?: boolean | number;
}

/**
 * A condition to be used against `Subscription` object types. All fields are
 * tested for equality and combined with a logical ‘and.’
 */
export interface SubscriptionCondition {
  /** Checks for equality with the object’s `id` field. */
  id?: Scalars["String"] | null;
  /** Checks for equality with the object’s `chainId` field. */
  chainId?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `contractName` field. */
  contractName?: Scalars["String"] | null;
  /** Checks for equality with the object’s `contractAddress` field. */
  contractAddress?: Scalars["String"] | null;
  /** Checks for equality with the object’s `fromBlock` field. */
  fromBlock?: Scalars["BigInt"] | null;
  /** Checks for equality with the object’s `toBlock` field. */
  toBlock?: Scalars["String"] | null;
  /** Checks for equality with the object’s `indexedToBlock` field. */
  indexedToBlock?: Scalars["BigInt"] | null;
  /** Checks for equality with the object’s `indexedToLogIndex` field. */
  indexedToLogIndex?: Scalars["Int"] | null;
  /** Checks for equality with the object’s `createdAt` field. */
  createdAt?: Scalars["Datetime"] | null;
  /** Checks for equality with the object’s `updatedAt` field. */
  updatedAt?: Scalars["Datetime"] | null;
}

/** A filter to be used against `Subscription` object types. All fields are combined with a logical ‘and.’ */
export interface SubscriptionFilter {
  /** Filter by the object’s `id` field. */
  id?: StringFilter | null;
  /** Filter by the object’s `chainId` field. */
  chainId?: IntFilter | null;
  /** Filter by the object’s `contractName` field. */
  contractName?: StringFilter | null;
  /** Filter by the object’s `contractAddress` field. */
  contractAddress?: StringFilter | null;
  /** Filter by the object’s `fromBlock` field. */
  fromBlock?: BigIntFilter | null;
  /** Filter by the object’s `toBlock` field. */
  toBlock?: StringFilter | null;
  /** Filter by the object’s `indexedToBlock` field. */
  indexedToBlock?: BigIntFilter | null;
  /** Filter by the object’s `indexedToLogIndex` field. */
  indexedToLogIndex?: IntFilter | null;
  /** Filter by the object’s `createdAt` field. */
  createdAt?: DatetimeFilter | null;
  /** Filter by the object’s `updatedAt` field. */
  updatedAt?: DatetimeFilter | null;
  /** Checks for all expressions in this list. */
  and?: SubscriptionFilter[] | null;
  /** Checks for any expressions in this list. */
  or?: SubscriptionFilter[] | null;
  /** Negates the expression. */
  not?: SubscriptionFilter | null;
}

/** A filter to be used against BigInt fields. All fields are combined with a logical ‘and.’ */
export interface BigIntFilter {
  /** Is null (if `true` is specified) or is not null (if `false` is specified). */
  isNull?: Scalars["Boolean"] | null;
  /** Equal to the specified value. */
  equalTo?: Scalars["BigInt"] | null;
  /** Not equal to the specified value. */
  notEqualTo?: Scalars["BigInt"] | null;
  /** Included in the specified list. */
  in?: Scalars["BigInt"][] | null;
  /** Not included in the specified list. */
  notIn?: Scalars["BigInt"][] | null;
  /** Less than the specified value. */
  lessThan?: Scalars["BigInt"] | null;
  /** Less than or equal to the specified value. */
  lessThanOrEqualTo?: Scalars["BigInt"] | null;
  /** Greater than the specified value. */
  greaterThan?: Scalars["BigInt"] | null;
  /** Greater than or equal to the specified value. */
  greaterThanOrEqualTo?: Scalars["BigInt"] | null;
}

const Query_possibleTypes: string[] = ["Query"];
export const isQuery = (obj?: { __typename?: any } | null): obj is Query => {
  if (!obj?.__typename) throw new Error('__typename is missing in "isQuery"');
  return Query_possibleTypes.includes(obj.__typename);
};

const Node_possibleTypes: string[] = [
  "Query",
  "Application",
  "Round",
  "Project",
  "ProjectRole",
  "RoundRole",
  "Donation",
  "ApplicationsPayout",
  "LegacyProject",
  "PendingProjectRole",
  "PendingRoundRole",
  "Price",
  "Subscription",
];
export const isNode = (obj?: { __typename?: any } | null): obj is Node => {
  if (!obj?.__typename) throw new Error('__typename is missing in "isNode"');
  return Node_possibleTypes.includes(obj.__typename);
};

const Application_possibleTypes: string[] = ["Application"];
export const isApplication = (
  obj?: { __typename?: any } | null,
): obj is Application => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isApplication"');
  return Application_possibleTypes.includes(obj.__typename);
};

const Round_possibleTypes: string[] = ["Round"];
export const isRound = (obj?: { __typename?: any } | null): obj is Round => {
  if (!obj?.__typename) throw new Error('__typename is missing in "isRound"');
  return Round_possibleTypes.includes(obj.__typename);
};

const Project_possibleTypes: string[] = ["Project"];
export const isProject = (
  obj?: { __typename?: any } | null,
): obj is Project => {
  if (!obj?.__typename) throw new Error('__typename is missing in "isProject"');
  return Project_possibleTypes.includes(obj.__typename);
};

const ProjectRole_possibleTypes: string[] = ["ProjectRole"];
export const isProjectRole = (
  obj?: { __typename?: any } | null,
): obj is ProjectRole => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isProjectRole"');
  return ProjectRole_possibleTypes.includes(obj.__typename);
};

const RoundRole_possibleTypes: string[] = ["RoundRole"];
export const isRoundRole = (
  obj?: { __typename?: any } | null,
): obj is RoundRole => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isRoundRole"');
  return RoundRole_possibleTypes.includes(obj.__typename);
};

const Donation_possibleTypes: string[] = ["Donation"];
export const isDonation = (
  obj?: { __typename?: any } | null,
): obj is Donation => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isDonation"');
  return Donation_possibleTypes.includes(obj.__typename);
};

const ApplicationsPayout_possibleTypes: string[] = ["ApplicationsPayout"];
export const isApplicationsPayout = (
  obj?: { __typename?: any } | null,
): obj is ApplicationsPayout => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isApplicationsPayout"');
  return ApplicationsPayout_possibleTypes.includes(obj.__typename);
};

const LegacyProject_possibleTypes: string[] = ["LegacyProject"];
export const isLegacyProject = (
  obj?: { __typename?: any } | null,
): obj is LegacyProject => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isLegacyProject"');
  return LegacyProject_possibleTypes.includes(obj.__typename);
};

const PendingProjectRole_possibleTypes: string[] = ["PendingProjectRole"];
export const isPendingProjectRole = (
  obj?: { __typename?: any } | null,
): obj is PendingProjectRole => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isPendingProjectRole"');
  return PendingProjectRole_possibleTypes.includes(obj.__typename);
};

const PendingRoundRole_possibleTypes: string[] = ["PendingRoundRole"];
export const isPendingRoundRole = (
  obj?: { __typename?: any } | null,
): obj is PendingRoundRole => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isPendingRoundRole"');
  return PendingRoundRole_possibleTypes.includes(obj.__typename);
};

const Price_possibleTypes: string[] = ["Price"];
export const isPrice = (obj?: { __typename?: any } | null): obj is Price => {
  if (!obj?.__typename) throw new Error('__typename is missing in "isPrice"');
  return Price_possibleTypes.includes(obj.__typename);
};

const Subscription_possibleTypes: string[] = ["Subscription"];
export const isSubscription = (
  obj?: { __typename?: any } | null,
): obj is Subscription => {
  if (!obj?.__typename)
    throw new Error('__typename is missing in "isSubscription"');
  return Subscription_possibleTypes.includes(obj.__typename);
};

export const enumApplicationStatus = {
  PENDING: "PENDING" as const,
  APPROVED: "APPROVED" as const,
  REJECTED: "REJECTED" as const,
  CANCELLED: "CANCELLED" as const,
  IN_REVIEW: "IN_REVIEW" as const,
};

export const enumProjectType = {
  CANONICAL: "CANONICAL" as const,
  LINKED: "LINKED" as const,
};

export const enumProjectRoleName = {
  OWNER: "OWNER" as const,
  MEMBER: "MEMBER" as const,
};

export const enumProjectRolesOrderBy = {
  NATURAL: "NATURAL" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  PROJECT_ID_ASC: "PROJECT_ID_ASC" as const,
  PROJECT_ID_DESC: "PROJECT_ID_DESC" as const,
  ADDRESS_ASC: "ADDRESS_ASC" as const,
  ADDRESS_DESC: "ADDRESS_DESC" as const,
  ROLE_ASC: "ROLE_ASC" as const,
  ROLE_DESC: "ROLE_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumRoundRoleName = {
  ADMIN: "ADMIN" as const,
  MANAGER: "MANAGER" as const,
};

export const enumRoundsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  TAGS_ASC: "TAGS_ASC" as const,
  TAGS_DESC: "TAGS_DESC" as const,
  MATCH_AMOUNT_ASC: "MATCH_AMOUNT_ASC" as const,
  MATCH_AMOUNT_DESC: "MATCH_AMOUNT_DESC" as const,
  MATCH_TOKEN_ADDRESS_ASC: "MATCH_TOKEN_ADDRESS_ASC" as const,
  MATCH_TOKEN_ADDRESS_DESC: "MATCH_TOKEN_ADDRESS_DESC" as const,
  MATCH_AMOUNT_IN_USD_ASC: "MATCH_AMOUNT_IN_USD_ASC" as const,
  MATCH_AMOUNT_IN_USD_DESC: "MATCH_AMOUNT_IN_USD_DESC" as const,
  FUNDED_AMOUNT_ASC: "FUNDED_AMOUNT_ASC" as const,
  FUNDED_AMOUNT_DESC: "FUNDED_AMOUNT_DESC" as const,
  FUNDED_AMOUNT_IN_USD_ASC: "FUNDED_AMOUNT_IN_USD_ASC" as const,
  FUNDED_AMOUNT_IN_USD_DESC: "FUNDED_AMOUNT_IN_USD_DESC" as const,
  APPLICATION_METADATA_CID_ASC: "APPLICATION_METADATA_CID_ASC" as const,
  APPLICATION_METADATA_CID_DESC: "APPLICATION_METADATA_CID_DESC" as const,
  APPLICATION_METADATA_ASC: "APPLICATION_METADATA_ASC" as const,
  APPLICATION_METADATA_DESC: "APPLICATION_METADATA_DESC" as const,
  ROUND_METADATA_CID_ASC: "ROUND_METADATA_CID_ASC" as const,
  ROUND_METADATA_CID_DESC: "ROUND_METADATA_CID_DESC" as const,
  ROUND_METADATA_ASC: "ROUND_METADATA_ASC" as const,
  ROUND_METADATA_DESC: "ROUND_METADATA_DESC" as const,
  APPLICATIONS_START_TIME_ASC: "APPLICATIONS_START_TIME_ASC" as const,
  APPLICATIONS_START_TIME_DESC: "APPLICATIONS_START_TIME_DESC" as const,
  APPLICATIONS_END_TIME_ASC: "APPLICATIONS_END_TIME_ASC" as const,
  APPLICATIONS_END_TIME_DESC: "APPLICATIONS_END_TIME_DESC" as const,
  DONATIONS_START_TIME_ASC: "DONATIONS_START_TIME_ASC" as const,
  DONATIONS_START_TIME_DESC: "DONATIONS_START_TIME_DESC" as const,
  DONATIONS_END_TIME_ASC: "DONATIONS_END_TIME_ASC" as const,
  DONATIONS_END_TIME_DESC: "DONATIONS_END_TIME_DESC" as const,
  CREATED_BY_ADDRESS_ASC: "CREATED_BY_ADDRESS_ASC" as const,
  CREATED_BY_ADDRESS_DESC: "CREATED_BY_ADDRESS_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  UPDATED_AT_BLOCK_ASC: "UPDATED_AT_BLOCK_ASC" as const,
  UPDATED_AT_BLOCK_DESC: "UPDATED_AT_BLOCK_DESC" as const,
  MANAGER_ROLE_ASC: "MANAGER_ROLE_ASC" as const,
  MANAGER_ROLE_DESC: "MANAGER_ROLE_DESC" as const,
  ADMIN_ROLE_ASC: "ADMIN_ROLE_ASC" as const,
  ADMIN_ROLE_DESC: "ADMIN_ROLE_DESC" as const,
  STRATEGY_ADDRESS_ASC: "STRATEGY_ADDRESS_ASC" as const,
  STRATEGY_ADDRESS_DESC: "STRATEGY_ADDRESS_DESC" as const,
  STRATEGY_ID_ASC: "STRATEGY_ID_ASC" as const,
  STRATEGY_ID_DESC: "STRATEGY_ID_DESC" as const,
  STRATEGY_NAME_ASC: "STRATEGY_NAME_ASC" as const,
  STRATEGY_NAME_DESC: "STRATEGY_NAME_DESC" as const,
  MATCHING_DISTRIBUTION_ASC: "MATCHING_DISTRIBUTION_ASC" as const,
  MATCHING_DISTRIBUTION_DESC: "MATCHING_DISTRIBUTION_DESC" as const,
  READY_FOR_PAYOUT_TRANSACTION_ASC: "READY_FOR_PAYOUT_TRANSACTION_ASC" as const,
  READY_FOR_PAYOUT_TRANSACTION_DESC:
    "READY_FOR_PAYOUT_TRANSACTION_DESC" as const,
  PROJECT_ID_ASC: "PROJECT_ID_ASC" as const,
  PROJECT_ID_DESC: "PROJECT_ID_DESC" as const,
  TOTAL_AMOUNT_DONATED_IN_USD_ASC: "TOTAL_AMOUNT_DONATED_IN_USD_ASC" as const,
  TOTAL_AMOUNT_DONATED_IN_USD_DESC: "TOTAL_AMOUNT_DONATED_IN_USD_DESC" as const,
  TOTAL_DONATIONS_COUNT_ASC: "TOTAL_DONATIONS_COUNT_ASC" as const,
  TOTAL_DONATIONS_COUNT_DESC: "TOTAL_DONATIONS_COUNT_DESC" as const,
  UNIQUE_DONORS_COUNT_ASC: "UNIQUE_DONORS_COUNT_ASC" as const,
  UNIQUE_DONORS_COUNT_DESC: "UNIQUE_DONORS_COUNT_DESC" as const,
  TOTAL_DISTRIBUTED_ASC: "TOTAL_DISTRIBUTED_ASC" as const,
  TOTAL_DISTRIBUTED_DESC: "TOTAL_DISTRIBUTED_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumRoundRolesOrderBy = {
  NATURAL: "NATURAL" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  ROUND_ID_ASC: "ROUND_ID_ASC" as const,
  ROUND_ID_DESC: "ROUND_ID_DESC" as const,
  ADDRESS_ASC: "ADDRESS_ASC" as const,
  ADDRESS_DESC: "ADDRESS_DESC" as const,
  ROLE_ASC: "ROLE_ASC" as const,
  ROLE_DESC: "ROLE_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumApplicationsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  ROUND_ID_ASC: "ROUND_ID_ASC" as const,
  ROUND_ID_DESC: "ROUND_ID_DESC" as const,
  PROJECT_ID_ASC: "PROJECT_ID_ASC" as const,
  PROJECT_ID_DESC: "PROJECT_ID_DESC" as const,
  ANCHOR_ADDRESS_ASC: "ANCHOR_ADDRESS_ASC" as const,
  ANCHOR_ADDRESS_DESC: "ANCHOR_ADDRESS_DESC" as const,
  STATUS_ASC: "STATUS_ASC" as const,
  STATUS_DESC: "STATUS_DESC" as const,
  STATUS_SNAPSHOTS_ASC: "STATUS_SNAPSHOTS_ASC" as const,
  STATUS_SNAPSHOTS_DESC: "STATUS_SNAPSHOTS_DESC" as const,
  DISTRIBUTION_TRANSACTION_ASC: "DISTRIBUTION_TRANSACTION_ASC" as const,
  DISTRIBUTION_TRANSACTION_DESC: "DISTRIBUTION_TRANSACTION_DESC" as const,
  METADATA_CID_ASC: "METADATA_CID_ASC" as const,
  METADATA_CID_DESC: "METADATA_CID_DESC" as const,
  METADATA_ASC: "METADATA_ASC" as const,
  METADATA_DESC: "METADATA_DESC" as const,
  CREATED_BY_ADDRESS_ASC: "CREATED_BY_ADDRESS_ASC" as const,
  CREATED_BY_ADDRESS_DESC: "CREATED_BY_ADDRESS_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  STATUS_UPDATED_AT_BLOCK_ASC: "STATUS_UPDATED_AT_BLOCK_ASC" as const,
  STATUS_UPDATED_AT_BLOCK_DESC: "STATUS_UPDATED_AT_BLOCK_DESC" as const,
  TOTAL_DONATIONS_COUNT_ASC: "TOTAL_DONATIONS_COUNT_ASC" as const,
  TOTAL_DONATIONS_COUNT_DESC: "TOTAL_DONATIONS_COUNT_DESC" as const,
  TOTAL_AMOUNT_DONATED_IN_USD_ASC: "TOTAL_AMOUNT_DONATED_IN_USD_ASC" as const,
  TOTAL_AMOUNT_DONATED_IN_USD_DESC: "TOTAL_AMOUNT_DONATED_IN_USD_DESC" as const,
  UNIQUE_DONORS_COUNT_ASC: "UNIQUE_DONORS_COUNT_ASC" as const,
  UNIQUE_DONORS_COUNT_DESC: "UNIQUE_DONORS_COUNT_DESC" as const,
  TAGS_ASC: "TAGS_ASC" as const,
  TAGS_DESC: "TAGS_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumDonationsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  ROUND_ID_ASC: "ROUND_ID_ASC" as const,
  ROUND_ID_DESC: "ROUND_ID_DESC" as const,
  APPLICATION_ID_ASC: "APPLICATION_ID_ASC" as const,
  APPLICATION_ID_DESC: "APPLICATION_ID_DESC" as const,
  DONOR_ADDRESS_ASC: "DONOR_ADDRESS_ASC" as const,
  DONOR_ADDRESS_DESC: "DONOR_ADDRESS_DESC" as const,
  RECIPIENT_ADDRESS_ASC: "RECIPIENT_ADDRESS_ASC" as const,
  RECIPIENT_ADDRESS_DESC: "RECIPIENT_ADDRESS_DESC" as const,
  PROJECT_ID_ASC: "PROJECT_ID_ASC" as const,
  PROJECT_ID_DESC: "PROJECT_ID_DESC" as const,
  TRANSACTION_HASH_ASC: "TRANSACTION_HASH_ASC" as const,
  TRANSACTION_HASH_DESC: "TRANSACTION_HASH_DESC" as const,
  BLOCK_NUMBER_ASC: "BLOCK_NUMBER_ASC" as const,
  BLOCK_NUMBER_DESC: "BLOCK_NUMBER_DESC" as const,
  TOKEN_ADDRESS_ASC: "TOKEN_ADDRESS_ASC" as const,
  TOKEN_ADDRESS_DESC: "TOKEN_ADDRESS_DESC" as const,
  TIMESTAMP_ASC: "TIMESTAMP_ASC" as const,
  TIMESTAMP_DESC: "TIMESTAMP_DESC" as const,
  AMOUNT_ASC: "AMOUNT_ASC" as const,
  AMOUNT_DESC: "AMOUNT_DESC" as const,
  AMOUNT_IN_USD_ASC: "AMOUNT_IN_USD_ASC" as const,
  AMOUNT_IN_USD_DESC: "AMOUNT_IN_USD_DESC" as const,
  AMOUNT_IN_ROUND_MATCH_TOKEN_ASC: "AMOUNT_IN_ROUND_MATCH_TOKEN_ASC" as const,
  AMOUNT_IN_ROUND_MATCH_TOKEN_DESC: "AMOUNT_IN_ROUND_MATCH_TOKEN_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumApplicationsPayoutsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  APPLICATION_ID_ASC: "APPLICATION_ID_ASC" as const,
  APPLICATION_ID_DESC: "APPLICATION_ID_DESC" as const,
  ROUND_ID_ASC: "ROUND_ID_ASC" as const,
  ROUND_ID_DESC: "ROUND_ID_DESC" as const,
  AMOUNT_ASC: "AMOUNT_ASC" as const,
  AMOUNT_DESC: "AMOUNT_DESC" as const,
  TOKEN_ADDRESS_ASC: "TOKEN_ADDRESS_ASC" as const,
  TOKEN_ADDRESS_DESC: "TOKEN_ADDRESS_DESC" as const,
  AMOUNT_IN_USD_ASC: "AMOUNT_IN_USD_ASC" as const,
  AMOUNT_IN_USD_DESC: "AMOUNT_IN_USD_DESC" as const,
  AMOUNT_IN_ROUND_MATCH_TOKEN_ASC: "AMOUNT_IN_ROUND_MATCH_TOKEN_ASC" as const,
  AMOUNT_IN_ROUND_MATCH_TOKEN_DESC: "AMOUNT_IN_ROUND_MATCH_TOKEN_DESC" as const,
  TRANSACTION_HASH_ASC: "TRANSACTION_HASH_ASC" as const,
  TRANSACTION_HASH_DESC: "TRANSACTION_HASH_DESC" as const,
  TIMESTAMP_ASC: "TIMESTAMP_ASC" as const,
  TIMESTAMP_DESC: "TIMESTAMP_DESC" as const,
  SENDER_ASC: "SENDER_ASC" as const,
  SENDER_DESC: "SENDER_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumLegacyProjectsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  V1_PROJECT_ID_ASC: "V1_PROJECT_ID_ASC" as const,
  V1_PROJECT_ID_DESC: "V1_PROJECT_ID_DESC" as const,
  V2_PROJECT_ID_ASC: "V2_PROJECT_ID_ASC" as const,
  V2_PROJECT_ID_DESC: "V2_PROJECT_ID_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumPendingProjectRolesOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  ROLE_ASC: "ROLE_ASC" as const,
  ROLE_DESC: "ROLE_DESC" as const,
  ADDRESS_ASC: "ADDRESS_ASC" as const,
  ADDRESS_DESC: "ADDRESS_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumPendingRoundRolesOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  ROLE_ASC: "ROLE_ASC" as const,
  ROLE_DESC: "ROLE_DESC" as const,
  ADDRESS_ASC: "ADDRESS_ASC" as const,
  ADDRESS_DESC: "ADDRESS_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumPricesOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  TOKEN_ADDRESS_ASC: "TOKEN_ADDRESS_ASC" as const,
  TOKEN_ADDRESS_DESC: "TOKEN_ADDRESS_DESC" as const,
  PRICE_IN_USD_ASC: "PRICE_IN_USD_ASC" as const,
  PRICE_IN_USD_DESC: "PRICE_IN_USD_DESC" as const,
  TIMESTAMP_ASC: "TIMESTAMP_ASC" as const,
  TIMESTAMP_DESC: "TIMESTAMP_DESC" as const,
  BLOCK_NUMBER_ASC: "BLOCK_NUMBER_ASC" as const,
  BLOCK_NUMBER_DESC: "BLOCK_NUMBER_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumProjectsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  NAME_ASC: "NAME_ASC" as const,
  NAME_DESC: "NAME_DESC" as const,
  NONCE_ASC: "NONCE_ASC" as const,
  NONCE_DESC: "NONCE_DESC" as const,
  ANCHOR_ADDRESS_ASC: "ANCHOR_ADDRESS_ASC" as const,
  ANCHOR_ADDRESS_DESC: "ANCHOR_ADDRESS_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  PROJECT_NUMBER_ASC: "PROJECT_NUMBER_ASC" as const,
  PROJECT_NUMBER_DESC: "PROJECT_NUMBER_DESC" as const,
  REGISTRY_ADDRESS_ASC: "REGISTRY_ADDRESS_ASC" as const,
  REGISTRY_ADDRESS_DESC: "REGISTRY_ADDRESS_DESC" as const,
  METADATA_CID_ASC: "METADATA_CID_ASC" as const,
  METADATA_CID_DESC: "METADATA_CID_DESC" as const,
  METADATA_ASC: "METADATA_ASC" as const,
  METADATA_DESC: "METADATA_DESC" as const,
  CREATED_BY_ADDRESS_ASC: "CREATED_BY_ADDRESS_ASC" as const,
  CREATED_BY_ADDRESS_DESC: "CREATED_BY_ADDRESS_DESC" as const,
  CREATED_AT_BLOCK_ASC: "CREATED_AT_BLOCK_ASC" as const,
  CREATED_AT_BLOCK_DESC: "CREATED_AT_BLOCK_DESC" as const,
  UPDATED_AT_BLOCK_ASC: "UPDATED_AT_BLOCK_ASC" as const,
  UPDATED_AT_BLOCK_DESC: "UPDATED_AT_BLOCK_DESC" as const,
  TAGS_ASC: "TAGS_ASC" as const,
  TAGS_DESC: "TAGS_DESC" as const,
  PROJECT_TYPE_ASC: "PROJECT_TYPE_ASC" as const,
  PROJECT_TYPE_DESC: "PROJECT_TYPE_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};

export const enumSubscriptionsOrderBy = {
  NATURAL: "NATURAL" as const,
  ID_ASC: "ID_ASC" as const,
  ID_DESC: "ID_DESC" as const,
  CHAIN_ID_ASC: "CHAIN_ID_ASC" as const,
  CHAIN_ID_DESC: "CHAIN_ID_DESC" as const,
  CONTRACT_NAME_ASC: "CONTRACT_NAME_ASC" as const,
  CONTRACT_NAME_DESC: "CONTRACT_NAME_DESC" as const,
  CONTRACT_ADDRESS_ASC: "CONTRACT_ADDRESS_ASC" as const,
  CONTRACT_ADDRESS_DESC: "CONTRACT_ADDRESS_DESC" as const,
  FROM_BLOCK_ASC: "FROM_BLOCK_ASC" as const,
  FROM_BLOCK_DESC: "FROM_BLOCK_DESC" as const,
  TO_BLOCK_ASC: "TO_BLOCK_ASC" as const,
  TO_BLOCK_DESC: "TO_BLOCK_DESC" as const,
  INDEXED_TO_BLOCK_ASC: "INDEXED_TO_BLOCK_ASC" as const,
  INDEXED_TO_BLOCK_DESC: "INDEXED_TO_BLOCK_DESC" as const,
  INDEXED_TO_LOG_INDEX_ASC: "INDEXED_TO_LOG_INDEX_ASC" as const,
  INDEXED_TO_LOG_INDEX_DESC: "INDEXED_TO_LOG_INDEX_DESC" as const,
  CREATED_AT_ASC: "CREATED_AT_ASC" as const,
  CREATED_AT_DESC: "CREATED_AT_DESC" as const,
  UPDATED_AT_ASC: "UPDATED_AT_ASC" as const,
  UPDATED_AT_DESC: "UPDATED_AT_DESC" as const,
  PRIMARY_KEY_ASC: "PRIMARY_KEY_ASC" as const,
  PRIMARY_KEY_DESC: "PRIMARY_KEY_DESC" as const,
};
