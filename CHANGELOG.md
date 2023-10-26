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
