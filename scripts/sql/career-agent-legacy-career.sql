-- Complete historical attribution without overwriting candidate edits or
-- inventing document excerpts. Run after the three Career Agent migrations.
BEGIN;
WITH missing AS (
 SELECT account.id, jsonb_agg(jsonb_build_object(
   'id',gen_random_uuid(),'kind','role',
   'statement',concat_ws(' · ',NULLIF(role->>'title',''),NULLIF(role->>'company','')),
   'employer',role->>'company','role',role->>'title',
   'startDate',role->>'startDate','endDate',role->>'endDate',
   'source',jsonb_build_object('kind','existing_profile','excerpt',NULL),
   'confirmation','unconfirmed','conflicts','[]'::jsonb
 )) AS evidence
 FROM graph_nodes account JOIN candidate_career_profiles profile ON profile.user_node_id=account.id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(account.properties->'recommendationCareer'->'roles','[]')) role
 WHERE account.label='User' AND NULLIF(btrim(role->>'description'),'') IS NULL
 AND concat_ws(' · ',NULLIF(role->>'title',''),NULLIF(role->>'company',''))<>''
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(profile.evidence) claim WHERE claim->>'role' IS NOT DISTINCT FROM role->>'title' AND claim->>'employer' IS NOT DISTINCT FROM role->>'company')
 GROUP BY account.id
) UPDATE candidate_career_profiles p SET evidence=p.evidence||m.evidence,revision=p.revision+1,updated_at=now() FROM missing m WHERE p.user_node_id=m.id;
UPDATE candidate_career_profiles profile SET evidence=profile.evidence||jsonb_build_array(jsonb_build_object(
 'id',gen_random_uuid(),'kind','qualification','attribute','education_level',
 'statement','Education level: '||(account.properties->'recommendationCareer'->>'educationLevel'),
 'source',jsonb_build_object('kind','existing_profile','excerpt',NULL),
 'confirmation','unconfirmed','conflicts','[]'::jsonb
)),revision=profile.revision+1,updated_at=now()
FROM graph_nodes account WHERE account.id=profile.user_node_id
AND NULLIF(account.properties->'recommendationCareer'->>'educationLevel','') IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(profile.evidence) claim WHERE claim->>'attribute'='education_level');
COMMIT;
