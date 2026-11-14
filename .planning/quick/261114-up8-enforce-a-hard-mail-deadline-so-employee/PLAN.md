# Bound the onboarding mail wait

Hosted onboarding committed the employee and then returned a gateway error after waiting about two minutes. Railway logged a mail connection timeout for both test attempts. The application awaited the provider's promise after the employee transaction and relied on the provider honoring cancellation.

Enforce an eight-second deadline in MailService independently of transport cancellation. Preserve the existing acceptance result so onboarding can return the temporary credentials with its usual email status. Exercise an actual stalled SMTP socket and a never-settling HTTPS provider, then retest onboarding through Vercel after deployment.
