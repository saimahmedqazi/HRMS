# Associate sign-in and registration fields with their visible labels

On the hosted login and registration pages, Chromium reported zero associated labels for all seven inputs. Clicking the visible labels did not identify the intended fields for assistive technology or give the browser autocomplete hints.

Connect each existing label and validation message to its field. Use standard autocomplete attributes and extend the authentication browser tests to check labels, autocomplete, and accessible error descriptions.
