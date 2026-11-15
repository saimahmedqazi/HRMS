# Keep the password reset token out of the form

The reset email already supplies the token. Show only the new password field, remove the token from the active URL after hydration, and direct visitors without a token to request or reopen the link. Verify the browser reset and session revocation flow.
