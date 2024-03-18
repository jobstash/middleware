## [2.10.1](https://github.com/jobstash/middleware/compare/v2.10.0...v2.10.1) (2024-03-18)


### Bug Fixes

* **jobs:** fixed bugs on update org job applicant list ([05c75e4](https://github.com/jobstash/middleware/commit/05c75e4d5ce7cbbc8dfdc352d68e0bc90d251663))

# [2.10.0](https://github.com/jobstash/middleware/compare/v2.9.0...v2.10.0) (2024-03-14)


### Features

* **jobs:** added support for sub list filtering and updating on job applicants list ([77282c8](https://github.com/jobstash/middleware/commit/77282c8e91da0ecb384ee16009a104904a31046d))

# [2.9.0](https://github.com/jobstash/middleware/compare/v2.8.0...v2.9.0) (2024-03-14)


### Bug Fixes

* **jobs:** fixed bug on org jobs with applicants endpoint ([356ab22](https://github.com/jobstash/middleware/commit/356ab22ed8d593dd9866e1c6209e8e9ac9c88966))


### Features

* **ecosystems:** add header for ecosystems ([08f3730](https://github.com/jobstash/middleware/commit/08f3730352bac2f40f3ecf447cfaaef1a6ba370e))

## [2.8.1](https://github.com/jobstash/middleware/compare/v2.8.0...v2.8.1) (2024-03-13)


### Bug Fixes

* **jobs:** fixed bug on org jobs with applicants endpoint ([356ab22](https://github.com/jobstash/middleware/commit/356ab22ed8d593dd9866e1c6209e8e9ac9c88966))

# [2.8.0](https://github.com/jobstash/middleware/compare/v2.7.0...v2.8.0) (2024-03-12)


### Features

* **jobs:** implemented user job folders feature ([ecb11e0](https://github.com/jobstash/middleware/commit/ecb11e0d9b0db900c3986fb651ce6eb01af5666a))

# [2.7.0](https://github.com/jobstash/middleware/compare/v2.6.0...v2.7.0) (2024-03-11)


### Features

* **jobs:** implemented user job folders feature wip ([45dde52](https://github.com/jobstash/middleware/commit/45dde5252059407773e83126e651517b84c7d9c6))

# [2.6.0](https://github.com/jobstash/middleware/compare/v2.5.0...v2.6.0) (2024-03-08)


### Features

* **organizations:** implemented update org alias endpoint and set ecosystem header to check for normalized values ([4b77b8d](https://github.com/jobstash/middleware/commit/4b77b8de8787173715162920e80a05960191eeaf))

# [2.5.0](https://github.com/jobstash/middleware/compare/v2.4.0...v2.5.0) (2024-03-07)


### Features

* **tags:** implemented get popular tags endpoint ([b85f413](https://github.com/jobstash/middleware/commit/b85f413b5615cfd9ed62bcb5fed28eab8c88addb))

# [2.4.0](https://github.com/jobstash/middleware/compare/v2.3.0...v2.4.0) (2024-03-07)


### Features

* **projects:** added ecosystem support for projects ([7d6b925](https://github.com/jobstash/middleware/commit/7d6b925ddf8980aff441ee293045b2add21d80de))

# [2.3.0](https://github.com/jobstash/middleware/compare/v2.2.0...v2.3.0) (2024-03-07)


### Features

* **organizations:** added ecosystem support for organization endpoints ([481a97d](https://github.com/jobstash/middleware/commit/481a97d5b476422210679ded3361254b00be654b))

# [2.2.0](https://github.com/jobstash/middleware/compare/v2.1.0...v2.2.0) (2024-03-07)


### Features

* **tags:** added ecosystem support for tags ([13419ec](https://github.com/jobstash/middleware/commit/13419ec54866352ed5d459206f18b3aa2dc09cbb))

# [2.1.0](https://github.com/jobstash/middleware/compare/v2.0.4...v2.1.0) (2024-03-06)


### Features

* **jobs:** added ecosystem filtering for jobs endpoints ([10666f1](https://github.com/jobstash/middleware/commit/10666f154141d097672ccad9b67f5475aceb34ef))

## [2.0.4](https://github.com/jobstash/middleware/compare/v2.0.3...v2.0.4) (2024-03-06)


### Bug Fixes

* **users:** flipped repo.description to nullable field ([5ed4686](https://github.com/jobstash/middleware/commit/5ed4686e9d139646fa890d6eb9b348f644641358))

## [2.0.3](https://github.com/jobstash/middleware/compare/v2.0.2...v2.0.3) (2024-03-05)


### Bug Fixes

* **users:** fixed bug with org profile flows ([793cc65](https://github.com/jobstash/middleware/commit/793cc6580e0f74002172d7c7bcead179096d0e7f))

## [2.0.2](https://github.com/jobstash/middleware/compare/v2.0.1...v2.0.2) (2024-02-29)


### Bug Fixes

* **report:** fixed url validation to be based on ALLOWED ORIGINS env ([9de56ef](https://github.com/jobstash/middleware/commit/9de56ef85008b8bd22a8eba73a11748f45fbcad5))

## [2.0.1](https://github.com/jobstash/middleware/compare/v2.0.0...v2.0.1) (2024-02-29)


### Bug Fixes

* **profile:** fixed lame copypasta bug ([90e0588](https://github.com/jobstash/middleware/commit/90e0588a376f6113df7872cc9c702d0b70a79741))

# [2.0.0](https://github.com/jobstash/middleware/compare/v1.79.0...v2.0.0) (2024-02-28)


### Features

* **users:** separated profile interfaces for org and dev users ([82da55f](https://github.com/jobstash/middleware/commit/82da55f907569db843656bb6a1c35ce3ad8c1b83))


### BREAKING CHANGES

* **users:** GET /magic/org/login/callback - now returns the new org user profile interface
GET /profile/info -> /profile/{dev|org}/info and the org version returns the new org user profile interface
POST /profile/info -> /profile/{dev|org}/info and the org version takes a different body see src/auth/profile/dto/update-org-profile.input.ts for the shape
GET /users/orgs/{pending|approved} these now return the new org user profile interface

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-28)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **organizations:** fixed cypher bug with upsert org alias endpoint ([c18b16f](https://github.com/jobstash/middleware/commit/c18b16fc92f895e5a626f852f00222fe5282723e))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **profile:** added org role to RBAC allowed roles for delete account ([7cb214c](https://github.com/jobstash/middleware/commit/7cb214c82493ae363da0cfeda4ef7f7149a37cf6))
* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint for orgs to retrieve active job applicants on job posts ([3f89aa6](https://github.com/jobstash/middleware/commit/3f89aa68a86f1ea5d7ee4d1f39b03b21ebee6e96))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))
* **users:** implemented endpoint to retrieve dev users with available for work set to true ([7ce53d2](https://github.com/jobstash/middleware/commit/7ce53d2b5e1f45e7cd936a522efddf72dc452f64))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-28)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **profile:** added org role to RBAC allowed roles for delete account ([7cb214c](https://github.com/jobstash/middleware/commit/7cb214c82493ae363da0cfeda4ef7f7149a37cf6))
* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint for orgs to retrieve active job applicants on job posts ([3f89aa6](https://github.com/jobstash/middleware/commit/3f89aa68a86f1ea5d7ee4d1f39b03b21ebee6e96))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))
* **users:** implemented endpoint to retrieve dev users with available for work set to true ([7ce53d2](https://github.com/jobstash/middleware/commit/7ce53d2b5e1f45e7cd936a522efddf72dc452f64))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-27)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **profile:** added org role to RBAC allowed roles for delete account ([7cb214c](https://github.com/jobstash/middleware/commit/7cb214c82493ae363da0cfeda4ef7f7149a37cf6))
* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint for orgs to retrieve active job applicants on job posts ([3f89aa6](https://github.com/jobstash/middleware/commit/3f89aa68a86f1ea5d7ee4d1f39b03b21ebee6e96))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))
* **users:** implemented endpoint to retrieve dev users with available for work set to true ([7ce53d2](https://github.com/jobstash/middleware/commit/7ce53d2b5e1f45e7cd936a522efddf72dc452f64))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-27)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint for orgs to retrieve active job applicants on job posts ([3f89aa6](https://github.com/jobstash/middleware/commit/3f89aa68a86f1ea5d7ee4d1f39b03b21ebee6e96))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))
* **users:** implemented endpoint to retrieve dev users with available for work set to true ([7ce53d2](https://github.com/jobstash/middleware/commit/7ce53d2b5e1f45e7cd936a522efddf72dc452f64))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-27)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-26)


### Bug Fixes

* **filters:** refactored date calculation for this week job date filter ([3f00d15](https://github.com/jobstash/middleware/commit/3f00d155597e6e94c2646e3d785dda32174d3373))
* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-26)


### Bug Fixes

* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))
* **users:** temporarily disabled email step in org approval process for github signups ([e13038b](https://github.com/jobstash/middleware/commit/e13038b39db3434807aa68b57a427c4d3dc84e51))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-26)


### Bug Fixes

* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **github:** added support for org github signup ([38a59df](https://github.com/jobstash/middleware/commit/38a59dfdf12e65e3bb8c4a13890ff8d977173caf))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-24)


### Bug Fixes

* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-23)


### Bug Fixes

* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed bugs on update job metadata endpoint ([be38c9e](https://github.com/jobstash/middleware/commit/be38c9e6e8131ef10b810fdd560118d0b03a17fe))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* fixed neogma misunderstandingssss ([c21d04c](https://github.com/jobstash/middleware/commit/c21d04cfed8187c6c0b2687af8e6defe8e427b96))
* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** fixed neogma misunderstanding ([4afa5e8](https://github.com/jobstash/middleware/commit/4afa5e8293d36689ff932dae101b02edc802175d))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed bug that made jobs dissappear on update ([08e587d](https://github.com/jobstash/middleware/commit/08e587dee7649b5dbb1d29ab0db12ea0e3594242))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **jobs:** refactored update jobs endpoint to match FE interface ([6e29aa1](https://github.com/jobstash/middleware/commit/6e29aa14ce288190cdd97d3768c282cd9519ccc4))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-22)


### Bug Fixes

* **jobs:** fixed bug in update jobs endpoint ([78d36eb](https://github.com/jobstash/middleware/commit/78d36eb330f234ed1f46ea3c09b6125bdf369d1b))
* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-21)


### Bug Fixes

* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-21)


### Bug Fixes

* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** added get approved orgs endpoint ([80b3879](https://github.com/jobstash/middleware/commit/80b387967292a4c58d8b4324615976a6d6de3633))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-21)


### Bug Fixes

* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))
* **magic:** fixed bugs with magic link sign up experience ([af1336d](https://github.com/jobstash/middleware/commit/af1336dafacc87f469137d502a8d7a5997a9a4f2))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-20)


### Bug Fixes

* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))


### Features

* **tags:** implemented tag matching endpoint ([b1d0d98](https://github.com/jobstash/middleware/commit/b1d0d988e12db571c0842fd051256915abec9d66))
* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-20)


### Bug Fixes

* **jobs:** fixed filter bug in salary currency ([8baae2f](https://github.com/jobstash/middleware/commit/8baae2f46dedb42f2eb5461b17e728928a98fcc1))


### Features

* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-20)


### Features

* **users:** implemented authorize org application endpoint ([d0ced23](https://github.com/jobstash/middleware/commit/d0ced23e5d8a13f827813e5265d95d70684897da))
* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

# [1.79.0](https://github.com/jobstash/middleware/compare/v1.78.1...v1.79.0) (2024-02-20)


### Features

* **users:** implemented endpoint to get org users awaiting approval ([512e199](https://github.com/jobstash/middleware/commit/512e19988c249aa6c3a41b11d5856050084f851c))

## [1.78.1](https://github.com/jobstash/middleware/compare/v1.78.0...v1.78.1) (2024-02-19)


### Bug Fixes

* **filters:** fixed bug with skills filter ([57ae425](https://github.com/jobstash/middleware/commit/57ae4250769bd9cb9afb37fb30e4f25647b1e584))

# [1.78.0](https://github.com/jobstash/middleware/compare/v1.77.1...v1.78.0) (2024-02-19)


### Features

* **orgs:** updated magic login spec for orgs and implemented godmode endpoint for org approval ([bc0f1a2](https://github.com/jobstash/middleware/commit/bc0f1a2845927bcecf72fe50b580021f92f15ab4))
* **tags:** added skills filter and added support for popular tags ([5e6c827](https://github.com/jobstash/middleware/commit/5e6c8279eaac41dcd58a0cbabda8e8d465c1fe83))

## [1.77.1](https://github.com/jobstash/middleware/compare/v1.77.0...v1.77.1) (2024-02-19)


### Bug Fixes

* **filters:** fixed bug on filter configs ([adb69e4](https://github.com/jobstash/middleware/commit/adb69e4fdcf8dc68bc31e9998fd1be86aa87aa63))

# [1.77.0](https://github.com/jobstash/middleware/compare/v1.76.2...v1.77.0) (2024-02-19)


### Features

* **magic:** updated magic auth services to support both org and dev signup ([6d85f21](https://github.com/jobstash/middleware/commit/6d85f219baf804da31e940e92cf4fac2985975f7))

## [1.76.2](https://github.com/jobstash/middleware/compare/v1.76.1...v1.76.2) (2024-02-19)


### Bug Fixes

* **siwe:** switched to infura provider for siwe and yeeted deprecated validate fn ([4055fdc](https://github.com/jobstash/middleware/commit/4055fdcc4a1e55a94c226bf8fd8d400d44eab3c9))

## [1.76.1](https://github.com/jobstash/middleware/compare/v1.76.0...v1.76.1) (2024-02-19)


### Bug Fixes

* **jobs:** fixed currency restrictions for salary filters ([015c027](https://github.com/jobstash/middleware/commit/015c027e97649fb8522a2cc4da1533b4b745272e))

# [1.76.0](https://github.com/jobstash/middleware/compare/v1.75.2...v1.76.0) (2024-02-08)


### Features

* **orgs:** added godmode feature to add/create aliases to orgs ([bb5d097](https://github.com/jobstash/middleware/commit/bb5d0973c885338d386a29352177f8eaef0eb9df))

## [1.75.2](https://github.com/jobstash/middleware/compare/v1.75.1...v1.75.2) (2024-02-07)


### Bug Fixes

* **profile:** added description to email body and pretty printing for json context ([6febc72](https://github.com/jobstash/middleware/commit/6febc72316d48bef4b99e832d3cf87851db4291f))

## [1.75.1](https://github.com/jobstash/middleware/compare/v1.75.0...v1.75.1) (2024-02-07)


### Bug Fixes

* **jobs:** fixed issue with sorting jobs pre or post feature duration ([b4b4738](https://github.com/jobstash/middleware/commit/b4b4738f9287c4bb0bd7308a154cb7e03be94d89))

# [1.75.0](https://github.com/jobstash/middleware/compare/v1.74.0...v1.75.0) (2024-02-07)


### Features

* **report:** updated report endpoint to extract user info from session ([372ff99](https://github.com/jobstash/middleware/commit/372ff9994c28fa0b16065bcd19ba4f8f0c35b9d6))

# [1.74.0](https://github.com/jobstash/middleware/compare/v1.73.0...v1.74.0) (2024-02-06)


### Bug Fixes

* fixed featured dates parsing error ([1af153b](https://github.com/jobstash/middleware/commit/1af153b385fd9b11b4667a8613aede48cf2e22a4))
* **orgs:** fixed null bug on org details endpoint ([f1b3407](https://github.com/jobstash/middleware/commit/f1b340768314316925b26b5257827ae81c57641c))
* **orgs:** fixed undefined bug on get org details endpoint ([f75bd03](https://github.com/jobstash/middleware/commit/f75bd03c5a696ee5cea7f7019c1622963ca499e7))


### Features

* **report:** extended report endpoint to support broad spectrum reporting ([a234cb8](https://github.com/jobstash/middleware/commit/a234cb8af87eaa2adb7c8315ecca7297bbd66bf5))

## [1.73.1](https://github.com/jobstash/middleware/compare/v1.73.0...v1.73.1) (2024-02-03)


### Bug Fixes

* fixed featured dates parsing error ([1af153b](https://github.com/jobstash/middleware/commit/1af153b385fd9b11b4667a8613aede48cf2e22a4))

# [1.73.0](https://github.com/jobstash/middleware/compare/v1.72.0...v1.73.0) (2024-02-02)


### Features

* **jobs:** added preferential sorting for featured jobs and featured status automation ([ff7c1ff](https://github.com/jobstash/middleware/commit/ff7c1ff71101f24a5463534a744b3fa1907d462d))

# [1.72.0](https://github.com/jobstash/middleware/compare/v1.71.0...v1.72.0) (2024-02-02)


### Features

* **orgs:** added community support ([100b5cd](https://github.com/jobstash/middleware/commit/100b5cdbac76e9f26a3c0ab0fc25a1af12b0abfa))

# [1.71.0](https://github.com/jobstash/middleware/compare/v1.70.7...v1.71.0) (2024-02-01)


### Features

* **jobs:** added support for featured jobs ([d1b24d4](https://github.com/jobstash/middleware/commit/d1b24d43b61ae8eee2c99fecaf3735e35049ba43))

## [1.70.7](https://github.com/jobstash/middleware/compare/v1.70.6...v1.70.7) (2024-01-31)


### Bug Fixes

* **user:** restricted email validation to verified emails ([4e01bc8](https://github.com/jobstash/middleware/commit/4e01bc897d1134bed397223468698e2bf709178a))

## [1.70.6](https://github.com/jobstash/middleware/compare/v1.70.5...v1.70.6) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
* fixed dumb bug ([3dcc8b9](https://github.com/jobstash/middleware/commit/3dcc8b971c3fd63f46fdee6f6446796afeb1838d))
* fixed null pointer bug on user profile ([1b45d39](https://github.com/jobstash/middleware/commit/1b45d398e0dc45b6f64f3a3f56bb7b4b3be73578))
* fixed query bug on delete profile endpoint ([a5f34a5](https://github.com/jobstash/middleware/commit/a5f34a518911705a09942e94a5c2d45b182b4206))
* **user:** zapped the last of the user profile node references ([88eb430](https://github.com/jobstash/middleware/commit/88eb430913c579394e9737755d61dc11cf5c9a6c))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-30)


### Bug Fixes

<<<<<<< HEAD
* fixed null pointer bug on user profile ([e004d27](https://github.com/jobstash/middleware/commit/e004d277878a7cabe6fead4049adb8a6af16ec99))

## [1.70.4](https://github.com/jobstash/middleware/compare/v1.70.3...v1.70.4) (2024-01-30)


### Bug Fixes

* **user:** zapped the last of the user profile node references ([e9f1e8d](https://github.com/jobstash/middleware/commit/e9f1e8ddfff3d49ff1d937d15dd21e6f5c7fd4cc))

## [1.70.3](https://github.com/jobstash/middleware/compare/v1.70.2...v1.70.3) (2024-01-30)


### Bug Fixes

* fixed dumb bug ([67318d7](https://github.com/jobstash/middleware/commit/67318d7b00247a35d758a79efc62807f0c77a1b2))

## [1.70.2](https://github.com/jobstash/middleware/compare/v1.70.1...v1.70.2) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([4ca3aef](https://github.com/jobstash/middleware/commit/4ca3aef838719482daa2686c55b22f2b416cd674))

## [1.70.1](https://github.com/jobstash/middleware/compare/v1.70.0...v1.70.1) (2024-01-30)


### Bug Fixes

* bug fix for nullable reviews ([84a138b](https://github.com/jobstash/middleware/commit/84a138b4dc8207ab36597f5da8f71699598e74f7))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-26)
=======
* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
* fixed dumb bug ([3dcc8b9](https://github.com/jobstash/middleware/commit/3dcc8b971c3fd63f46fdee6f6446796afeb1838d))
* fixed null pointer bug on user profile ([1b45d39](https://github.com/jobstash/middleware/commit/1b45d398e0dc45b6f64f3a3f56bb7b4b3be73578))
* fixed query bug on delete profile endpoint ([a5f34a5](https://github.com/jobstash/middleware/commit/a5f34a518911705a09942e94a5c2d45b182b4206))
* **user:** zapped the last of the user profile node references ([88eb430](https://github.com/jobstash/middleware/commit/88eb430913c579394e9737755d61dc11cf5c9a6c))


### Features

* **projects:** implemented investors filter for projects list ([2b4f247](https://github.com/jobstash/middleware/commit/2b4f2472463031bb8bd4d7e17c4b60b21a5325dc))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
* fixed dumb bug ([3dcc8b9](https://github.com/jobstash/middleware/commit/3dcc8b971c3fd63f46fdee6f6446796afeb1838d))
* fixed query bug on delete profile endpoint ([a5f34a5](https://github.com/jobstash/middleware/commit/a5f34a518911705a09942e94a5c2d45b182b4206))
* **user:** zapped the last of the user profile node references ([88eb430](https://github.com/jobstash/middleware/commit/88eb430913c579394e9737755d61dc11cf5c9a6c))


### Features

* **projects:** implemented investors filter for projects list ([2b4f247](https://github.com/jobstash/middleware/commit/2b4f2472463031bb8bd4d7e17c4b60b21a5325dc))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
* fixed dumb bug ([3dcc8b9](https://github.com/jobstash/middleware/commit/3dcc8b971c3fd63f46fdee6f6446796afeb1838d))
* **user:** zapped the last of the user profile node references ([88eb430](https://github.com/jobstash/middleware/commit/88eb430913c579394e9737755d61dc11cf5c9a6c))


### Features

* **projects:** implemented investors filter for projects list ([2b4f247](https://github.com/jobstash/middleware/commit/2b4f2472463031bb8bd4d7e17c4b60b21a5325dc))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
* fixed dumb bug ([3dcc8b9](https://github.com/jobstash/middleware/commit/3dcc8b971c3fd63f46fdee6f6446796afeb1838d))


### Features

* **projects:** implemented investors filter for projects list ([2b4f247](https://github.com/jobstash/middleware/commit/2b4f2472463031bb8bd4d7e17c4b60b21a5325dc))

# [1.70.0](https://github.com/jobstash/middleware/compare/v1.69.2...v1.70.0) (2024-01-30)


### Bug Fixes

* **auth:** fixed bug that causes request hanging on the magic auth endpoint ([93a2069](https://github.com/jobstash/middleware/commit/93a20693786dd737bd2875c0eca6201530494030))
* bug fix for nullable reviews ([cf677ba](https://github.com/jobstash/middleware/commit/cf677ba0a2c80914bbea91dc117ed424a991c7c6))
>>>>>>> prod


### Features

* **projects:** implemented investors filter for projects list ([2b4f247](https://github.com/jobstash/middleware/commit/2b4f2472463031bb8bd4d7e17c4b60b21a5325dc))

## [1.69.2](https://github.com/jobstash/middleware/compare/v1.69.1...v1.69.2) (2024-01-26)


### Bug Fixes

* fixed bugs on boolean filters on project, jobs and orgs list endpoints ([7d09f5d](https://github.com/jobstash/middleware/commit/7d09f5deebda98830df500783f2bbdb6d473b9e8))

## [1.69.1](https://github.com/jobstash/middleware/compare/v1.69.0...v1.69.1) (2024-01-26)


### Bug Fixes

* **organizations:** fixed organizations filter config bug ([dcfe2cd](https://github.com/jobstash/middleware/commit/dcfe2cd9973bdda5f48df4ccd49974c5498d675f))

# [1.69.0](https://github.com/jobstash/middleware/compare/v1.68.6...v1.69.0) (2024-01-26)


### Features

* **profile:** added report review feature ([c8498fc](https://github.com/jobstash/middleware/commit/c8498fc83c92c6af6e95122ca8c9cb3f0a0eb769))

## [1.68.6](https://github.com/jobstash/middleware/compare/v1.68.5...v1.68.6) (2024-01-25)


### Bug Fixes

* **user:** added check to ensure no two users have the same email ([7a4443e](https://github.com/jobstash/middleware/commit/7a4443e0c97913619e1e8c37e2bacf0b5b1c273e))

## [1.68.5](https://github.com/jobstash/middleware/compare/v1.68.4...v1.68.5) (2024-01-23)


### Bug Fixes

* fixed integration and service level bugs ([15002ab](https://github.com/jobstash/middleware/commit/15002abb33b332c77c68b6033d23cb66c83912a9))
* **user:** fixed bugs and reformed the user service and added tests for all crucial user service calls ([ad0621e](https://github.com/jobstash/middleware/commit/ad0621ebc2fad8ab5db885174dbf169f1306ebc7))

## [1.68.4](https://github.com/jobstash/middleware/compare/v1.68.3...v1.68.4) (2024-01-19)


### Bug Fixes

* **profile:** fixed bugs with creating user profiles on siwe ([a51c928](https://github.com/jobstash/middleware/commit/a51c928da8cbc7bc99759ebaac5bf27b59ba1ea6))

## [1.68.3](https://github.com/jobstash/middleware/compare/v1.68.2...v1.68.3) (2024-01-18)


### Bug Fixes

* **login:** revert last change ([47ac7a8](https://github.com/jobstash/middleware/commit/47ac7a8e3fbcaa916687804ab0d6b2695069cadf))

## [1.68.2](https://github.com/jobstash/middleware/compare/v1.68.1...v1.68.2) (2024-01-18)


### Bug Fixes

* **signup:** Fix signup flow ([caecdf3](https://github.com/jobstash/middleware/commit/caecdf34fa1e15af2af18bed8750cdcabaac80fe))

## [1.68.1](https://github.com/jobstash/middleware/compare/v1.68.0...v1.68.1) (2024-01-10)


### Bug Fixes

* disabled chains filter ([d4c888d](https://github.com/jobstash/middleware/commit/d4c888d14edb231c8672176db7bc809e4317ca63))

# [1.68.0](https://github.com/jobstash/middleware/compare/v1.67.1...v1.68.0) (2024-01-09)


### Features

* **jobs:** added support for filtering jobs by commitment ([65078ab](https://github.com/jobstash/middleware/commit/65078ab66bdb3e984cdad79550202b8590baf033))

## [1.67.1](https://github.com/jobstash/middleware/compare/v1.67.0...v1.67.1) (2024-01-09)


### Bug Fixes

* fixed org ordering and added sort by name option ([83a928f](https://github.com/jobstash/middleware/commit/83a928f99e1b2ea7acdcba7b1260f9dcdd832c86))

# [1.67.0](https://github.com/jobstash/middleware/compare/v1.66.9...v1.67.0) (2024-01-08)


### Features

* **profile:** added support for location on user profile ([b4109a0](https://github.com/jobstash/middleware/commit/b4109a0c5bca9d6fb883d4bc57f04d7e02b72f2e))

## [1.66.9](https://github.com/jobstash/middleware/compare/v1.66.8...v1.66.9) (2024-01-08)


### Bug Fixes

* **profile:** fixed weirdness with profile skills and repo tags used ([392aa89](https://github.com/jobstash/middleware/commit/392aa8970153abab494222e677d60e4a6f65fc6b))

## [1.66.8](https://github.com/jobstash/middleware/compare/v1.66.7...v1.66.8) (2023-12-22)


### Bug Fixes

* **profile:** set user repo skills used lookup to only find skills added by that user ([0256789](https://github.com/jobstash/middleware/commit/0256789d0e5142eb2ef7ea58d948e6c9a887dbd8))

## [1.66.7](https://github.com/jobstash/middleware/compare/v1.66.6...v1.66.7) (2023-12-22)


### Bug Fixes

* **filters:** fixed issues with sorting on orgs and projects lists ([613eba4](https://github.com/jobstash/middleware/commit/613eba4b15d2cb3b3e86233140fe9732a16a8658))

## [1.66.6](https://github.com/jobstash/middleware/compare/v1.66.5...v1.66.6) (2023-12-21)


### Bug Fixes

* **profile:** updated profile skill can teach persistence ([a49839d](https://github.com/jobstash/middleware/commit/a49839d5022bdb67d8c0b02c2b5b71cafeee3064))

## [1.66.5](https://github.com/jobstash/middleware/compare/v1.66.4...v1.66.5) (2023-12-21)


### Bug Fixes

* **profile:** fixed bugs on availability and updated user skills persistence ([50e4405](https://github.com/jobstash/middleware/commit/50e4405320961fc38d7841a930c7b08376f53711))

## [1.66.4](https://github.com/jobstash/middleware/compare/v1.66.3...v1.66.4) (2023-12-21)


### Bug Fixes

* **helper:** fixed aggregate rating calculation bug ([0a3b0de](https://github.com/jobstash/middleware/commit/0a3b0de6bf08df18581a7b88a737ff7502577a71))

## [1.66.3](https://github.com/jobstash/middleware/compare/v1.66.2...v1.66.3) (2023-12-21)


### Bug Fixes

* **organizations:** fixed bugs on orgs services ([79af9b6](https://github.com/jobstash/middleware/commit/79af9b689f98d5f41f3e0f0e3fa3755eb5c244c1))

## [1.66.2](https://github.com/jobstash/middleware/compare/v1.66.1...v1.66.2) (2023-12-20)


### Bug Fixes

* **organizations:** fixed sleepytime bug ([b8553b9](https://github.com/jobstash/middleware/commit/b8553b9a065f7b439061fb97a049acf842a6f263))

## [1.66.1](https://github.com/jobstash/middleware/compare/v1.66.0...v1.66.1) (2023-12-20)


### Bug Fixes

* **jobs:** fixed bugs introduced by last commit ([b5fb55c](https://github.com/jobstash/middleware/commit/b5fb55cf9dc9ed066e34ae61a91289ec17e38d8e))

# [1.66.0](https://github.com/jobstash/middleware/compare/v1.65.1...v1.66.0) (2023-12-20)


### Features

* **organizations:** added support for extra review params ([09bd6d4](https://github.com/jobstash/middleware/commit/09bd6d4c9d5caa7e62de47be15aeee2bc025221d))

## [1.65.1](https://github.com/jobstash/middleware/compare/v1.65.0...v1.65.1) (2023-12-20)


### Bug Fixes

* fixed bugs on orgs and profile endpoints ([0cdcd6b](https://github.com/jobstash/middleware/commit/0cdcd6bdc6fd2d828ed5c75d859885dd895e5cad))

# [1.65.0](https://github.com/jobstash/middleware/compare/v1.64.0...v1.65.0) (2023-12-20)


### Features

* **organizations:** privated compensation info ([fe94328](https://github.com/jobstash/middleware/commit/fe943280a23be54a63c9f1b989b04a857f7cf2e4))

# [1.64.0](https://github.com/jobstash/middleware/compare/v1.63.9...v1.64.0) (2023-12-19)


### Features

* **profile:** updated the rating params ([cb9375b](https://github.com/jobstash/middleware/commit/cb9375b43c6b3f21470a2755a31f918d6066a9f5))

## [1.63.9](https://github.com/jobstash/middleware/compare/v1.63.8...v1.63.9) (2023-12-19)


### Bug Fixes

* **github:** fixed borkage on github signup ([752b323](https://github.com/jobstash/middleware/commit/752b323a1e8c0ed48c99115f3418cdbf7fc0df7b))

## [1.63.8](https://github.com/jobstash/middleware/compare/v1.63.7...v1.63.8) (2023-12-19)


### Bug Fixes

* **profile:** fixed bug on get user orgs service ([3279969](https://github.com/jobstash/middleware/commit/32799697fc24b4ff386ea84548f967029d71b2b1))

## [1.63.7](https://github.com/jobstash/middleware/compare/v1.63.6...v1.63.7) (2023-12-18)


### Bug Fixes

* **profile:** fix for borked bookmarked jobs endpoint ([a59c60b](https://github.com/jobstash/middleware/commit/a59c60b09c869b5d268b7a57e02798be5aecf5cc))

## [1.63.6](https://github.com/jobstash/middleware/compare/v1.63.5...v1.63.6) (2023-12-18)


### Bug Fixes

* **github:** fixed borkage on github persistence ([dcab764](https://github.com/jobstash/middleware/commit/dcab764b65e64f63190953876d76fca2b531a74b))

## [1.63.5](https://github.com/jobstash/middleware/compare/v1.63.4...v1.63.5) (2023-12-15)


### Bug Fixes

* **profile:** fixed issue with interaction verifiers ([bc5a6f6](https://github.com/jobstash/middleware/commit/bc5a6f6cdd1c030c854c4d3ddb010b30f6be56b1))

## [1.63.4](https://github.com/jobstash/middleware/compare/v1.63.3...v1.63.4) (2023-12-15)


### Bug Fixes

* **tags:** fixed issue with paired terms resolver ([d66c2c3](https://github.com/jobstash/middleware/commit/d66c2c3fc50ad54651154178a070bacf31931143))

## [1.63.3](https://github.com/jobstash/middleware/compare/v1.63.2...v1.63.3) (2023-12-15)


### Bug Fixes

* **profile:** fixed bugs on interaction verification services ([42a3355](https://github.com/jobstash/middleware/commit/42a3355a3bd08f5865a568bc17597b608fee1ec4))

## [1.63.2](https://github.com/jobstash/middleware/compare/v1.63.1...v1.63.2) (2023-12-15)


### Bug Fixes

* **tags:** fixed resolution error on paired tags ([6dd32cc](https://github.com/jobstash/middleware/commit/6dd32cc54ee201402ca7aa9d57dd88aa670ec494))

## [1.63.1](https://github.com/jobstash/middleware/compare/v1.63.0...v1.63.1) (2023-12-15)


### Bug Fixes

* **profile:** fixed more bugs ([1c07da5](https://github.com/jobstash/middleware/commit/1c07da5ff4dc3e8c2bb5af021906c7af72cfb705))

# [1.63.0](https://github.com/jobstash/middleware/compare/v1.62.7...v1.63.0) (2023-12-15)


### Features

* **organizations:** added sort by rating ([663d286](https://github.com/jobstash/middleware/commit/663d286df25e5c144d21ef9200e05413a0cc1efb))

## [1.62.7](https://github.com/jobstash/middleware/compare/v1.62.6...v1.62.7) (2023-12-15)


### Bug Fixes

* **organizations:** fixed borkage on aggregate ratings ([8696016](https://github.com/jobstash/middleware/commit/8696016e642a6eb2d930dcdfb4af2a9b83297463))

## [1.62.6](https://github.com/jobstash/middleware/compare/v1.62.5...v1.62.6) (2023-12-15)


### Bug Fixes

* **profile:** fixed bug on get user orgs endpoint ([6b2bedd](https://github.com/jobstash/middleware/commit/6b2bedd1c1ffce1f1f2b381caf35a6d851561315))

## [1.62.5](https://github.com/jobstash/middleware/compare/v1.62.4...v1.62.5) (2023-12-15)


### Bug Fixes

* **profile:** removed duplication on apply and bookmark interactions ([4d3b20c](https://github.com/jobstash/middleware/commit/4d3b20ca703e65cf0ebc473dc934261f8da5d6c9))

## [1.62.4](https://github.com/jobstash/middleware/compare/v1.62.3...v1.62.4) (2023-12-14)


### Bug Fixes

* **profile:** fixed issue with all orgs showing up for users with no emails ([c18d18e](https://github.com/jobstash/middleware/commit/c18d18e1101694b8ac81fecd5b5c7198b692cb70))

## [1.62.3](https://github.com/jobstash/middleware/compare/v1.62.2...v1.62.3) (2023-12-14)


### Bug Fixes

* fixed some mind boggling bugs ([824da11](https://github.com/jobstash/middleware/commit/824da111360966596f9f332fbd97bfb6fcd79d93))

## [1.62.2](https://github.com/jobstash/middleware/compare/v1.62.1...v1.62.2) (2023-12-14)


### Bug Fixes

* **organizations:** added aggregate rating info ([c6b6797](https://github.com/jobstash/middleware/commit/c6b67979f48e17458345583d311c01daec1b7176))

## [1.62.1](https://github.com/jobstash/middleware/compare/v1.62.0...v1.62.1) (2023-12-14)


### Bug Fixes

* **organizations:** included aggregateRating and reviewCount props on orgs ([90aa47e](https://github.com/jobstash/middleware/commit/90aa47ed3d833bdbbb8470b6f7a11209641a371f))

# [1.62.0](https://github.com/jobstash/middleware/compare/v1.61.3...v1.62.0) (2023-12-13)


### Features

* **organizations:** added reviews to organizations interface ([58aae69](https://github.com/jobstash/middleware/commit/58aae69e017a3e199647112b37d78499647a0233))
* **profile:** added delete job bookmark endpoint ([d66c689](https://github.com/jobstash/middleware/commit/d66c6896b0997089db4ebd97602f56913484794f))

## [1.61.3](https://github.com/jobstash/middleware/compare/v1.61.2...v1.61.3) (2023-12-13)


### Bug Fixes

* **profile:** fixed bug on update repo tags used endpoint ([8c5b1db](https://github.com/jobstash/middleware/commit/8c5b1db3dd7ba9882248e9a92c5de1bb453990ce))

## [1.61.2](https://github.com/jobstash/middleware/compare/v1.61.1...v1.61.2) (2023-12-13)


### Bug Fixes

* **profile:** fixed get user orgs query ([26ac324](https://github.com/jobstash/middleware/commit/26ac324093dd22b73daa82de7f83ef97fa97feac))

## [1.61.1](https://github.com/jobstash/middleware/compare/v1.61.0...v1.61.1) (2023-12-13)


### Bug Fixes

* **helpers:** fixed normalizer function ([cb81b89](https://github.com/jobstash/middleware/commit/cb81b8994769b11f5db142690525c392e3c5459e))

# [1.61.0](https://github.com/jobstash/middleware/compare/v1.60.9...v1.61.0) (2023-12-12)


### Features

* **profile:** added support for loading orgs based on email ([80ef9d0](https://github.com/jobstash/middleware/commit/80ef9d01c385b1c48f38a8183d5204abb1f71ce8))

## [1.60.9](https://github.com/jobstash/middleware/compare/v1.60.8...v1.60.9) (2023-12-12)


### Bug Fixes

* **logs:** add more debugging ([548a18d](https://github.com/jobstash/middleware/commit/548a18d4809826133064878970efa4aa841fe7fe))

## [1.60.8](https://github.com/jobstash/middleware/compare/v1.60.7...v1.60.8) (2023-12-12)


### Bug Fixes

* **profile:** added delete email to profile delete ([1598e48](https://github.com/jobstash/middleware/commit/1598e486dd6717348697f1f09da5b67577ec4e33))

## [1.60.7](https://github.com/jobstash/middleware/compare/v1.60.6...v1.60.7) (2023-12-12)


### Bug Fixes

* **user:** fixed email duplication ([bf272db](https://github.com/jobstash/middleware/commit/bf272dbeaf2645f783d19aa931e56a49adb08cd2))

## [1.60.6](https://github.com/jobstash/middleware/compare/v1.60.5...v1.60.6) (2023-12-12)


### Bug Fixes

* **copy:** tweak email copy a bit ([203ad74](https://github.com/jobstash/middleware/commit/203ad74b9fda619d991cab3c41cbc2de3c1510bc))

## [1.60.5](https://github.com/jobstash/middleware/compare/v1.60.4...v1.60.5) (2023-12-12)


### Bug Fixes

* **profile:** fixed email verification and persistence strategy ([2d15a5e](https://github.com/jobstash/middleware/commit/2d15a5ef6d4f07bcf37f2c45303d8ac85dfe31d9))

## [1.60.4](https://github.com/jobstash/middleware/compare/v1.60.3...v1.60.4) (2023-12-11)


### Bug Fixes

* **profile:** fixed data validation errors ([bf9ee80](https://github.com/jobstash/middleware/commit/bf9ee808845b1966a5095378ceb7fdbc188ac06b))

## [1.60.3](https://github.com/jobstash/middleware/compare/v1.60.2...v1.60.3) (2023-12-11)


### Bug Fixes

* **profile:** fixed bugs on user profile skills update endpoint ([ecbcbf1](https://github.com/jobstash/middleware/commit/ecbcbf18c73b8fb0e155ffa9a21d374795532901))

## [1.60.2](https://github.com/jobstash/middleware/compare/v1.60.1...v1.60.2) (2023-12-09)


### Bug Fixes

* **auth:** fixed wallet retrieval for magic link sign up ([bd31d20](https://github.com/jobstash/middleware/commit/bd31d2009f0aa42a474bbbb474db42a95a3b4792))

## [1.60.1](https://github.com/jobstash/middleware/compare/v1.60.0...v1.60.1) (2023-12-09)


### Bug Fixes

* **auth:** fixed role requirement for magic login callback ([9491065](https://github.com/jobstash/middleware/commit/9491065ebc24871ad04653a7ca954935e468f782))

# [1.60.0](https://github.com/jobstash/middleware/compare/v1.59.5...v1.60.0) (2023-12-09)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed bug on update user showcase ([11ee20b](https://github.com/jobstash/middleware/commit/11ee20b4f88aea01d9872639a5760230b29a8fdb))
* **profile:** fixed bug on update user skills ([ed79981](https://github.com/jobstash/middleware/commit/ed79981dfddc989271ef43f5f90dbd6475a23af8))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed persistence issue with profile skills and showcases ([1811248](https://github.com/jobstash/middleware/commit/1811248d2e9a06503d35a3a36d9d9981fed7d1ed))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))
* **user:** fixed duplication of user email nodes ([52f1300](https://github.com/jobstash/middleware/commit/52f1300b66118bcbacb747e24607bf621d86bf43))


### Features

* **auth:** added role and flow update after email signup ([5e8ea93](https://github.com/jobstash/middleware/commit/5e8ea936254ef5eb0aa28e7bd579ba9b922ff656))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-09)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed bug on update user showcase ([11ee20b](https://github.com/jobstash/middleware/commit/11ee20b4f88aea01d9872639a5760230b29a8fdb))
* **profile:** fixed bug on update user skills ([ed79981](https://github.com/jobstash/middleware/commit/ed79981dfddc989271ef43f5f90dbd6475a23af8))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed persistence issue with profile skills and showcases ([1811248](https://github.com/jobstash/middleware/commit/1811248d2e9a06503d35a3a36d9d9981fed7d1ed))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))
* **user:** fixed duplication of user email nodes ([52f1300](https://github.com/jobstash/middleware/commit/52f1300b66118bcbacb747e24607bf621d86bf43))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed bug on update user showcase ([11ee20b](https://github.com/jobstash/middleware/commit/11ee20b4f88aea01d9872639a5760230b29a8fdb))
* **profile:** fixed bug on update user skills ([ed79981](https://github.com/jobstash/middleware/commit/ed79981dfddc989271ef43f5f90dbd6475a23af8))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))
* **user:** fixed duplication of user email nodes ([52f1300](https://github.com/jobstash/middleware/commit/52f1300b66118bcbacb747e24607bf621d86bf43))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed bug on update user showcase ([11ee20b](https://github.com/jobstash/middleware/commit/11ee20b4f88aea01d9872639a5760230b29a8fdb))
* **profile:** fixed bug on update user skills ([ed79981](https://github.com/jobstash/middleware/commit/ed79981dfddc989271ef43f5f90dbd6475a23af8))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed bug on update user showcase ([11ee20b](https://github.com/jobstash/middleware/commit/11ee20b4f88aea01d9872639a5760230b29a8fdb))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed support for magic link and added FE callback support ([d4a2015](https://github.com/jobstash/middleware/commit/d4a201510a19c7d3deae10001a63b8e692fc69c0))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication again ([7be9395](https://github.com/jobstash/middleware/commit/7be93957d9bea8e383c1e5ff91c9dd3eb7a70b55))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-08)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))
* **tags:** fixed issue with tags duplication and added tests to flag it next time ([766ed84](https://github.com/jobstash/middleware/commit/766ed847ab6693618166f8f4e360d15ec6ce7895))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-06)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed bug in update user profile query ([c06a06b](https://github.com/jobstash/middleware/commit/c06a06ba7fab937ff0217eff25ca5f3215d7a992))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-06)


### Bug Fixes

* **profile:** dropped role and flow props ([7e5eae7](https://github.com/jobstash/middleware/commit/7e5eae7a4dca53744fef078640e4f9356ea9c270))
* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-06)


### Bug Fixes

* **profile:** fixed get user profile bug ([0858e4a](https://github.com/jobstash/middleware/commit/0858e4a46138e183d5cbcd8eff24324f6bd0ce09))
* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-06)


### Bug Fixes

* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** removed weirdo property from user org response interface ([33c35d9](https://github.com/jobstash/middleware/commit/33c35d95985f47d57685989fc4eb28f2cac46cbb))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-06)


### Bug Fixes

* **profile:** fixed issue with org review vs. user org types ([8e41183](https://github.com/jobstash/middleware/commit/8e4118315563c950a099525ae39ed42b8c290982))
* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** fixed validation bug for get user orgs endpoint ([b494a64](https://github.com/jobstash/middleware/commit/b494a6480a66c55ebc019a87c9ab9239f55ac5fa))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-05)


### Bug Fixes

* **profile:** fixed query bugs on get user organizations endpoint ([5a2e180](https://github.com/jobstash/middleware/commit/5a2e18011bfc5ada1ad596f203b48786578e394a))
* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.6](https://github.com/jobstash/middleware/compare/v1.59.5...v1.59.6) (2023-12-05)


### Bug Fixes

* **profile:** simplified the user organization response interface ([5555b66](https://github.com/jobstash/middleware/commit/5555b6666ddd3d3f78ae83543b0b5470742106ef))

## [1.59.5](https://github.com/jobstash/middleware/compare/v1.59.4...v1.59.5) (2023-12-05)


### Bug Fixes

* **organizations:** fixed interface bug ([8293a95](https://github.com/jobstash/middleware/commit/8293a959094ff642da074b6c99c976e930e75b40))

## [1.59.4](https://github.com/jobstash/middleware/compare/v1.59.3...v1.59.4) (2023-12-05)


### Bug Fixes

* **organizations:** fixed validation borkage on organizations list endpoint ([55e2242](https://github.com/jobstash/middleware/commit/55e22422165a6bb4a1c7328dc83a3a7aef93e7df))

## [1.59.3](https://github.com/jobstash/middleware/compare/v1.59.2...v1.59.3) (2023-12-05)


### Bug Fixes

* **profile:** fixed validation bug on user profile endpoint ([f4731a3](https://github.com/jobstash/middleware/commit/f4731a35b05b435b3e7af9caead0e549ae7eb477))
* **projects:** fixed bug with project chains filter ([508f123](https://github.com/jobstash/middleware/commit/508f1239ca52324eb7024b80ff478b6d61272b4d))

## [1.59.2](https://github.com/jobstash/middleware/compare/v1.59.1...v1.59.2) (2023-12-05)


### Bug Fixes

* **profile:** simplified the response interface of the get user orgs endpoint ([ae07682](https://github.com/jobstash/middleware/commit/ae0768236576b0c098694dd950548cd666861bb7))

## [1.59.1](https://github.com/jobstash/middleware/compare/v1.59.0...v1.59.1) (2023-12-04)


### Bug Fixes

* **profile:** merged reviews with orgs list ([5b8c625](https://github.com/jobstash/middleware/commit/5b8c6253d8d835745ba28882106145ba5a2d36a2))

# [1.59.0](https://github.com/jobstash/middleware/compare/v1.58.6...v1.59.0) (2023-12-04)


### Features

* **profile:** implemented get user orgs endpoint ([c106b3a](https://github.com/jobstash/middleware/commit/c106b3a7c37e58e454670e955dc32fbf99616a85))

## [1.58.6](https://github.com/jobstash/middleware/compare/v1.58.5...v1.58.6) (2023-12-04)


### Bug Fixes

* **profile:** fixed borkage on add repo tags used ([c235d3e](https://github.com/jobstash/middleware/commit/c235d3e02dfee539caceeaa2f6daccd620751c0c))

## [1.58.5](https://github.com/jobstash/middleware/compare/v1.58.4...v1.58.5) (2023-12-04)


### Bug Fixes

* **profile:** fixed borked queries on profile endpoint ([beef67d](https://github.com/jobstash/middleware/commit/beef67d8bfa99e1e9a72803fefa202d7e8c2af4f))

## [1.58.4](https://github.com/jobstash/middleware/compare/v1.58.3...v1.58.4) (2023-12-04)


### Bug Fixes

* **profile:** fixed issues with repos ([843c560](https://github.com/jobstash/middleware/commit/843c56037cf58b3749da12ab9adfa59fdaeeb75c))

## [1.58.3](https://github.com/jobstash/middleware/compare/v1.58.2...v1.58.3) (2023-11-30)


### Bug Fixes

* **jobs:** fixed tests borked by the last response interface change ([0251492](https://github.com/jobstash/middleware/commit/025149269f8968f33cc8ac578cc5d6c6f1a3422a))

## [1.58.2](https://github.com/jobstash/middleware/compare/v1.58.1...v1.58.2) (2023-11-30)


### Bug Fixes

* **profile:** fixed bugs with github profile and repo services ([8c3c6f4](https://github.com/jobstash/middleware/commit/8c3c6f4bcd62419f67bf024ac71fe6eddadaec90))

## [1.58.1](https://github.com/jobstash/middleware/compare/v1.58.0...v1.58.1) (2023-11-29)


### Bug Fixes

* **jobs:** added support for blocked and online status update, tags and associated project update ([af7f69d](https://github.com/jobstash/middleware/commit/af7f69de2cc35991e9839633a1645afcfb65196a))

# [1.58.0](https://github.com/jobstash/middleware/compare/v1.57.6...v1.58.0) (2023-11-29)


### Features

* **jobs:** refactored all jobs list response interface to match the new FE needs ([f54ce3a](https://github.com/jobstash/middleware/commit/f54ce3ac8e40d4bed01390362103639e9744006e))

## [1.57.6](https://github.com/jobstash/middleware/compare/v1.57.5...v1.57.6) (2023-11-28)


### Bug Fixes

* **jobs:** fixed update jobs bug ([8b5a7a1](https://github.com/jobstash/middleware/commit/8b5a7a12875cd73865d69d65372d7dd3d939d494))

## [1.57.5](https://github.com/jobstash/middleware/compare/v1.57.4...v1.57.5) (2023-11-28)


### Bug Fixes

* **jobs:** fixed body validator of update job endpoint ([871a9a4](https://github.com/jobstash/middleware/commit/871a9a4e0eb6f2bb7b2beeb1d8079b7b17f764ab))

## [1.57.4](https://github.com/jobstash/middleware/compare/v1.57.3...v1.57.4) (2023-11-27)


### Bug Fixes

* **tests:** fixed broken tests ([26fa3ef](https://github.com/jobstash/middleware/commit/26fa3ef65ab34ff399d56f98a128017ede30c00c))

## [1.57.3](https://github.com/jobstash/middleware/compare/v1.57.2...v1.57.3) (2023-11-27)


### Bug Fixes

* **jobs:** fixed a naming issue with job location filters param key ([8c2affb](https://github.com/jobstash/middleware/commit/8c2affb73a0dfcd0ac15be157cfef3d68001aaf7))

## [1.57.2](https://github.com/jobstash/middleware/compare/v1.57.1...v1.57.2) (2023-11-27)


### Bug Fixes

* **jobs:** fixed location filter parser issue ([4608213](https://github.com/jobstash/middleware/commit/46082131548306f383caf481b4a206f9a8f4dfcb))

## [1.57.1](https://github.com/jobstash/middleware/compare/v1.57.0...v1.57.1) (2023-11-24)


### Bug Fixes

* **jobs:** refactored all jobs response to return all at once ([b12d05c](https://github.com/jobstash/middleware/commit/b12d05c5ea88523cf1ca26acaeb2c8210a749eff))

# [1.57.0](https://github.com/jobstash/middleware/compare/v1.56.3...v1.57.0) (2023-11-23)


### Features

* **projects:** added endpoints to unlink jobs and repos from projects ([73efeb2](https://github.com/jobstash/middleware/commit/73efeb2fb0ed9d9f6f1f21528b94bc9ade672a6a))

## [1.56.3](https://github.com/jobstash/middleware/compare/v1.56.2...v1.56.3) (2023-11-23)


### Bug Fixes

* **projects:** fixed typo in swagger metadata ([ee0da5f](https://github.com/jobstash/middleware/commit/ee0da5f3085af3e7ec79c294671936f68ae264e1))

## [1.56.2](https://github.com/jobstash/middleware/compare/v1.56.1...v1.56.2) (2023-11-23)


### Bug Fixes

* **tags:** finessed the preferred terms impl ([1a8ff60](https://github.com/jobstash/middleware/commit/1a8ff6091f3b61878fcc5729341d7767c71f49fc))

## [1.56.1](https://github.com/jobstash/middleware/compare/v1.56.0...v1.56.1) (2023-11-23)


### Bug Fixes

* **jobs:** fix parsing of location filter ([3f792b6](https://github.com/jobstash/middleware/commit/3f792b6ea22da1507370290a4946a212d0c050f5))

# [1.56.0](https://github.com/jobstash/middleware/compare/v1.55.0...v1.56.0) (2023-11-22)


### Features

* **projects:** added support for financials data on project prefiller endpoint ([05b6cea](https://github.com/jobstash/middleware/commit/05b6cea14669fd86526a176ad28551f6253075c4))

# [1.55.0](https://github.com/jobstash/middleware/compare/v1.54.0...v1.55.0) (2023-11-21)


### Features

* **projects:** implemented prefiller endpoint for project creation ([8a33995](https://github.com/jobstash/middleware/commit/8a33995a0a265b14197fbaee0af7d139b1aa4287))

# [1.54.0](https://github.com/jobstash/middleware/compare/v1.53.7...v1.54.0) (2023-11-20)


### Bug Fixes

* added fixes for borkages in tests ([6f7c3aa](https://github.com/jobstash/middleware/commit/6f7c3aa1cefed15969395e653b55d0734273888e))
* **projects:** fixed a bug with delete query ([569cf7c](https://github.com/jobstash/middleware/commit/569cf7cdfac14e9b568608c648ef16fd5aae124b))
* removed default generated tests ([84b6cee](https://github.com/jobstash/middleware/commit/84b6ceeb6ee933df7cfc83ef91cb52f89c3471f1))
* **tags:** added backwards connection and fixed delete query bugs ([897e2d7](https://github.com/jobstash/middleware/commit/897e2d73a1ea2d35bc89665029d3bc8142f26495))
* **tags:** fixed bugs in edit job tags query ([cc1c14f](https://github.com/jobstash/middleware/commit/cc1c14fb988e43ef61e7cf1f818218584fe05a41))
* **tags:** fixed bugs on tags services ([ed16d1a](https://github.com/jobstash/middleware/commit/ed16d1af79a7fec4bbacf68592a059fc9989b1e8))
* **tags:** fixed duplication of designation nodes ([6ef2bec](https://github.com/jobstash/middleware/commit/6ef2becdf96935259dea2bfcaa7393ab33163509))
* **tags:** fixed duplication on add tag synonym and removed relation check on synonym delete ([21bddd9](https://github.com/jobstash/middleware/commit/21bddd947bc7f67c35da971ad7924dd8adfc384a))
* **tags:** fixed issue with bidirectional relationship of synonyms ([3874add](https://github.com/jobstash/middleware/commit/3874add7f7c0bf8747480c4a8b0cb48cc9bd9633))
* **users:** fixed bugs in profile queries ([40cd6f6](https://github.com/jobstash/middleware/commit/40cd6f6925bbf77fc649735d1ca208fb1dbdb1ea))


### Features

* **jobs:** implemented edit job metadata endpoint ([2b43073](https://github.com/jobstash/middleware/commit/2b430734dc2b25e6cadba4a3928d304be9193fd2))
* **jobs:** implemented edit job tags endpoint ([efa5224](https://github.com/jobstash/middleware/commit/efa52242254a3bcb6453da83c7ec52e4b5c7847f))
* **organizations:** Implemented CRUD ops for organizations ([042df5a](https://github.com/jobstash/middleware/commit/042df5a487e0922e3e055716d55bb8e70e0dbd48))
* **projects:** added jobs and repo props to projects ([2232d9c](https://github.com/jobstash/middleware/commit/2232d9c8847127a221a0ed0436ac30334ce56562))
* **projects:** implemented CRUD endpoints for ([bf67293](https://github.com/jobstash/middleware/commit/bf6729325d01372c5654de7e40934ebaa6ef883b))
* **projects:** implemented link jobs to project endpoint ([107226b](https://github.com/jobstash/middleware/commit/107226b73c8d40499695ead36115a1f745038b15))
* **projects:** implemented update and delete project metrics endpoints ([ce03336](https://github.com/jobstash/middleware/commit/ce03336e12a0797f50c848c45fa5c762b3846899))
* **tags:** fixed bugs on tag handling services and updated the queries to follow the new ddm ([9133d30](https://github.com/jobstash/middleware/commit/9133d30650b011d34ff7341f3a418630860ca6fe))
* **users:** implemented get all users endpoint ([1661db1](https://github.com/jobstash/middleware/commit/1661db17906daa8efb038c79c1bc4f73f6d74154))

## [1.53.7](https://github.com/jobstash/middleware/compare/v1.53.6...v1.53.7) (2023-11-09)


### Bug Fixes

* **tags:** fixed borkages with unblock and pair tags service queries ([a03a66c](https://github.com/jobstash/middleware/commit/a03a66c0ac11bb4c7d72a986022ff97f21389cb0))

## [1.53.6](https://github.com/jobstash/middleware/compare/v1.53.5...v1.53.6) (2023-11-09)


### Bug Fixes

* **tags:** fixed bugs in tag godmode services ([212aef0](https://github.com/jobstash/middleware/commit/212aef03f9406c1f8d9e68c77dde71293027b32b))

## [1.53.5](https://github.com/jobstash/middleware/compare/v1.53.4...v1.53.5) (2023-11-08)


### Bug Fixes

* **tags:** fixed issue with preferred terms ([a0496f4](https://github.com/jobstash/middleware/commit/a0496f439ee09800077ab880f4dedcde8c7404aa))

## [1.53.4](https://github.com/jobstash/middleware/compare/v1.53.3...v1.53.4) (2023-11-04)


### Bug Fixes

* **auth:** added back auth guard for set admin role endpoint ([0ad5e5f](https://github.com/jobstash/middleware/commit/0ad5e5f38f113ea9140d61792fdf7415c9cbba16))

## [1.53.3](https://github.com/jobstash/middleware/compare/v1.53.2...v1.53.3) (2023-11-04)


### Bug Fixes

* **auth:** fixed a bug in github signup service ([24c7972](https://github.com/jobstash/middleware/commit/24c7972ef16c2a19235e8d8bed3858df5eb6fbf5))

## [1.53.2](https://github.com/jobstash/middleware/compare/v1.53.1...v1.53.2) (2023-11-04)


### Bug Fixes

* fixed a bug in user creation service ([f9c35d8](https://github.com/jobstash/middleware/commit/f9c35d83b32c2c4f595a95a5b0f1878cb20939c3))
* remove certs from git history ([f5e4de2](https://github.com/jobstash/middleware/commit/f5e4de204e0cfff8752cfe83df4e6e6a24c19890))

## [1.53.1](https://github.com/jobstash/middleware/compare/v1.53.0...v1.53.1) (2023-11-03)


### Bug Fixes

* fixed bugs on auth infra ([9943ac4](https://github.com/jobstash/middleware/commit/9943ac4ace6c975427b6498ce251c3533324f5e8))

# [1.53.0](https://github.com/jobstash/middleware/compare/v1.52.11...v1.53.0) (2023-11-03)


### Features

* added back in the set admin endpoint ([f6f7bc9](https://github.com/jobstash/middleware/commit/f6f7bc955b09c03ac7da55f445048fec6f11b0b0))

## [1.52.11](https://github.com/jobstash/middleware/compare/v1.52.10...v1.52.11) (2023-11-02)


### Bug Fixes

* **models:** added logging for pre and post connection attempts ([4171400](https://github.com/jobstash/middleware/commit/4171400b9e2f7be62d4bbdff18433d9f3f2a93eb))

## [1.52.10](https://github.com/jobstash/middleware/compare/v1.52.9...v1.52.10) (2023-10-31)


### Bug Fixes

* **lists:** moved over the pagination logic to a global helper and wrote a test to prevent a regression to the previous bug ([5462ffb](https://github.com/jobstash/middleware/commit/5462ffb9f5ce6ed2d1886cdbcb3a2e23131b063f))

## [1.52.9](https://github.com/jobstash/middleware/compare/v1.52.8...v1.52.9) (2023-10-31)


### Bug Fixes

* **lists:** fixed off-by-1 pagination bug on all list endpoints ([625520d](https://github.com/jobstash/middleware/commit/625520dba1668080f056bc9d1b9798b881fe09cb))

## [1.52.8](https://github.com/jobstash/middleware/compare/v1.52.7...v1.52.8) (2023-10-31)


### Bug Fixes

* **orgs:** fixed bugs introduced by last commit ([0f241c7](https://github.com/jobstash/middleware/commit/0f241c7b8287d278cd55affd64455529e17c32e6))

## [1.52.7](https://github.com/jobstash/middleware/compare/v1.52.6...v1.52.7) (2023-10-31)


### Bug Fixes

* **orgs:** removed redundant params on orgs list ([a6ba8c4](https://github.com/jobstash/middleware/commit/a6ba8c49e98ce564a15edc623d0d377868d4676b))

## [1.52.6](https://github.com/jobstash/middleware/compare/v1.52.5...v1.52.6) (2023-10-30)


### Bug Fixes

* **orgs:** fixed inefficient lookup method of org details ([89b5a32](https://github.com/jobstash/middleware/commit/89b5a32b8d8961976ad5ca240f971b4f706c1eb4))

## [1.52.5](https://github.com/jobstash/middleware/compare/v1.52.4...v1.52.5) (2023-10-30)


### Bug Fixes

* **organizations:** fixed a weird artifact from way back on org filter configs query ([f8068d3](https://github.com/jobstash/middleware/commit/f8068d3ed54e7524eeef1f78d982e4b80540959c))

## [1.52.4](https://github.com/jobstash/middleware/compare/v1.52.3...v1.52.4) (2023-10-30)


### Bug Fixes

* **jobs:** temp disable hacks and audits filters ([992f944](https://github.com/jobstash/middleware/commit/992f94469f142f255cd199bfe3750541fcad4f60))

## [1.52.3](https://github.com/jobstash/middleware/compare/v1.52.2...v1.52.3) (2023-10-28)


### Bug Fixes

* **jobs:** fixed issue with orgs interface ([5116120](https://github.com/jobstash/middleware/commit/5116120a1bd296437e991501e5583c32306d216c))

## [1.52.2](https://github.com/jobstash/middleware/compare/v1.52.1...v1.52.2) (2023-10-28)


### Bug Fixes

* **job:** revert temp fix on seniority filter bug ([a1f55d1](https://github.com/jobstash/middleware/commit/a1f55d12ea83fc0e97c64e959157212908665536))

## [1.52.1](https://github.com/jobstash/middleware/compare/v1.52.0...v1.52.1) (2023-10-28)


### Bug Fixes

* **jobs:** temp fix for seniority filter borkage ([09dd13e](https://github.com/jobstash/middleware/commit/09dd13ec867b849b0d20b91392ffc19b9f77cdbc))

# [1.52.0](https://github.com/jobstash/middleware/compare/v1.51.3...v1.52.0) (2023-10-27)


### Features

* **jobs:** added s'more tests ([4325817](https://github.com/jobstash/middleware/commit/4325817d779664607f8141955b2da3bb67534f64))

## [1.51.3](https://github.com/jobstash/middleware/compare/v1.51.2...v1.51.3) (2023-10-27)


### Bug Fixes

* **filters:** fixed issue with seniority filter config generator query ([127e5e2](https://github.com/jobstash/middleware/commit/127e5e21aa1370626a6e688edf883457605da813))

## [1.51.2](https://github.com/jobstash/middleware/compare/v1.51.1...v1.51.2) (2023-10-26)


### Bug Fixes

* **projects:** fixed bug on projects list with search ([c6092b3](https://github.com/jobstash/middleware/commit/c6092b3c73f981811df0812bc76c173490da87e4))

## [1.51.1](https://github.com/jobstash/middleware/compare/v1.51.0...v1.51.1) (2023-10-26)


### Bug Fixes

* **projects:** added description prop back to project competitor list results ([97f7aea](https://github.com/jobstash/middleware/commit/97f7aea6f2ac6108b75c5eda8efb0caabf021223))

# [1.51.0](https://github.com/jobstash/middleware/compare/v1.50.0...v1.51.0) (2023-10-26)


### Features

* **profile:** implemented block jobs from an org endpoint ([ee0f326](https://github.com/jobstash/middleware/commit/ee0f32696cbf6b770ec7978eaea6937beca655de))

# [1.50.0](https://github.com/jobstash/middleware/compare/v1.49.4...v1.50.0) (2023-10-26)


### Features

* **data:** added data collection on user interactions ([8bf48a1](https://github.com/jobstash/middleware/commit/8bf48a15891f631b31aa35d957314af99429c1f4))

## [1.49.4](https://github.com/jobstash/middleware/compare/v1.49.3...v1.49.4) (2023-10-26)


### Bug Fixes

* **jobs:** fixed the timestamp bug in more places ([bd6d4d1](https://github.com/jobstash/middleware/commit/bd6d4d1d71f6cad3e5010a0bf4efe6234a90ffad))

## [1.49.3](https://github.com/jobstash/middleware/compare/v1.49.2...v1.49.3) (2023-10-26)


### Bug Fixes

* **jobs:** fixed query error causing timestamp to be null ([202ced7](https://github.com/jobstash/middleware/commit/202ced78335079f8fc16c0dc1e22ddafc12259e4))

## [1.49.2](https://github.com/jobstash/middleware/compare/v1.49.1...v1.49.2) (2023-10-26)


### Bug Fixes

* **projects:** fixed chains bug on project details endpoint ([91fff2d](https://github.com/jobstash/middleware/commit/91fff2dfdc2d79a380244f8d517e8680e521920c))

## [1.49.1](https://github.com/jobstash/middleware/compare/v1.49.0...v1.49.1) (2023-10-26)


### Bug Fixes

* **chains:** fixed missing logo on chains on some lists ([145a0b2](https://github.com/jobstash/middleware/commit/145a0b23849ac59ef79c18968cfd6b2a05420b16))

# [1.49.0](https://github.com/jobstash/middleware/compare/v1.48.0...v1.49.0) (2023-10-25)


### Features

* **projects:** fixed logo issue and added hacks, audits and chains data to project competitor results ([3a9f83c](https://github.com/jobstash/middleware/commit/3a9f83c600d2bb5991d3be1470d67cc17e399e53))

# [1.48.0](https://github.com/jobstash/middleware/compare/v1.47.7...v1.48.0) (2023-10-24)


### Features

* **filters:** changed previously b64 encoded string filters to support normalization with custom function ([5bdcdc0](https://github.com/jobstash/middleware/commit/5bdcdc0cc33a32f4f7725b9175016aa96c5a3ec2))

## [1.47.7](https://github.com/jobstash/middleware/compare/v1.47.6...v1.47.7) (2023-10-24)


### Bug Fixes

* **profile:** fixed a really stupid bug ([f483290](https://github.com/jobstash/middleware/commit/f483290749aff97d08cfb292c9d348de9634be77))

## [1.47.6](https://github.com/jobstash/middleware/compare/v1.47.5...v1.47.6) (2023-10-24)


### Bug Fixes

* **profile:** fixed bug on update profile endpoints where new skills, showcase and tags used did not overwrite previous records ([bcf54bd](https://github.com/jobstash/middleware/commit/bcf54bd4ef156a6271606e679cfa34b479dc69bd))

## [1.47.5](https://github.com/jobstash/middleware/compare/v1.47.4...v1.47.5) (2023-10-24)


### Bug Fixes

* **jobs:** refactored all timestamp refs into `timestamp` ([3340908](https://github.com/jobstash/middleware/commit/3340908bc9fea5fda7860e6139e6d7adbf9546e2))

## [1.47.4](https://github.com/jobstash/middleware/compare/v1.47.3...v1.47.4) (2023-10-24)


### Bug Fixes

* **profile:** fixed bugs on get user profile skills and showcase endpoints ([83d96ec](https://github.com/jobstash/middleware/commit/83d96ec42d6a5fe9a57db4337233e0cf2e9b0ae0))

## [1.47.3](https://github.com/jobstash/middleware/compare/v1.47.2...v1.47.3) (2023-10-24)


### Bug Fixes

* **jobs:** fixed duplication on funding rounds and investors ([9408908](https://github.com/jobstash/middleware/commit/9408908e847e4002638641b51c2cf9602a5980d2))

## [1.47.2](https://github.com/jobstash/middleware/compare/v1.47.1...v1.47.2) (2023-10-24)


### Bug Fixes

* **profile:** fixed issue with skills and showcase not getting persisted ([46f527a](https://github.com/jobstash/middleware/commit/46f527a1c81101df43ffe65752731bf3ee9cfe2e))

## [1.47.1](https://github.com/jobstash/middleware/compare/v1.47.0...v1.47.1) (2023-10-24)


### Bug Fixes

* **profile:** fixed issue with skills, showcase and tags used not getting persisted ([c8e17c8](https://github.com/jobstash/middleware/commit/c8e17c8e72f260595234d1a3f0f2c052d7c5db99))

# [1.47.0](https://github.com/jobstash/middleware/compare/v1.46.2...v1.47.0) (2023-10-23)


### Bug Fixes

* **chains:** fixed chains relation ([9af2570](https://github.com/jobstash/middleware/commit/9af2570960eec6e7a031a2b573a6afe8661aa99f))
* **filters:** correct numbering ([a2b6482](https://github.com/jobstash/middleware/commit/a2b64823ae7d0e55d1fe404bba2bb06c6850ead5))
* **filters:** enabled chains filter config ([c193616](https://github.com/jobstash/middleware/commit/c193616b15a755a80787b1f122f33216cc0a8721))
* **filters:** fixed borkage of jobs filters ([fbd8bb2](https://github.com/jobstash/middleware/commit/fbd8bb28e16cb6180c65c32567b854b7b1bd3f9b))
* **filters:** reconfigure filters ([289571c](https://github.com/jobstash/middleware/commit/289571cc245a4ad336a0fde272b714cceb9f611b))
* **github:** fixed bug in github signup flow ([38f9f6e](https://github.com/jobstash/middleware/commit/38f9f6e72fa038f1f209966a5d42b3fa76f1fd9b))
* **jobs:** fixed bugs borking jobs list ([378c01b](https://github.com/jobstash/middleware/commit/378c01b8f7db48311ef45c7095d32cd30c79ceea))
* **jobs:** fixed classifications filter bug ([4d88102](https://github.com/jobstash/middleware/commit/4d88102b37c89ee6510f6c22acdebc10b91f704e))
* **jobs:** fixed jobpost date params ([5259032](https://github.com/jobstash/middleware/commit/5259032330756a75a8a9acee80580e53ff7d5872))
* **jobs:** fixed naming of job date param ([6e73e57](https://github.com/jobstash/middleware/commit/6e73e572d710f18893788cbfd34be5f72f8ca073))
* **jobs:** fixed validation bugs on jobs list results ([49e7bdd](https://github.com/jobstash/middleware/commit/49e7bdd2fe353e302fdad6fb60c8e6d0a1203147))
* **jobs:** fixed yet another validation bug on jobs list results ([8e1e2dc](https://github.com/jobstash/middleware/commit/8e1e2dca46d76874c13a85ef4e67fdcd8e5e59cc))
* **jobs:** rethink of project based filters on jobs list ([d6d8fcd](https://github.com/jobstash/middleware/commit/d6d8fcde90be9b6d889c9ba30e865d8984d2ccc7))
* **jobs:** temp fix for lastSeenTimestamp ([8138944](https://github.com/jobstash/middleware/commit/8138944093278d51353ae6930242adb9143d6058))
* **profile:** fix bugs on set user skills and showcase queries ([f3e3510](https://github.com/jobstash/middleware/commit/f3e3510e9dda58838f9bf0eb9bc09858bbe2ebf2))
* **profile:** fix bugs on set user skills and showcase queries again ([ef52eac](https://github.com/jobstash/middleware/commit/ef52eacfa15f4ec5a293af103c2d15385892d453))
* **profile:** fix for user profile type and update queries ([4205259](https://github.com/jobstash/middleware/commit/4205259b1beabcbfce6e4d40033903bdef39e835))
* **profile:** fixed bug introduced by last commit ([777f83d](https://github.com/jobstash/middleware/commit/777f83d0b9aeabff625e9587b8d0f07db836e36f))
* **profile:** fixed bug where only last item in profile lists get persisted ([636106f](https://github.com/jobstash/middleware/commit/636106f82d37606591c96b22a6e44f3de5fc1a43))
* **profile:** fixed bug with user profile skills endpoint body ([7f85fc0](https://github.com/jobstash/middleware/commit/7f85fc0043cb2378e72a768b603cc070428aa5c4))
* **profile:** fixed errors in profile queries ([7d8c672](https://github.com/jobstash/middleware/commit/7d8c672936906c43ce689684fd8ad0b793baec26))
* **profile:** fixed issue with only last item getting persisted ([4d62fe8](https://github.com/jobstash/middleware/commit/4d62fe8f9dea50da8b7b9cdffddd0da8ab6823ca))
* **profile:** fixed issue with profile skills and showcase response interface ([4288b02](https://github.com/jobstash/middleware/commit/4288b024f4dde87eddfd3cda606a06e926ce132a))
* **user:** fixed bugs on user profile ([ef634a8](https://github.com/jobstash/middleware/commit/ef634a87fc6e6a67438394aa47dab2a666c460ab))


### Features

* **jobs:** added published timestamp to jobs lists ([a6fa77f](https://github.com/jobstash/middleware/commit/a6fa77fb791f2cadbe12339bc393e8a0c9baa082))
* **jobs:** added published timestamp to jobs lists ([08bf1ff](https://github.com/jobstash/middleware/commit/08bf1ff51eca4e160fc2b9f23bff3ce343a1b397))
* **jobs:** added support for blocked jobs ([25e5e86](https://github.com/jobstash/middleware/commit/25e5e8674ecfe7b9242aae10f48c236f4c28197a))
* **profile:** implemented magic link endpoint ([7893161](https://github.com/jobstash/middleware/commit/7893161831b5f7b9d02a7268eb013502d315fc1a))

## [1.46.2](https://github.com/jobstash/middleware/compare/v1.46.1...v1.46.2) (2023-10-19)


### Bug Fixes

* **categories:** added devops ([1abf0ba](https://github.com/jobstash/middleware/commit/1abf0ba40271c6ea14f03fb71a1bbde8c1aa9e53))

## [1.46.1](https://github.com/jobstash/middleware/compare/v1.46.0...v1.46.1) (2023-10-19)


### Bug Fixes

* **profile:** bug fixes on profile endpoints ([6405bf4](https://github.com/jobstash/middleware/commit/6405bf4f83b057a4f6b7b497363e51ee5180b996))

# [1.46.0](https://github.com/jobstash/middleware/compare/v1.45.0...v1.46.0) (2023-10-18)


### Features

* **profile:** implemented delete account endpoint ([33b1ce3](https://github.com/jobstash/middleware/commit/33b1ce33c0554e6c800b63fdce32c5bf9911ac33))

# [1.45.0](https://github.com/jobstash/middleware/compare/v1.44.0...v1.45.0) (2023-10-18)


### Features

* **profile:** implemented get and set user profile skills endpoints ([bb816d7](https://github.com/jobstash/middleware/commit/bb816d7af314f9ee7db3c91c066ef7d61c4f89cc))
* **profile:** implemented get and set user profile showcase endpoints ([96f7348](https://github.com/jobstash/middleware/commit/96f73483dc42dca0db12192e9aaba529c03935f8))

# [1.44.0](https://github.com/jobstash/middleware/compare/v1.43.0...v1.44.0) (2023-10-17)


### Features

* **jobs:** implemented change job classification endpoint ([4787c9f](https://github.com/jobstash/middleware/commit/4787c9f561462267703ff10fe4eb06e38db28bbd))

# [1.43.0](https://github.com/jobstash/middleware/compare/v1.42.0...v1.43.0) (2023-10-17)


### Bug Fixes

* **profile:** add datetime sorter fix ([53bc98c](https://github.com/jobstash/middleware/commit/53bc98c2a3ad1e664f0d2463c83f88209a9f051f))


### Features

* **profile:** implemented get user repos endpoint ([53877e7](https://github.com/jobstash/middleware/commit/53877e7beb433fa266c0df25b23f5f2cb443d57a))
* **profile:** implemented update repo contribution endpoint ([b16f2b6](https://github.com/jobstash/middleware/commit/b16f2b62fa256c5796805f6ee46300a8bee956ef))
* **profile:** implemented update repo tags used endpoint ([79dc8a0](https://github.com/jobstash/middleware/commit/79dc8a08b2409bd437034c4a6fa805f2e78fe6a0))

# [1.42.0](https://github.com/jobstash/middleware/compare/v1.41.0...v1.42.0) (2023-10-16)


### Features

* **profile:** implemented org review endpoints ([52e3ddf](https://github.com/jobstash/middleware/commit/52e3ddffcb5b72760450578e80e991cf99b84135))

# [1.41.0](https://github.com/jobstash/middleware/compare/v1.40.3...v1.41.0) (2023-10-16)


### Bug Fixes

* **users:** added null handlers for org review service call ([cbf466e](https://github.com/jobstash/middleware/commit/cbf466eb7d4d0bbf608c51e5d3eff6f8540034d2))


### Features

* **profile:** implemented endpoint to get org reviews for a users profile ([511c37f](https://github.com/jobstash/middleware/commit/511c37fba6fd0261753d531fd8409eacaaf17595))

## [1.40.3](https://github.com/jobstash/middleware/compare/v1.40.2...v1.40.3) (2023-10-15)


### Bug Fixes

* **user:** fixed issues with get user profile info endpoint ([bd9133c](https://github.com/jobstash/middleware/commit/bd9133c29ff0b9fee558dcb9178282363e9d0a39))

## [1.40.2](https://github.com/jobstash/middleware/compare/v1.40.1...v1.40.2) (2023-10-15)


### Bug Fixes

* **orgs:** renamed logo property to logoUrl ([44b2a77](https://github.com/jobstash/middleware/commit/44b2a7718840c90d848e5c0c1556087a88c54726))

## [1.40.1](https://github.com/jobstash/middleware/compare/v1.40.0...v1.40.1) (2023-10-15)


### Bug Fixes

* **user:** fixed bug in user profile endpoint ([7e38e52](https://github.com/jobstash/middleware/commit/7e38e52c1bf65b57321b38c69afb2db92bb7f8b0))

# [1.40.0](https://github.com/jobstash/middleware/compare/v1.39.1...v1.40.0) (2023-10-14)


### Features

* **categories:** add new category cybersecurity ([a2a8496](https://github.com/jobstash/middleware/commit/a2a84962f834dcea3794705d5c72c0c054fe6e05))

## [1.39.1](https://github.com/jobstash/middleware/compare/v1.39.0...v1.39.1) (2023-10-13)


### Bug Fixes

* **user:** fixed bug in get user profile query ([43a79a3](https://github.com/jobstash/middleware/commit/43a79a34a72ab0b13d4594d8e66e67864a8ac6a4))

# [1.39.0](https://github.com/jobstash/middleware/compare/v1.38.0...v1.39.0) (2023-10-12)


### Features

* **users:** implemented update user profile endpoint ([a98a2dc](https://github.com/jobstash/middleware/commit/a98a2dcc48a86f33a3b67435ea3fc93aa6546aa6))

# [1.38.0](https://github.com/jobstash/middleware/compare/v1.37.34...v1.38.0) (2023-10-12)


### Features

* **users:** implemented fetch user profile endpoint ([daf9102](https://github.com/jobstash/middleware/commit/daf910275d844ba57e829d8e6fe64c307aab51d2))

## [1.37.34](https://github.com/jobstash/middleware/compare/v1.37.33...v1.37.34) (2023-10-12)


### Bug Fixes

* **github:** fixed bug in github auth flow ([b927529](https://github.com/jobstash/middleware/commit/b927529095c6018eaa5049ae1296014b3301e19a))

## [1.37.33](https://github.com/jobstash/middleware/compare/v1.37.32...v1.37.33) (2023-10-12)


### Bug Fixes

* **github:** fixed issue with github auth ([d94e241](https://github.com/jobstash/middleware/commit/d94e24144ac402d30a243d85e9d92a35391bffc2))
* **tags:** overhauled tags data models to a more flexible architecture ([#131](https://github.com/jobstash/middleware/issues/131)) ([743c3b2](https://github.com/jobstash/middleware/commit/743c3b21e5581a69fc7e8c7d40c93fcd033e42cd))

## [1.37.32](https://github.com/jobstash/middleware/compare/v1.37.31...v1.37.32) (2023-10-12)


### Bug Fixes

* fixed some bugs ([c85c61a](https://github.com/jobstash/middleware/commit/c85c61a95a61f251b920d8915ed25dad7af14a13))

## [1.37.31](https://github.com/jobstash/middleware/compare/v1.37.30...v1.37.31) (2023-10-11)


### Bug Fixes

* fixed error with funding round validation ([8b3f85a](https://github.com/jobstash/middleware/commit/8b3f85a113021f1131f740cd33d5efdd7eaac642))

## [1.37.30](https://github.com/jobstash/middleware/compare/v1.37.29...v1.37.30) (2023-10-10)


### Bug Fixes

* removed validation for redundant ([c4fd007](https://github.com/jobstash/middleware/commit/c4fd007c500d8ce74809e5582577451e83a7ff47))

## [1.37.29](https://github.com/jobstash/middleware/compare/v1.37.28...v1.37.29) (2023-10-10)


### Bug Fixes

* **tags:** fixed bug with create preferred terms endpoint ([77ca748](https://github.com/jobstash/middleware/commit/77ca748b42eb672555d1dc69e75929b059c09646))

## [1.37.28](https://github.com/jobstash/middleware/compare/v1.37.27...v1.37.28) (2023-10-10)


### Bug Fixes

* **tags:** fixed bug in create preferred tag endpoint body. ([62eac6c](https://github.com/jobstash/middleware/commit/62eac6c8769cf1716243438f7771f6ac9d817f60))

## [1.37.27](https://github.com/jobstash/middleware/compare/v1.37.26...v1.37.27) (2023-10-10)


### Bug Fixes

* removed redundant data from jobs list results ([2c57e9b](https://github.com/jobstash/middleware/commit/2c57e9be148b72eb815819fe09b5ff944afc7a36))

## [1.37.26](https://github.com/jobstash/middleware/compare/v1.37.25...v1.37.26) (2023-10-09)


### Bug Fixes

* removed redundant investors data ([7d2054a](https://github.com/jobstash/middleware/commit/7d2054af5957f323e5bcaeb51b3ca16d0506b524))

## [1.37.25](https://github.com/jobstash/middleware/compare/v1.37.24...v1.37.25) (2023-10-09)


### Bug Fixes

* **funding rounds:** fixed updatedTimestamp bug ([9a5cb01](https://github.com/jobstash/middleware/commit/9a5cb014ca9075bfd325b89000d2902e7b56de7c))

## [1.37.24](https://github.com/jobstash/middleware/compare/v1.37.23...v1.37.24) (2023-10-09)


### Bug Fixes

* fixed some bugs in the mw services and tests ([73d35de](https://github.com/jobstash/middleware/commit/73d35de61709bb1fcebceb5f12d3031a04ec240b))

## [1.37.23](https://github.com/jobstash/middleware/compare/v1.37.22...v1.37.23) (2023-10-09)


### Bug Fixes

* **filters:** fixed the queries for filter configs ([3f1c12d](https://github.com/jobstash/middleware/commit/3f1c12dee694c76b4f0288e8cae215d81562a17f))

## [1.37.22](https://github.com/jobstash/middleware/compare/v1.37.21...v1.37.22) (2023-10-09)


### Bug Fixes

* fixed data leak on investors interfaces ([dd4abc2](https://github.com/jobstash/middleware/commit/dd4abc29fea5495a29211df338756fba0e323c0d))

## [1.37.21](https://github.com/jobstash/middleware/compare/v1.37.20...v1.37.21) (2023-10-07)


### Bug Fixes

* fixed bugs with projects, orgs and jobs endpoints ([2d80017](https://github.com/jobstash/middleware/commit/2d80017dbb7941b8299c5e41b7a5eddef460cc21))

## [1.37.20](https://github.com/jobstash/middleware/compare/v1.37.19...v1.37.20) (2023-10-05)


### Bug Fixes

* **jobs:** restored description field for jobposts ([2e74440](https://github.com/jobstash/middleware/commit/2e74440b4d43cd4b18896aa1e5cf11938e50ea67))

## [1.37.19](https://github.com/jobstash/middleware/compare/v1.37.18...v1.37.19) (2023-10-05)


### Bug Fixes

* **jobs:** fixed borkage with jobs list ([a592dc1](https://github.com/jobstash/middleware/commit/a592dc1672b4f4efd5e081500768086cb4c5fb85))
* **projects:** fixed bugs with projects endpoints ([199e502](https://github.com/jobstash/middleware/commit/199e50258dfb14a5a915760f39e8c8d97fb3a878))

## [1.37.18](https://github.com/jobstash/middleware/compare/v1.37.17...v1.37.18) (2023-10-04)


### Bug Fixes

* fixed bugs on orgs and jobs lists ([3007477](https://github.com/jobstash/middleware/commit/300747798f73e7cd2374d445676c21365993a6b4))

## [1.37.17](https://github.com/jobstash/middleware/compare/v1.37.16...v1.37.17) (2023-10-04)


### Bug Fixes

* fixed project details bug ([2c9abaa](https://github.com/jobstash/middleware/commit/2c9abaae8c620ba2a32a9a062e75f91de06034db))

## [1.37.16](https://github.com/jobstash/middleware/compare/v1.37.15...v1.37.16) (2023-10-04)


### Bug Fixes

* fixed yet another bug with project details query ([df85c96](https://github.com/jobstash/middleware/commit/df85c96a3f81717568d698e8c470596cbca58e13))

## [1.37.15](https://github.com/jobstash/middleware/compare/v1.37.14...v1.37.15) (2023-10-04)


### Bug Fixes

* fixed org list isMainnet bug ([db9f670](https://github.com/jobstash/middleware/commit/db9f6707c4646e565088fd2b935a1d810cea9e0f))

## [1.37.14](https://github.com/jobstash/middleware/compare/v1.37.13...v1.37.14) (2023-10-04)


### Bug Fixes

* fixed bug with project details ([58228f9](https://github.com/jobstash/middleware/commit/58228f9d68d0f5fb80d60e839a5791fab00c3053))

## [1.37.13](https://github.com/jobstash/middleware/compare/v1.37.12...v1.37.13) (2023-10-03)


### Bug Fixes

* fixed projects list interface ([84c3fd3](https://github.com/jobstash/middleware/commit/84c3fd3a6e6a848decbe8190cdbd60f293af8185))

## [1.37.12](https://github.com/jobstash/middleware/compare/v1.37.11...v1.37.12) (2023-10-03)


### Bug Fixes

* **projects:** fixed some bugs on projects ([b42a3ab](https://github.com/jobstash/middleware/commit/b42a3ab9acb7f19153b276bbe226503a2c62f90f))

## [1.37.11](https://github.com/jobstash/middleware/compare/v1.37.10...v1.37.11) (2023-10-03)


### Bug Fixes

* fixed some interface bugs ([8074f54](https://github.com/jobstash/middleware/commit/8074f544a50cbbaf29727d5c99ba704960cf6d46))

## [1.37.10](https://github.com/jobstash/middleware/compare/v1.37.9...v1.37.10) (2023-10-02)


### Bug Fixes

* **models:** refactored models to follow new query structure and fixed some bugs ([081f83f](https://github.com/jobstash/middleware/commit/081f83f10e19683fa91ff35609f603c91d6f7050))

## [1.37.9](https://github.com/jobstash/middleware/compare/v1.37.8...v1.37.9) (2023-10-02)


### Bug Fixes

* **techs:** fixed issues with tech queries and service calls ([03b66c3](https://github.com/jobstash/middleware/commit/03b66c356d6f348cac0c11eddeefce417611fe89))

## [1.37.8](https://github.com/jobstash/middleware/compare/v1.37.7...v1.37.8) (2023-09-29)


### Bug Fixes

* **jobs:** fixed issues with jobs endpoints queries ([715c34c](https://github.com/jobstash/middleware/commit/715c34c6c3f3e9929c9cfc4087ef5a50e7ea846a))
* **projects:** fixed issues with projects queries ([86129af](https://github.com/jobstash/middleware/commit/86129af6770ebc1dbd46cfca047ce7577a773078))

## [1.37.7](https://github.com/jobstash/middleware/compare/v1.37.6...v1.37.7) (2023-09-25)


### Bug Fixes

* add return clause for paired terms endpoint ([cd9a711](https://github.com/jobstash/middleware/commit/cd9a71142e350c7df6ad8653c19f190000f7f329))

## [1.37.6](https://github.com/jobstash/middleware/compare/v1.37.5...v1.37.6) (2023-09-25)


### Bug Fixes

* **technologies:** fixed create paired terms bug ([e954149](https://github.com/jobstash/middleware/commit/e95414943e5aa2de5c509c4b36a1388248c35ee9))

## [1.37.5](https://github.com/jobstash/middleware/compare/v1.37.4...v1.37.5) (2023-09-25)


### Bug Fixes

* **technologies:** fixed bugs in create blocked and paired terms endpoints ([098704b](https://github.com/jobstash/middleware/commit/098704bfec3202292d6673b58e14e119ba6076c5))

## [1.37.4](https://github.com/jobstash/middleware/compare/v1.37.3...v1.37.4) (2023-09-20)


### Bug Fixes

* **projects:** fixed isMainnet nullable bug ([daaadce](https://github.com/jobstash/middleware/commit/daaadce40d26d20a863668c037fa5c716bcdfb6c))

## [1.37.3](https://github.com/jobstash/middleware/compare/v1.37.2...v1.37.3) (2023-09-12)


### Bug Fixes

* temp disable db name test ([fb135ba](https://github.com/jobstash/middleware/commit/fb135baa13cc95efe7cd11f6429509e0de443a6f))

## [1.37.2](https://github.com/jobstash/middleware/compare/v1.37.1...v1.37.2) (2023-08-17)


### Bug Fixes

* **jobs:** fixed bug in get org jobs ([a9490ab](https://github.com/jobstash/middleware/commit/a9490abb5bbb4c084421756158abecc347181798))

## [1.37.1](https://github.com/jobstash/middleware/compare/v1.37.0...v1.37.1) (2023-08-17)


### Bug Fixes

* **jobs:** refactored org jobs getter endpoint to use orgid ([25ddd45](https://github.com/jobstash/middleware/commit/25ddd45aa33cf3fd4f820d4e9477775ceb21ec38))

# [1.37.0](https://github.com/jobstash/middleware/compare/v1.36.3...v1.37.0) (2023-07-18)


### Features

* **SIWE:** implemented update flow endpoint ([#125](https://github.com/jobstash/middleware/issues/125)) ([8a3ef74](https://github.com/jobstash/middleware/commit/8a3ef74cd595170f0cac057920084faa9ad5995d))

## [1.36.3](https://github.com/jobstash/middleware/compare/v1.36.2...v1.36.3) (2023-07-12)


### Bug Fixes

* **projects:** refactored project default sort params ([#122](https://github.com/jobstash/middleware/issues/122)) ([11b38bd](https://github.com/jobstash/middleware/commit/11b38bd089d989a38858205824f8bf668fd484dc)), closes [#118](https://github.com/jobstash/middleware/issues/118) [#118](https://github.com/jobstash/middleware/issues/118) [#120](https://github.com/jobstash/middleware/issues/120) [#120](https://github.com/jobstash/middleware/issues/120) [#118](https://github.com/jobstash/middleware/issues/118) [#120](https://github.com/jobstash/middleware/issues/120) [#120](https://github.com/jobstash/middleware/issues/120) [#119](https://github.com/jobstash/middleware/issues/119) [#118](https://github.com/jobstash/middleware/issues/118) [#120](https://github.com/jobstash/middleware/issues/120) [#120](https://github.com/jobstash/middleware/issues/120)

## [1.36.2](https://github.com/jobstash/middleware/compare/v1.36.1...v1.36.2) (2023-07-11)


### Bug Fixes

* **middleware:** fixed sorting on org and project lists ([7090a0a](https://github.com/jobstash/middleware/commit/7090a0a57ab273d0570f53c7276fe5649ad589d8))

## [1.36.1](https://github.com/jobstash/middleware/compare/v1.36.0...v1.36.1) (2023-07-11)


### Bug Fixes

* **projects:** refactored project default sort params ([6ad57e5](https://github.com/jobstash/middleware/commit/6ad57e513d6bf09ab7d2445b1070d6b2f815bbac))

# [1.36.0](https://github.com/jobstash/middleware/compare/v1.35.1...v1.36.0) (2023-07-11)


### Bug Fixes

* **audits:** refactored audits filter to be multi select with search ([#120](https://github.com/jobstash/middleware/issues/120)) ([ac66f6f](https://github.com/jobstash/middleware/commit/ac66f6f5f0dda682099007f7c21fbbd2c274281a))
* **orgs:** fixed bugs in tests ([e4e1fe8](https://github.com/jobstash/middleware/commit/e4e1fe86bb5237c9e4b1b3b17ba4cc4b66d132f9))
* **projects:** fixed bugs on project related functionality ([9ef545b](https://github.com/jobstash/middleware/commit/9ef545b889bdd88110ee9e30a1ca28a4d8d48699))
* **projects:** removed categories prop and refactored category prop to use data from ProjectCategory node ([48c4fc9](https://github.com/jobstash/middleware/commit/48c4fc9e25ad4a67bbd297ecebffde02c83b4228))
* **projects:** removed categories prop and refactored category prop to use data from ProjectCategory node ([#119](https://github.com/jobstash/middleware/issues/119)) ([4140f24](https://github.com/jobstash/middleware/commit/4140f240271f9c22ecd92856fbf214629377c75a)), closes [#118](https://github.com/jobstash/middleware/issues/118) [#120](https://github.com/jobstash/middleware/issues/120) [#120](https://github.com/jobstash/middleware/issues/120)


### Features

* **projects:** projects list refactor ([88452d8](https://github.com/jobstash/middleware/commit/88452d84a94e7e78b4c0bea7937415ec8959f875))

## [1.35.1](https://github.com/jobstash/middleware/compare/v1.35.0...v1.35.1) (2023-07-10)


### Bug Fixes

* **audits:** refactored audits filter to be multi select with search ([#120](https://github.com/jobstash/middleware/issues/120)) ([0d7c200](https://github.com/jobstash/middleware/commit/0d7c200410ae2a0c58534d375bb4d11cb9094d09))

# [1.35.0](https://github.com/jobstash/middleware/compare/v1.34.1...v1.35.0) (2023-07-09)


### Features

* **projects:** projects list refactor ([#118](https://github.com/jobstash/middleware/issues/118)) ([a418da8](https://github.com/jobstash/middleware/commit/a418da842bf4d224154ffe297574d5646e7e10ba))

## [1.34.1](https://github.com/jobstash/middleware/compare/v1.34.0...v1.34.1) (2023-07-06)


### Bug Fixes

* **jobs:** fixed issue with job details endpoint not returning org headCount ([803dd01](https://github.com/jobstash/middleware/commit/803dd015a722e364378d3a830c2cbe9bf4abaace))

# [1.34.0](https://github.com/jobstash/middleware/compare/v1.33.1...v1.34.0) (2023-07-05)


### Features

* **public:** added swagger bearer auth support ([4888184](https://github.com/jobstash/middleware/commit/488818465f6bdfd4ac6868808af67e731633ab60))

## [1.33.1](https://github.com/jobstash/middleware/compare/v1.33.0...v1.33.1) (2023-07-04)


### Bug Fixes

* **public:** some light renaming ([2f344f9](https://github.com/jobstash/middleware/commit/2f344f9f4b9e6ab64920cd8077fe182cc9099116))

# [1.33.0](https://github.com/jobstash/middleware/compare/v1.32.4...v1.33.0) (2023-07-04)


### Features

* **public:** implemented endpoint for public use protected by api key ([b63bfd4](https://github.com/jobstash/middleware/commit/b63bfd417fd92884bba143011352cb05ecb15db3))

## [1.32.4](https://github.com/jobstash/middleware/compare/v1.32.3...v1.32.4) (2023-07-04)


### Bug Fixes

* **jobs:** fixed org logo discrepancies ([ac0fc68](https://github.com/jobstash/middleware/commit/ac0fc683a1e80bb426bdd9adf3753ad085e4fe55))

## [1.32.3](https://github.com/jobstash/middleware/compare/v1.32.2...v1.32.3) (2023-07-04)


### Bug Fixes

* **projects:** fixed bugs in list interface entities ([3d65cd2](https://github.com/jobstash/middleware/commit/3d65cd24f28540c5a24625f7055e2b7ebde53ce9))

## [1.32.2](https://github.com/jobstash/middleware/compare/v1.32.1...v1.32.2) (2023-07-04)


### Bug Fixes

* **jobs:** fixed automagic nulls for project and org logos ([80f0d78](https://github.com/jobstash/middleware/commit/80f0d7888c26162d4a086845665eebe2345cf00a))

## [1.32.1](https://github.com/jobstash/middleware/compare/v1.32.0...v1.32.1) (2023-07-03)


### Bug Fixes

* **jobs:** modified cache validation step to make more sense ([c4d85e7](https://github.com/jobstash/middleware/commit/c4d85e7ed434affe80c00ed501013c2a76cf8a40))

# [1.32.0](https://github.com/jobstash/middleware/compare/v1.31.2...v1.32.0) (2023-07-03)


### Features

* **jobs:** added dirty node checker for cache mgt ([b7250ec](https://github.com/jobstash/middleware/commit/b7250ec7a264446724dcab00e3ac4a0cb216bb8b))

## [1.31.2](https://github.com/jobstash/middleware/compare/v1.31.1...v1.31.2) (2023-06-30)


### Bug Fixes

* **projects:** fixed bug with filter config presets ([8e0ee0c](https://github.com/jobstash/middleware/commit/8e0ee0c013f35f795f896aff2aefa6a3622659fe))

## [1.31.1](https://github.com/jobstash/middleware/compare/v1.31.0...v1.31.1) (2023-06-30)


### Bug Fixes

* **jobs:** refactored stepsize to prefix ([e6f5493](https://github.com/jobstash/middleware/commit/e6f54934b10cbbeaf4df8820fc99ef45016173b5))

# [1.31.0](https://github.com/jobstash/middleware/compare/v1.30.5...v1.31.0) (2023-06-30)


### Features

* **jobs:** added projects to search corpus ([1d71f7f](https://github.com/jobstash/middleware/commit/1d71f7f23c3fc4b927243c7c2f886a78dd6ce2f1))

## [1.30.5](https://github.com/jobstash/middleware/compare/v1.30.4...v1.30.5) (2023-06-30)


### Bug Fixes

* **middleware:** fixed audits interface ([f61fd81](https://github.com/jobstash/middleware/commit/f61fd8175ce552aa3476b0e8e4281af45c19ebd1))

## [1.30.4](https://github.com/jobstash/middleware/compare/v1.30.3...v1.30.4) (2023-06-29)


### Bug Fixes

* **middleware:** fixed some bugs ([#109](https://github.com/jobstash/middleware/issues/109)) ([1a5c287](https://github.com/jobstash/middleware/commit/1a5c2873c366517ecf60d44c3a8dcf58b18392f2))

## [1.30.3](https://github.com/jobstash/middleware/compare/v1.30.2...v1.30.3) (2023-06-28)


### Bug Fixes

* **interface:** change date interface from string to number ([333be00](https://github.com/jobstash/middleware/commit/333be006aa89ca216c967e5862093b4f0100be66))

## [1.30.2](https://github.com/jobstash/middleware/compare/v1.30.1...v1.30.2) (2023-06-28)


### Bug Fixes

* **jobs:** fixed min filters ([b32cb45](https://github.com/jobstash/middleware/commit/b32cb4533acf467de16a466e80da5131e788f037))

## [1.30.1](https://github.com/jobstash/middleware/compare/v1.30.0...v1.30.1) (2023-06-28)


### Bug Fixes

* **orgs:** added job status filters to orgs queries ([ffc1990](https://github.com/jobstash/middleware/commit/ffc1990dac3d8e931628ca5ecf9e4de005f45105))

# [1.30.0](https://github.com/jobstash/middleware/compare/v1.29.5...v1.30.0) (2023-06-26)


### Features

* **jobs:** added caching for projects data ([#106](https://github.com/jobstash/middleware/issues/106)) ([580e49c](https://github.com/jobstash/middleware/commit/580e49c316039145a36549c9833171bb8929c6d8))

## [1.29.5](https://github.com/jobstash/middleware/compare/v1.29.4...v1.29.5) (2023-06-23)


### Bug Fixes

* **helpers:** removed support for project based sorters on jobs list ([83fe425](https://github.com/jobstash/middleware/commit/83fe42516d9da72cb2c2111ab2ab913f3e51ab76))
* **jobs:** fix for hacks and audits causing dupes wip ([d2ca9af](https://github.com/jobstash/middleware/commit/d2ca9af6f38041a85a9b9448ab50181cc1d77138))
* **jobs:** unbork hacks and audits integration wip ([7053354](https://github.com/jobstash/middleware/commit/70533547d418a459c10ec4dc097531537a3666e4))
* **orgs:** fixed issue with org details ([7b84901](https://github.com/jobstash/middleware/commit/7b84901d72b3e971fcc15e45bfa24d5256e85d7d))
* **projects:** fix for projects to prevent dupes by hacks and audits ([79a5e18](https://github.com/jobstash/middleware/commit/79a5e18a892347955bf0057d93f8d8735d7b391d))

## [1.29.4](https://github.com/jobstash/middleware/compare/v1.29.3...v1.29.4) (2023-06-22)


### Reverts

* Revert "Fix/unbork-hacks-and-audits-wip (#99)" (#100) ([343f551](https://github.com/jobstash/middleware/commit/343f5511563d5ac1146059d49d40bbb86687d191)), closes [#99](https://github.com/jobstash/middleware/issues/99) [#100](https://github.com/jobstash/middleware/issues/100)

## [1.29.3](https://github.com/jobstash/middleware/compare/v1.29.2...v1.29.3) (2023-06-20)


### Bug Fixes

* **jobs:** add jobstatus filter to all jobs related queries ([c651a75](https://github.com/jobstash/middleware/commit/c651a75c3b10fa2f3116a09908d8754d506b3d7d))

## [1.29.2](https://github.com/jobstash/middleware/compare/v1.29.1...v1.29.2) (2023-06-14)


### Bug Fixes

* **jobs:** added automagic converter for numbers in jobs list result interface from neo object number type to JS number ([bf7bf30](https://github.com/jobstash/middleware/commit/bf7bf303145a8a83cfdbef2e69eebc8d89b1f5d5))

## [1.29.1](https://github.com/jobstash/middleware/compare/v1.29.0...v1.29.1) (2023-06-09)


### Bug Fixes

* **cd:** fixed version ref ([fb82c80](https://github.com/jobstash/middleware/commit/fb82c801d9d2adb911058907609f38bc5a3257f3))

# [1.29.0](https://github.com/jobstash/middleware/compare/v1.28.17...v1.29.0) (2023-06-08)


### Features

* **organizations:** implement user facing orgs list ([#93](https://github.com/jobstash/middleware/issues/93)) ([594561e](https://github.com/jobstash/middleware/commit/594561ee6353e91ebfe3d71570095d519fe1379b)), closes [#92](https://github.com/jobstash/middleware/issues/92) [#92](https://github.com/jobstash/middleware/issues/92)

## [1.28.17](https://github.com/jobstash/middleware/compare/v1.28.16...v1.28.17) (2023-06-08)


### Bug Fixes

* **neoconfig:** add db config everywhere ([b564dcf](https://github.com/jobstash/middleware/commit/b564dcf4fc55b0b50f6812a90267d6b05445c25f))

## [1.28.16](https://github.com/jobstash/middleware/compare/v1.28.15...v1.28.16) (2023-06-08)


### Bug Fixes

* **ci:** add database variable in ci config ([1be7746](https://github.com/jobstash/middleware/commit/1be77460a60f2205e4f00cdcf4c5d8fa43661fae))

## [1.28.15](https://github.com/jobstash/middleware/compare/v1.28.14...v1.28.15) (2023-06-07)


### Bug Fixes

* **jobs:** fixed nuked sorting for funding rounds ([#92](https://github.com/jobstash/middleware/issues/92)) ([a8a32ba](https://github.com/jobstash/middleware/commit/a8a32bab369b13832ee747b0f83ff825e2fb2022))


## [1.28.14](https://github.com/jobstash/middleware/compare/v1.28.13...v1.28.14) (2023-06-02)


### Bug Fixes

* **filters:** fixed bug introduced by prev fix ([8a6beba](https://github.com/jobstash/middleware/commit/8a6beba5a557c846d4b1d96c20ca4d9f32e10942))

## [1.28.13](https://github.com/jobstash/middleware/compare/v1.28.12...v1.28.13) (2023-06-02)


### Bug Fixes

* **jobs:** fixed bug with funding rounds that have no investors ([1164bc4](https://github.com/jobstash/middleware/commit/1164bc453d7160ca695aad19c3932a687dea4557))


## [1.28.12](https://github.com/jobstash/middleware/compare/v1.28.11...v1.28.12) (2023-05-29)


### Bug Fixes

* **async:** Fix async issue ([a5c31f7](https://github.com/jobstash/middleware/commit/a5c31f7b1fd07e19c9bf7efd6487ba2629791a92))

## [1.28.11](https://github.com/jobstash/middleware/compare/v1.28.10...v1.28.11) (2023-05-18)


### Bug Fixes

* **jobs:** fixed bug in jobs sorter ([0bdb022](https://github.com/jobstash/middleware/commit/0bdb022a3367ade131b7f8c2dc7d7de157ed9619))

## [1.28.10](https://github.com/jobstash/middleware/compare/v1.28.9...v1.28.10) (2023-05-13)


### Bug Fixes

* **query:** unfuck query ([4411b7d](https://github.com/jobstash/middleware/commit/4411b7d14f466295b51e21b9e31b2eb9c9c8ee89))

## [1.28.9](https://github.com/jobstash/middleware/compare/v1.28.8...v1.28.9) (2023-05-13)


### Bug Fixes

* **listquery:** include active status jobs only ([045295d](https://github.com/jobstash/middleware/commit/045295d1148161c95974d0f5f89d030bdc36da98))

## [1.28.8](https://github.com/jobstash/middleware/compare/v1.28.7...v1.28.8) (2023-05-13)


### Bug Fixes

* **casing:** Change casing of props ([f011abf](https://github.com/jobstash/middleware/commit/f011abfc131661fa6cfb9d877e83f5430dc495f9))

## [1.28.7](https://github.com/jobstash/middleware/compare/v1.28.6...v1.28.7) (2023-05-13)


### Bug Fixes

* **jobs:** implemented workaround for neo4j bug to fix error with getting jobs list ([07f5f2f](https://github.com/jobstash/middleware/commit/07f5f2f399652e5768953e04827304697d42a0b0))

## [1.28.6](https://github.com/jobstash/middleware/compare/v1.28.5...v1.28.6) (2023-05-12)


### Bug Fixes

* **jobs:** fixed duplication of jobs by project ([9689241](https://github.com/jobstash/middleware/commit/968924177da269427f6c8649fb33799111bfe32a))

## [1.28.5](https://github.com/jobstash/middleware/compare/v1.28.4...v1.28.5) (2023-05-12)


### Bug Fixes

* **jobs:** fixed issue with duplicated job posts due to multiple projects ([1b1e6f2](https://github.com/jobstash/middleware/commit/1b1e6f274a9820824bd66c6e3c3cbe5658ef46ea))

## [1.28.4](https://github.com/jobstash/middleware/compare/v1.28.3...v1.28.4) (2023-05-12)


### Bug Fixes

* **jobs:** fixed second chains filter ([25f33f1](https://github.com/jobstash/middleware/commit/25f33f1ec4049618db1db7e97c55325b3208aedc))

## [1.28.3](https://github.com/jobstash/middleware/compare/v1.28.2...v1.28.3) (2023-05-11)


### Bug Fixes

* **jobs:** fixed filter issue by refactoring multiselect filters to use base64 encoding for parsing values. ([167acd2](https://github.com/jobstash/middleware/commit/167acd212e7e8c9e40d12e01b9f9376595640445))

## [1.28.2](https://github.com/jobstash/middleware/compare/v1.28.1...v1.28.2) (2023-05-11)


### Bug Fixes

* **jobs:** fixed seniority filter bug ([#80](https://github.com/jobstash/middleware/issues/80)) ([af26025](https://github.com/jobstash/middleware/commit/af2602528ce76b70b6a87c44e2634427d4df130e))

## [1.28.1](https://github.com/jobstash/middleware/compare/v1.28.0...v1.28.1) (2023-05-10)


### Bug Fixes

* **filters:** typo in collect ([3850668](https://github.com/jobstash/middleware/commit/38506684cb5d811f9466155936a767c1ede681f2))

# [1.28.0](https://github.com/jobstash/middleware/compare/v1.27.1...v1.28.0) (2023-05-10)


### Bug Fixes

* **organizations:** fixed issue with short orgs not returning new links data ([#75](https://github.com/jobstash/middleware/issues/75)) ([7f027c7](https://github.com/jobstash/middleware/commit/7f027c7c64fd6d9329c2ec3aeb53e217e530da2f))


### Features

* **jobs:** added investor filter for jobs list ([#76](https://github.com/jobstash/middleware/issues/76)) ([7758d93](https://github.com/jobstash/middleware/commit/7758d93fb4ac2de391b89c8975e4d6e587969638))

## [1.27.1](https://github.com/jobstash/middleware/compare/v1.27.0...v1.27.1) (2023-05-09)


### Bug Fixes

* **linter:** fixed linter issues ([4aaeaf9](https://github.com/jobstash/middleware/commit/4aaeaf9854ab880a85f61d487a1516a24f576ab8))
* **linter:** temp fix ([f4c858d](https://github.com/jobstash/middleware/commit/f4c858dc2643eb16ce324e283580e8ca9b1f3275))
* **orgs.service:** fixed bug with name search ([b331b31](https://github.com/jobstash/middleware/commit/b331b31d192f5afb609dccf11e344b64132a9882))
* **siwe:** fixed build issue with ethers ([c7b758f](https://github.com/jobstash/middleware/commit/c7b758f3c9d95a4b1db074695a348901bf22c95b))

# [1.27.0](https://github.com/jobstash/middleware/compare/v1.26.1...v1.27.0) (2023-05-05)


### Features

* **swagger:** added auth for swagger ([002995f](https://github.com/jobstash/middleware/commit/002995f62fa54302c2aae8c68eaa0a23e3d691b2))

## [1.26.1](https://github.com/jobstash/middleware/compare/v1.26.0...v1.26.1) (2023-05-02)


### Bug Fixes

* **filter:** Update filter labels to be slightly more compact ([0ca0cc6](https://github.com/jobstash/middleware/commit/0ca0cc6deea206c2e01d5ff0fe3545d6634fd6fb))

# [1.26.0](https://github.com/jobstash/middleware/compare/v1.25.2...v1.26.0) (2023-05-01)


### Features

* **job filters:** implemented sorting for multi search filter configs and refactored default state for step sizes ([#73](https://github.com/jobstash/middleware/issues/73)) ([3a9254e](https://github.com/jobstash/middleware/commit/3a9254e9cc5da7a77e446c61cba3713fdf068bae))

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
