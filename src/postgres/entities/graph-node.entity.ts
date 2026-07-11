import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { GraphRelationshipEntity } from "./graph-relationship.entity";

@Entity({ name: "graph_nodes" })
@Index(["label", "nodeKey"], { unique: true })
export class GraphNodeEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "text" })
  label!: string;

  @Column({ type: "text", array: true, default: "{}" })
  labels!: string[];

  @Column({ name: "node_key", type: "text" })
  nodeKey!: string;

  @Column({ type: "jsonb", default: {} })
  properties!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => GraphRelationshipEntity, edge => edge.source)
  outgoingRelationships!: GraphRelationshipEntity[];

  @OneToMany(() => GraphRelationshipEntity, edge => edge.target)
  incomingRelationships!: GraphRelationshipEntity[];
}
