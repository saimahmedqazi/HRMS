# Persist cleared optional organization profile fields

Medium severity. Set an organization phone number, clear it in Settings, and save. The UI omitted the empty phone and showed success even though the previous value remained. The industry and size placeholders were also sent as real values when their stored fields were unset.

Send null for optional fields that changed to empty and omit unchanged fields. Use placeholders only as hints. Wait for the organization profile before allowing edits and associate labels with their fields. Verify the outgoing patch and the persisted profile after reloading.
