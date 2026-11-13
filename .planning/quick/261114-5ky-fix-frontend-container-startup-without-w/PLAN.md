# Fix the frontend container entry point

The runtime image copies the frontend package but omits the root workspace manifest. Start the installed Next.js server from the frontend directory, where the runtime image places the build and public assets.
