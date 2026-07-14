# Changelog

All notable changes to `sahaj` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Pre-1.0 stability:** while on `0.x`, the API and the sandbox fixtures may
> change between minor versions as the ReBIT models and provider adapters land.
> Pin an exact version if you need stability.

## [Unreleased]

### Added
- Zero-registration sandbox (`mode: "sandbox"`) that runs the whole consent-to-data loop in memory with no keys and no FIU licence.
- Deterministic magic VUAs: `9999999999` (healthy), and suffixes for reject, no-accounts, expire, FIP-down and partial data.
- The one-`await` surface: `consents.create` then `data.fetch`, hiding the poll, session, decrypt and parse steps.
- Typed, parsed DEPOSIT model from the ReBIT deposit schema, with integer-paise money and a `.raw` escape hatch.
- Numbered, typed error taxonomy (`SahajError`) with `type`, `code`, `displayMessage`, `suggestedAction`, `docUrl`, and the reproducing sandbox VUA.
- The `AAAdapter` seam and an in-memory `MockAdapter`, plus `sandbox.approve` / `sandbox.reject` for driving the human step.
- Idempotency keys on consent creation.

This is v0.1, sandbox-only. Real provider adapters (Setu, then Finvu), Python parity,
the remaining FI-type models, the CLI and the MCP server follow in later milestones.
