import { PartialType } from "@nestjs/mapped-types";
import { CreateJobFolderInput } from "./create-job-folder.input";

export class UpdateJobFolderInput extends PartialType(CreateJobFolderInput) {}
