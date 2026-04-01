# DesignCampaign — Claude Instructions

## PR Reviews

When reviewing a pull request, always check CI build results as part of the review:

1. Run `gh pr checks <number>` to see the status of all CI jobs.
2. If any checks are failing, run `gh run view <run-id> --log-failed` to read the failure output.
3. Include a **CI status** section in the review that summarises passing/failing jobs and diagnoses any failures.
4. Do not approve or mark a PR ready if CI is failing — diagnose the failure first.
