# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-14

### Added

- Local reading of solar inverters fitted with a Solarman Wi-Fi logger (LSW-3,
  serial numbers 17…, 21…, 23…, 27…, 40…), with the Solarman V5 protocol on
  TCP port 8899: no account, no cloud, read only.
- Models: Deye hybrid single-phase (and Sunsynk, Sol-Ark), Deye hybrid
  three-phase with low- or high-voltage battery, Deye microinverter, Sofar G3,
  Solis single-phase 5G.
- One Gladys device per inverter: solar production (total and per PV input),
  production of the day and production index, grid power (import +, export −),
  grid import and export of the day and their indexes, house consumption and
  its daily total, battery level, charge and discharge power and indexes,
  battery and inverter temperatures, inverter state.
- Energy tab: the grid import index is the consumption Gladys bills; the
  production index feeds the production.
- A "Solar" dashboard widget: production, house, grid exchange, battery,
  production of the day, inverter state.
- Scene triggers: battery full, battery drops to a threshold, inverter fault,
  grid export started, grid export stopped.
- A "Read the inverter status" scene action: a sentence to send and the main
  values as numbers.
- A "Test the connection" action in the configuration.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-solarman/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-solarman/releases/tag/v1.0.0
