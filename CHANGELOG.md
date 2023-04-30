## [1.25.2](https://github.com/jobstash/middleware/compare/v1.25.1...v1.25.2) (2023-04-30)


### Bug Fixes

* **types:** fix types of repository entity ([47654f7](https://github.com/jobstash/middleware/commit/47654f7e34cc095c61d1df41cfce965addf32de5))

## [1.25.1](https://github.com/jobstash/middleware/compare/v1.25.0...v1.25.1) (2023-04-30)


### Bug Fixes

* **repository:** return props instead of raw entity ([c5a3c8c](https://github.com/jobstash/middleware/commit/c5a3c8cf231219f8283b9a617a6f2dd71eecaf36))

# [1.25.0](https://github.com/jobstash/middleware/compare/v1.24.2...v1.25.0) (2023-04-28)


### Features

* **orgs:** added org projects stats endpoint ([#72](https://github.com/jobstash/middleware/issues/72)) ([4d4bf55](https://github.com/jobstash/middleware/commit/4d4bf55649b4b18b585858c64620f6ba62e64b43))

## [1.24.2](https://github.com/jobstash/middleware/compare/v1.24.1...v1.24.2) (2023-04-28)


### Bug Fixes

* **returndata:** return some data for github auth so FE doesnt break ([a67886e](https://github.com/jobstash/middleware/commit/a67886e6611c6bb66eee5e93f436b4d18dfbd621))

## [1.24.1](https://github.com/jobstash/middleware/compare/v1.24.0...v1.24.1) (2023-04-28)


### Bug Fixes

* **githubsignup:** change role of user on successful github auth + validate inputs correctly ([d02d6c6](https://github.com/jobstash/middleware/commit/d02d6c631f665e845d61c37fc67155c1fb52d9e9))

# [1.24.0](https://github.com/jobstash/middleware/compare/v1.23.12...v1.24.0) (2023-04-27)


### Features

* **projects:** added impl for getting project competitors ([#71](https://github.com/jobstash/middleware/issues/71)) ([fc0dab6](https://github.com/jobstash/middleware/commit/fc0dab6c0990fc7870c45f3353b744169c485c5b))

## [1.23.12](https://github.com/jobstash/middleware/compare/v1.23.11...v1.23.12) (2023-04-27)


### Bug Fixes

* **jobs:** fixed seniority filter ([d4b612a](https://github.com/jobstash/middleware/commit/d4b612a1661b474e9f2370f760684eecb227a935))

## [1.23.11](https://github.com/jobstash/middleware/compare/v1.23.10...v1.23.11) (2023-04-27)


### Bug Fixes

* **jobs:** fixed borkage on jobs list ([2462f6f](https://github.com/jobstash/middleware/commit/2462f6f55ddb7d8e46b70066e01fbeefef99dc5c))

## [1.23.10](https://github.com/jobstash/middleware/compare/v1.23.9...v1.23.10) (2023-04-26)


### Bug Fixes

* **blocked:** calling correct method ([73c15b0](https://github.com/jobstash/middleware/commit/73c15b042e9b79079601543fec3d915a154b12e2))

## [1.23.9](https://github.com/jobstash/middleware/compare/v1.23.8...v1.23.9) (2023-04-26)


### Bug Fixes

* **blockedterms:** fix unsetting terms ([6dd0efa](https://github.com/jobstash/middleware/commit/6dd0efa5807df301fa8a54cd17a81761c7e98b07))

## [1.23.8](https://github.com/jobstash/middleware/compare/v1.23.7...v1.23.8) (2023-04-26)


### Bug Fixes

* **term blocking:** fix returned status ([bae500a](https://github.com/jobstash/middleware/commit/bae500a1bcc446ac6aa5a21e0d1be8d742243775))

## [1.23.7](https://github.com/jobstash/middleware/compare/v1.23.6...v1.23.7) (2023-04-26)


### Bug Fixes

* **interfaces:** change interfaces to handle api success correctly ([4218218](https://github.com/jobstash/middleware/commit/42182185266e2ffa516add92a44f4c90621196be))

## [1.23.6](https://github.com/jobstash/middleware/compare/v1.23.5...v1.23.6) (2023-04-26)


### Bug Fixes

* **logs:** add more logging ([6f66526](https://github.com/jobstash/middleware/commit/6f66526e6cf9ed73523b210bef2dbe48c109e9ce))

## [1.23.5](https://github.com/jobstash/middleware/compare/v1.23.4...v1.23.5) (2023-04-25)


### Bug Fixes

* **backend.service:** beefed up error handling a bit more ([#67](https://github.com/jobstash/middleware/issues/67)) ([50840e1](https://github.com/jobstash/middleware/commit/50840e1564ee713cc4f79d846e3c49e7d6c9f4c9))

## [1.23.4](https://github.com/jobstash/middleware/compare/v1.23.3...v1.23.4) (2023-04-25)


### Bug Fixes

* **blocked terms:** Unset blocked terms ([18f21df](https://github.com/jobstash/middleware/commit/18f21dffea7b992b6d948708d4b422469243c63e))

## [1.23.3](https://github.com/jobstash/middleware/compare/v1.23.2...v1.23.3) (2023-04-25)


### Bug Fixes

* **query:** fix get technologies query ([2570caf](https://github.com/jobstash/middleware/commit/2570caf67efda578851aa565c46fd203c5d6f2f6))

## [1.23.2](https://github.com/jobstash/middleware/compare/v1.23.1...v1.23.2) (2023-04-24)


### Bug Fixes

* **logging:** log the shit out of stuff ([3203719](https://github.com/jobstash/middleware/commit/3203719694bf7e69079b437534436200a50d1bdd))

## [1.23.1](https://github.com/jobstash/middleware/compare/v1.23.0...v1.23.1) (2023-04-19)


### Bug Fixes

* **jobs:** fixed 0 values not allowed for jobs list filters ([359f9d1](https://github.com/jobstash/middleware/commit/359f9d1e4986219af93e8b2659c0fd5c044596ba))

# [1.23.0](https://github.com/jobstash/middleware/compare/v1.22.1...v1.23.0) (2023-04-19)


### Features

* **technologies:** implemented create and get paired terms endpoints ([#64](https://github.com/jobstash/middleware/issues/64)) ([7852d1c](https://github.com/jobstash/middleware/commit/7852d1cf798107c9778b290e92bb68c6ff1e1361))

## [1.22.1](https://github.com/jobstash/middleware/compare/v1.22.0...v1.22.1) (2023-04-18)


### Bug Fixes

* **technlogies:** fixed a doc bug ([64b1869](https://github.com/jobstash/middleware/commit/64b1869c448c0691211381255a1c8cd453abf2c1))

# [1.22.0](https://github.com/jobstash/middleware/compare/v1.21.0...v1.22.0) (2023-04-18)


### Features

* **projects:** implemented get projects by category ([#63](https://github.com/jobstash/middleware/issues/63)) ([028529f](https://github.com/jobstash/middleware/commit/028529f5267d1b0ddcabc1437e764911c7f24b3d))

# [1.21.0](https://github.com/jobstash/middleware/compare/v1.20.0...v1.21.0) (2023-04-18)


### Features

* **technologies:** implemented get all preferred terms endpoint ([#59](https://github.com/jobstash/middleware/issues/59)) ([4fa1d57](https://github.com/jobstash/middleware/commit/4fa1d572019870ac0112a57ab50fc2f12b4b67bb))

# [1.20.0](https://github.com/jobstash/middleware/compare/v1.19.2...v1.20.0) (2023-04-13)


### Features

* **jobs:** add search by job title ([#57](https://github.com/jobstash/middleware/issues/57)) ([0a09c62](https://github.com/jobstash/middleware/commit/0a09c62840d4bbe680331293e27521cbd0c19c94))

## [1.19.2](https://github.com/RecruitersRip/middleware/compare/v1.19.1...v1.19.2) (2023-04-12)


### Bug Fixes

* **gitignore:** ignore certs ([c4daee2](https://github.com/RecruitersRip/middleware/commit/c4daee2fd3286cccf047417fcb591a8cf192943d))

## [1.19.1](https://github.com/RecruitersRip/middleware/compare/v1.19.0...v1.19.1) (2023-04-12)


### Bug Fixes

* **gitignore:** ignore certs ([b507194](https://github.com/RecruitersRip/middleware/commit/b507194e61e3c23b440936f570f5d46b42d6b831))

# [1.19.0](https://github.com/RecruitersRip/middleware/compare/v1.18.0...v1.19.0) (2023-04-12)


### Bug Fixes

* **auth:** add guards back ([73c7340](https://github.com/RecruitersRip/middleware/commit/73c73400c508a251ec0b0df33555e421a6789f41))
* **auth:** Fix rbac guard by implementing ironsession and string consts for roles ([3d0fb66](https://github.com/RecruitersRip/middleware/commit/3d0fb664e6ac5a3bb5f2ef792eabb4ce72f52a4d))
* **check-wallet:** separate roles and flows ([2c99591](https://github.com/RecruitersRip/middleware/commit/2c995919bdadd7280fadf301c24c82220f893a38))
* **checkwallet:** return live data instead of dummy data ([eb1bc4f](https://github.com/RecruitersRip/middleware/commit/eb1bc4f85092f7f0358be3b1ebc2fd69bb903e68))
* **config:** github oauth apps were incorrectly set ([0eb3fb1](https://github.com/RecruitersRip/middleware/commit/0eb3fb15f6b0b36a492aae4def05089740eee63c))
* **dataformat:** fix signatures of data ([22acbf7](https://github.com/RecruitersRip/middleware/commit/22acbf70b1ebef99f3ffdc5d0484bb7a0ee089f3))
* **dependencies:** clean up package.json a bit ([339a3ee](https://github.com/RecruitersRip/middleware/commit/339a3ee10f3ff0ede894984cc2b16f908ca52cc3))
* **docs:** update readme to include correct ssl instructions ([dad4c3f](https://github.com/RecruitersRip/middleware/commit/dad4c3f020f3462670488def489f32ffbcb36cec))
* **enums:** more magic strings removed ([9124869](https://github.com/RecruitersRip/middleware/commit/9124869147b4c46ffe8a6a0ca339916cdf06394b))
* **env:** change config ([3e235bb](https://github.com/RecruitersRip/middleware/commit/3e235bb015aab662eeb3287221a359902d43821a))
* **formatting:** parse json string ([a31e791](https://github.com/RecruitersRip/middleware/commit/a31e791b74466739997235bba0aaf8b977f573e6))
* **git:** ignore local certs ([50efadb](https://github.com/RecruitersRip/middleware/commit/50efadb0838ffeee202ab5aeb1ca4ae992e65dd9))
* **github:** Improving gitub login by adding roles ([fe90927](https://github.com/RecruitersRip/middleware/commit/fe90927f997ac5917f07a528be230530f4a5e774))
* **interfaces:** add new fields ([4837fcf](https://github.com/RecruitersRip/middleware/commit/4837fcfea4febdc9344d0c10241ed772d762fdfd))
* **ipfs:** Fix file uploader ([9154d21](https://github.com/RecruitersRip/middleware/commit/9154d21af409b429b9a78b7c05567f3bf45f7384))
* **ipfs:** fix ipfs uploading for projects ([b25de40](https://github.com/RecruitersRip/middleware/commit/b25de40cb83bcce78a457ea8a6d409bbdb6266b5))
* **job filters:** fixed issue with incorrect values for salary filters ([7b789a7](https://github.com/RecruitersRip/middleware/commit/7b789a7a53a36af7b441992b092d71f93be890fe))
* **jobs:** fixed filter bug for job list ([666ad86](https://github.com/RecruitersRip/middleware/commit/666ad8616f8b6c80a698930404fc5d4a290d49ee))
* **jobs:** fixed issue with techs not being returned ([2fbfce5](https://github.com/RecruitersRip/middleware/commit/2fbfce5037a9738e9400aac78ff5e6a93f7a6313))
* **jobs:** fixed more filter issues ([313f980](https://github.com/RecruitersRip/middleware/commit/313f9802ea97f76f5912dc4dde24334f690aabe2))
* **org creation:** fix issue with creation checking for wrong success code ([873e541](https://github.com/RecruitersRip/middleware/commit/873e5411208af0a48491ec3f094541aac27d37c6))
* github-login role uppercase, tokenData destructure ([b4c8835](https://github.com/RecruitersRip/middleware/commit/b4c88351948992660a563e1f78fcdbdb5a2a80bb))
* **query:** fix chain query to be semantically correct ([026792a](https://github.com/RecruitersRip/middleware/commit/026792ab1c925acb879098c73a1e449409d1f90d))
* **siwe:** add default flow for admin ([ccfd8db](https://github.com/RecruitersRip/middleware/commit/ccfd8db808363807cd7ce93af4ce3609231d616c))
* **SIWE:** pick-role flow should be anon not dev ([1fc8501](https://github.com/RecruitersRip/middleware/commit/1fc8501aa8d40accaa5f2775eba37c0c1a985284))


### Features

* **admin:** added get all organizations endpoint ([#51](https://github.com/RecruitersRip/middleware/issues/51)) ([0d01afd](https://github.com/RecruitersRip/middleware/commit/0d01afda7236f675d39ba1a41acdb3de0389c184))
* **api:** implemented get org details endpoint ([c013b24](https://github.com/RecruitersRip/middleware/commit/c013b24045f9669c76ced374e41cb629b29cdeab))
* **api:** implemented get org details endpoint ([#53](https://github.com/RecruitersRip/middleware/issues/53)) ([e295470](https://github.com/RecruitersRip/middleware/commit/e295470cd56d5670664029e9f48d72408f1be5e8))
* **godmode:** implemented create orgs endpoint ([#55](https://github.com/RecruitersRip/middleware/issues/55)) ([43c8f43](https://github.com/RecruitersRip/middleware/commit/43c8f43d8e9c140aca60019c22967d0528f7aef5))
* **godmode:** implemented the following functionality ([a09716e](https://github.com/RecruitersRip/middleware/commit/a09716e14751d939984a0ea9aedd0b255ed9ea9e))
* **godmode:** implemented update organization endpoint ([#56](https://github.com/RecruitersRip/middleware/issues/56)) ([4bc6b59](https://github.com/RecruitersRip/middleware/commit/4bc6b5984d6d6a303f5d7f509f65b0d8bbf74e78))
* **organizations:** implemented search orgs ([#52](https://github.com/RecruitersRip/middleware/issues/52)) ([8a5894f](https://github.com/RecruitersRip/middleware/commit/8a5894f458d724dc414aad529cb0366d98549044))
* **orgs:** implemented org logo upload endpoint ([93531e1](https://github.com/RecruitersRip/middleware/commit/93531e128656590c76761859c3f18691edd278d1))
* **SIWE:** RESOLVES RIP-289 ([#50](https://github.com/RecruitersRip/middleware/issues/50)) ([30160c1](https://github.com/RecruitersRip/middleware/commit/30160c15aa0347b8c0ba9ec82215cda75407c9df))
* **technologies:** updated infra to support new relationships on technologies ([cf782b3](https://github.com/RecruitersRip/middleware/commit/cf782b37f8e38ecdc7b788406b64c94e828a0661))

# [1.18.0](https://github.com/RecruitersRip/middleware/compare/v1.17.6...v1.18.0) (2023-03-20)


### Features

* **admin:** implemented get all technologies endpoint ([#49](https://github.com/RecruitersRip/middleware/issues/49)) ([5f1e7b7](https://github.com/RecruitersRip/middleware/commit/5f1e7b7f677a5fe84e302c3d43d30d0bb92c655e))

## [1.17.6](https://github.com/RecruitersRip/middleware/compare/v1.17.5...v1.17.6) (2023-03-20)


### Bug Fixes

* **siwe:** add admin wallets ([ce78d97](https://github.com/RecruitersRip/middleware/commit/ce78d97dc3c8ea258c94a517a1d16510828e1723))

## [1.17.5](https://github.com/RecruitersRip/middleware/compare/v1.17.4...v1.17.5) (2023-03-20)


### Bug Fixes

* **siwe:** fix checkwallet endpint ([dafbd41](https://github.com/RecruitersRip/middleware/commit/dafbd41db411cd099914bcecee7af3ced7d07af3))

## [1.17.4](https://github.com/RecruitersRip/middleware/compare/v1.17.3...v1.17.4) (2023-03-20)


### Bug Fixes

* **siwe:** add role to session and return from session endpoint ([84616e7](https://github.com/RecruitersRip/middleware/commit/84616e719c2283eea6ca7e1527540b08676c7e94))

## [1.17.3](https://github.com/RecruitersRip/middleware/compare/v1.17.2...v1.17.3) (2023-03-20)


### Bug Fixes

* **siwe:** switch from post to get and change url ([c527ac0](https://github.com/RecruitersRip/middleware/commit/c527ac0ef2ec5d2888ab896305b7711585022a2e))

## [1.17.2](https://github.com/RecruitersRip/middleware/compare/v1.17.1...v1.17.2) (2023-03-20)


### Bug Fixes

* **git:** unignore vscode folder and add debug launch configuration ([54f2586](https://github.com/RecruitersRip/middleware/commit/54f258643c7e4185e3490431fb27cde834285c0e))

## [1.17.1](https://github.com/RecruitersRip/middleware/compare/v1.17.0...v1.17.1) (2023-03-20)


### Bug Fixes

* **siwe:** return data via res and not simply via return ([e28be2c](https://github.com/RecruitersRip/middleware/commit/e28be2c5b1ff39cd74b11ac13c7888732acb58cc))

# [1.17.0](https://github.com/RecruitersRip/middleware/compare/v1.16.0...v1.17.0) (2023-03-20)


### Features

* **SIWE:** implemented check wallet endpoint ([#48](https://github.com/RecruitersRip/middleware/issues/48)) ([fff147c](https://github.com/RecruitersRip/middleware/commit/fff147c502abbf24b748771412a76996ffe5e65c))
