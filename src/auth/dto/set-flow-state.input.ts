import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsIn, IsString } from "class-validator";

import { CheckWalletFlows } from "src/shared/enums/check-wallet-result.enum";

export class SetFlowStateInput {
  @ApiProperty()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  @IsIn([
    CheckWalletFlows.ADD_GITHUB_REPO,
    CheckWalletFlows.ONBOARD_REPO,
    CheckWalletFlows.ONBOARD_REVIEWS,
    CheckWalletFlows.SIGNUP_COMPLETE,
  ])
  flow: string;
}
