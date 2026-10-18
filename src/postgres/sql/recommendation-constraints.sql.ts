/** Explicit saved constraints narrow every personalized result before ranking. */
export const explicitRecommendationConstraintsSql = `
      AND NOT EXISTS (
        SELECT 1 FROM user_job_preferences explicit WHERE explicit.user_node_id=target_user.id AND (
          (explicit.minimum_salary IS NOT NULL AND
            (document.salary IS NULL OR document.salary<explicit.minimum_salary OR
             document.salary_currency IS DISTINCT FROM COALESCE(explicit.salary_currency,'USD')))
          OR (COALESCE(cardinality(explicit.seniority_levels),0)>0 AND NOT EXISTS(
            SELECT 1 FROM unnest(explicit.seniority_levels) level
            WHERE translate(lower(level),' _-','')=translate(lower(document.seniority),' _-','')))
          OR (COALESCE(cardinality(explicit.commitments),0)>0 AND NOT EXISTS(
            SELECT 1 FROM unnest(explicit.commitments) commitment
            JOIN unnest(document.commitments) available ON slugify_text(available)=slugify_text(commitment)))
          OR (COALESCE(cardinality(explicit.funding_stages),0)>0 AND NOT EXISTS(
            SELECT 1 FROM unnest(explicit.funding_stages) stage
            WHERE slugify_text(stage)=slugify_text(document.current_funding_stage)))
          OR (explicit.company_size_min IS NOT NULL AND (document.headcount_estimate IS NULL OR document.headcount_estimate<explicit.company_size_min))
          OR (explicit.company_size_max IS NOT NULL AND (document.headcount_estimate IS NULL OR document.headcount_estimate>explicit.company_size_max))
        )
      )`;
