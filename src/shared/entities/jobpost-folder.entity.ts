import { notStringOrNull } from "../helpers";
import { JobpostFolder } from "../interfaces";
import { JobListResultEntity } from "./job-list-result.entity";

export class JobpostFolderEntity {
  constructor(private readonly raw: JobpostFolder) {}

  getProperties(): JobpostFolder {
    return new JobpostFolder({
      id: notStringOrNull(this.raw?.id),
      name: notStringOrNull(this.raw?.name),
      isPublic: this.raw.isPublic ?? false,
      jobs: this.raw.jobs.map(x => new JobListResultEntity(x).getProperties()),
    });
  }
}
