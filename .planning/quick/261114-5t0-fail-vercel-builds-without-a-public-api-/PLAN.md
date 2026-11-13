# Validate the Vercel API setting

The live Vercel deployment serves the login page but its API rewrite returns DNS_HOSTNAME_RESOLVED_PRIVATE. Require an explicit HTTPS API origin on Vercel and reject local hostnames there. Keep the existing local default for other builds.
