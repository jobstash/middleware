import { Test, TestingModule } from "@nestjs/testing";
import { HacksController } from "./hacks.controller";
import { HacksService } from "./hacks.service";

describe("HacksController", () => {
  let controller: HacksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HacksController],
      providers: [HacksService],
    }).compile();

    controller = module.get<HacksController>(HacksController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
