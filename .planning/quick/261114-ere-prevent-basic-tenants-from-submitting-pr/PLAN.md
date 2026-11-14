# Prevent Basic tenants from submitting Premium assistant prompts

Medium severity. Register a Basic company and open the assistant. The page showed the Premium lock but left chat controls enabled, so a normal submission sent a request and displayed an HTTP 403 error. Employees also saw a link to Billing, which their role cannot use.

Use the subscription feature flag to control prompts and the send action. Distinguish loading, failed, suspended, and Basic access. Show billing controls only to billing administrators and test both the disabled Basic controls and the existing Premium workflow.
