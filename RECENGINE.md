# Rec Engine Spec

This is a barebones spec for what the JobStash job recommendation engine will look like. It is meant to be a best in class recommendation engine, combining a variety of techniques to provide near perfect job recommendations to candidates to improve the quality of inbound applications to orgs and help give candidates their best shot at finding the right roles for them. The goal is to reduce the time it takes for candidates to find great roles for them.

## Data we have

### User Profile

1. location
   1. city: where they are -> strong
   2. country: where they are -> mid
2. work history
   1. github
      1. name: name of the github org -> strong
      2. login: github login that relates to the org on record -> strong
      3. description: brief description of the org -> mid
      4. tenure: how long they worked there, lends to how much likely it is they prefer this org type -> mid/weak
   2. email: signals past affiliation with an org, users can be asked to specify what direction to weigh this with for recs -> strong
   3. cv
      1. job title: low hanging fruit for fuzzy match to jobs -> mid/strong
      2. location: location inference by recencym, fallback/preset for explicit location -> mid/strong
      3. seniority: seniority inference by recency, fallback/preset for explicit seniority -> mid/strong
      4. tenure: how long they worked there, lends to how much likely it is they prefer this org type, and cumulative years of experience -> mid/weak
      5. company name: signals past affiliation with an org, users can be asked to specify what direction to weigh this with for recs -> strong
      6. education level: lends to education level, fallback/preset for explicit education -> mid/strong
      7. role description: broader signals for what skills and capabilities they have -> mid/strong
   4. funding rounds (inferred from cumulative work history)
   5. head counts (...)
   6. industry (...)
3. repositories (work history/adjacent/special)
   1. name: name of the repo which might contain some skill hints -> mid/weak
   2. description: more skill hints -> mid/weak
   3. stars: lends to user experience level, weighted by commitCount -> mid
   4. commitsCount: lends to user relative importance to the org -> strong
   5. tags/skills: skill hints -> mid
   6. lastContributedAt: lends to currency/freshness of the skills used -> weak
4. ecosystem activations
   1. name: indicates ecosystem/org ties -> strong
   2. network: indicates familiarity and experience within a chain or ecosystem -> mid
5. crypto alignment
   1. crypto native status: lends to concrete crypto experience, lever for web3 beginner jobs or no -> strong
   2. crypto adjacent status: lends to broader crypto alignment, lever for web3 beginner jobs or no -> mid
6. availability: indicates interest, lever for how aggressively to recommend jobs -> strong

#### Other options for explicit profile enrichment

1. key phrases for what's most important to them in a role -> mid
2. ask them where they'd like to work -> strong
3. ask about visa requirements -> strong
4. ask about natural language proficiency -> mid
5. more granular availability options -> strong
6. role interests by category (optional sub categories for more granular filtering) -> strong
7. ask about seniority level -> strong
8. ask about education level -> strong
9. company size/head count preferences -> mid
10. industry/sector preferences -> strong
11. tech/skill preferences -> strong
12. salary expectations -> strong
13. ask them to link their github projects they'd like to showcase (we can scan these for more data) -> weak
14. ask about funding preferences
15. ask about payment and currency preferences
16. ask about commitment preferences

### Org

1. location
   1. city -> strong
   2. state -> strong
   3. country -> strong
2. public data
   1. oss repositories
      1. name: name of the repo which might contain some hints on skills used -> mid
      2. description: more skill hints -> mid
      3. stars: lends to required user experience level, weighted by commitCount -> mid
      4. commitsCount: lends to maturity of the codebase -> strong
      5. tags/skills: skill hints -> mid
      6. createdAt: lends to legacyness/maturity of the codebase -> strong
   2. other contributors
      1. profile: the full profile of other known contributors, gives a hazy view of an ideal candidate -> mid
         1. we can compare past and present work history to weigh relevance and try to take career progression hints
      2. count: lends to a hazy minima of head count -> mid/weak
      3. churn: lends to a hazy view of churn -> mid/weak
   3. research crawls
      1. docs pages: good source of tech skills and org overview -> strong
      2. summary: lends to sector and technology inference for user preferences -> strong
      3. description: same as summary -> strong
      4. name: tie in for user profiles and work history -> strong
      5. sector: same as summary -> strong
      6. status: don't recommend if dead -> strong
   4. projects
      1. name -> strong
      2. chain: the chain the project is deployed on -> strong
      3. summary: lends to sector and technology inference for user preferences -> strong
      4. description: same as summary -> strong
      5. whitepaper: same as summary -> mid/strong
      6. blog: same as summary -> mid/weak
      7. category: same as summary -> strong
      8. status: more dead projects weigh a company down (maybe) -> mid
   5. funding
      1. investor affiliation: if a good investor funded them then the company is likely a more fiscally lucrative place to work -> mid
      2. cumulative funding: moar cash = good -> strong
      3. funding rounds: user preference levers -> strong
3. jobs
   1. title: tie in for user past work history and explicit role preferences -> strong
   2. seniority: user seniority (explicit/inferred) tie in -> strong
   3. classification: user work history and role interests tie in -> strong
   4. access: expertness tie in -> strong
   5. onboardIntoWeb3: web3 beginner friendliness -> strong
   6. responsibilities: user work history and profile tie in -> strong
   7. salary: user salary expectation tie in -> strong
   8. summary: user work history and profile tie in -> strong
   9. description: same as summary -> strong
   10. culture: a bit hazy and hard to use -> weak
   11. location/location type: user location tie in (city+country/remote|hybrid|onsite) -> strong
   12. pays in crypto/salary currency/token allocation: user payment preference tie in -> strong
   13. commitment: user commitment preferences tie in -> strong
   14. tags: user skills tie in -> strong
   15. other candidates
       1. we could offer a metric like (you're in the top x percentile of candidates that have applied for this)

## Signals we (can) collect

### User

1. jobs viewed (weighted by dwell time) -> weak+
2. jobs viewed details (clicked/scrolled) -> mid+
3. jobs bookmarked/saved -> strong+
4. jobs applied -> strong+
5. jobs dismissed -> mid-
6. company hidden -> strong-

## Core KPI

- CTR@k, ApplyRate@k, SaveRate@k, time-to-first-apply, unsubscribe rate.

## UI ideas

We have a couple UI options we can execute our job board with based on certain pros and cons

1. Tinder style view: recommended jobs are in a stack and users can swipe left or right (users can configure what each gesture means) to perform certain actions on a job card which pops it off the stack, or scroll up or down to view more info on the card. We collect signals based on this format and the user interactions.
   1. Pros:
      1. It's a more constrained UI which means less noisy signals that we can make more assumptions with.
      2. It's a simplified UI that users are already likely familiar with.
      3. Encourages quick decision-making, which can increase engagement and data collection speed.
      4. Easy to gamify or add streaks/achievements for engagement.
      5. Mobile-friendly and touch-optimized by default.
   2. Cons:
      1. It's a more "binary" interaction model, which may oversimplify nuanced user preferences.
      2. Some users may find the format too casual or reminiscent of dating apps, which could impact perceived professionalism.
      3. Not ideal for users who want to compare multiple jobs side-by-side or do in-depth research before acting.
      4. May not scale well for users who want to browse a large number of jobs quickly.
      5. Could lead to accidental dismissals or saves due to gesture misinterpretation.
2. Masonry grid cards layout: a similar layout to the existing vertical list of rectangular cards layout we currently use.
   1. Pros:
      1. It's familiar and more reminiscent of the current UI so it won't be too jarring of a change for users who are used to the current layout.
      2. Less chance of noise from accidental gestures.
      3. More desktop friendly.
      4. Easier to scan and compare multiple jobs at once.
      5. Allows for richer information density per card (e.g., more details, badges, company info).
      6. Supports sorting and filtering controls more naturally.
      7. Better for power users or those who want to do in-depth research.
   2. Cons:
      1. Can be visually overwhelming if there are too many jobs or too much information per card.
      2. May be less engaging or "fun" compared to a swipe-based UI, leading to lower interaction rates.
      3. Harder to optimize for mobile and small screens (scrolling fatigue, less touch-friendly).
      4. Users may skip over jobs quickly without engaging with details, leading to noisier signals.
      5. More difficult to gamify or add streaks/achievements for engagement.
