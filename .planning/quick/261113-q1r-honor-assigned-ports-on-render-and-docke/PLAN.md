# Honor the assigned web port

The production frontend command fixes the listening port at 3000, overriding the port set by the hosting environment. Remove the explicit flag so Next.js uses PORT and retains 3000 as its local default. Verify the production server responds on a nondefault port. Set the Render API bind address explicitly to match Render's listener requirement.
