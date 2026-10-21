# Security Policy

Immich TV for Samsung is an unofficial, read-only Samsung Tizen TV client for Immich. It talks directly from the TV to the Immich server you configure, and has no backend of its own.

## Reporting a vulnerability

Please report security problems privately. Use GitHub's **Report a vulnerability** button on this repository's **Security** tab, which opens a private advisory that only the maintainer can see.

Please don't open a public issue for a security problem.

A useful report includes:

- what the problem is and where it is (file, screen or request);
- steps to reproduce it, ideally against a test or demo Immich server;
- what an attacker could do with it.

Never include real API keys, server addresses, photos or other personal data in a report.

The maintainer will reply as soon as possible and keep you updated while a fix is prepared.

## Scope

In scope:

- the TV app in this repository: how it handles the Immich server URL and API key, the requests it makes, and what it stores on the TV;
- the public website in `website/`.

Out of scope:

- Immich itself. Report those problems to the Immich project.
- Samsung's TV platform and Tizen tooling.

## How credentials are handled

The app stores the Immich server URL and API key in the TV's local storage. It sends the key only to the configured Immich server and never logs it. Anyone with access to the TV's app storage could recover it, so use an Immich API key with only the read access the app needs.
