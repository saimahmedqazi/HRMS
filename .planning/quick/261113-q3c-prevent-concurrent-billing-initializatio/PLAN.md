# Prevent concurrent billing initialization failures

Two requests can both see a missing subscription and race on the unique company ID. Use a conflict-safe insert and return the persisted record. Test both an initial insert and a request that loses the race.
