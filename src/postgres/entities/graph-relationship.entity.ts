import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { GraphNodeEntity } from "./graph-node.entity";

@Entity({ name: "graph_relationships" })
@Index(["sourceId", "type", "targetId"])
@Index(["targetId", "type", "sourceId"])
export class GraphRelationshipEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ name: "source_id", type: "bigint" })
  sourceId!: string;

  @Column({ name: "target_id", type: "bigint" })
  targetId!: string;

  @Column({ type: "text" })
  type!: string;

  @Column({ name: "relationship_key", type: "text", default: "" })
  relationshipKey!: string;

  @Column({ type: "jsonb", default: {} })
  properties!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => GraphNodeEntity, node => node.outgoingRelationships, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "source_id" })
  source!: GraphNodeEntity;

  @ManyToOne(() => GraphNodeEntity, node => node.incomingRelationships, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "target_id" })
  target!: GraphNodeEntity;
}
