# Solarman for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
solar inverters fitted with a **Solarman Wi-Fi logger** (the "LSW-3" stick of
Deye, Sunsynk, Sol-Ark, Sofar, Solis and many others), read over the local
network with the Solarman V5 protocol (TCP port 8899). No account, no cloud,
**read only**.

> **Developed without the hardware: feedback welcome.** Built and tested
> against the published register maps of these inverters, a real exchange
> with a Deye logger (pysolarmanv5 issue #62) and a simulated logger; not
> against a real inverter. Please report what you see on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-solarman/issues).

## Features

- **Models**: Deye hybrid single-phase (SUN-…K-SG0xLP1, Sunsynk, Sol-Ark),
  Deye hybrid three-phase with low-voltage (SG04LP3) or high-voltage (SG01HP3)
  battery, Deye microinverter, Sofar G3 (KTLX-G3), Solis single-phase 5G.
- **One device per inverter**: solar production (total and per PV input),
  production of the day and production index, grid power (import +,
  export −), grid import and export of the day and their indexes, house
  consumption, battery level, charge and discharge power and indexes,
  temperatures, inverter state. A feature exists only if the model has it.
- **Energy tab**: the grid import index is published as the consumption index
  Gladys bills; the production index as production. The house consumption is
  never counted twice.
- **Dashboard widget** "Solar": production, house, grid exchange, battery,
  production of the day, inverter state.
- **Scene triggers**: battery full, battery drops to a threshold (10 to 50 %),
  inverter fault, grid export started, grid export stopped.
- **Scene action** "Read the inverter status": a sentence to send, and the
  main values as numbers.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Solarman logger answering on port 8899 of the local network (logger
  serial numbers 17…, 21…, 23…, 27…, 40…), with a fixed IP address.

## Installation

In Gladys, **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-solarman`. Fill in the logger IP address,
its serial number (10 digits on its label) and the inverter model, run **Test
the connection**, then add the inverter from the **Discovery** tab. The full
user documentation is in [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

- The logger wraps Modbus RTU in a V5 frame (header, logger serial number,
  checksum). The integration keeps one TCP connection to it, sends one request
  at a time (the loggers mix answers up otherwise), answers the heartbeat
  frames of the logger, tolerates the doubled Modbus CRC of some Deye
  firmwares, and reads each model in a few grouped register ranges.
- The container reads by its own timer (30 s by default, 15 s minimum), only
  once the inverter is added in Gladys, and publishes only what changed.
- At night, the logger of an inverter without battery switches off: after
  three silent readings the state says "Not answering" and the solar
  production falls to 0 W. This is written once in the logs, and once when
  the logger is back.
- An energy index is never published lower than the previous one (a logger
  answers 0 for a while after a restart).

## Checked, and what was not

- Checked: the V5 framing byte for byte against a real Deye exchange; every
  model against a simulated logger (`tools/fake-logger.mjs`) answering with
  the register maps; the Gladys rules (categories, units, bounds) on every
  device; the widget against the SDK validator; the Docker image in the
  sandbox constraints of Gladys (read-only, 256 MB, no capability) against the
  simulated logger.
- Not checked: a real inverter. The sign conventions (grid, battery) and the
  scales come from ha-solarman's tested definitions and the manufacturers'
  documents; the high-voltage Deye three-phase, the Sofar and the Solis maps
  are the least proven.

## Limitations

- Read only, by choice: no work mode, battery or export setting.
- One inverter per installation of the integration.
- A logger serves few clients: another tool reading it at the same time may
  disturb both.
- Not supported yet: Deye string inverters, Sofar and Solis hybrids, Afore,
  KStar, Megarevo… (the register maps exist in ha-solarman: ask on the forum).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
node tools/fake-logger.mjs deye_hybrid 8899 1712345678   # a simulated logger
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

## Credits

- [pysolarmanv5](https://github.com/jmccrohan/pysolarmanv5) by Jonathan
  McCrohan (MIT): the Solarman V5 protocol, its frame layout and checksum, and
  the real Deye exchange used as a test fixture (issue #62).
- [ha-solarman](https://github.com/davidrapan/ha-solarman) by David Rapan and
  contributors (MIT): the register maps of the inverters, rewritten here as
  the few registers the integration reads.

## Disclaimer

Not affiliated with Solarman (IGEN Tech), Deye, Sunsynk, Sol-Ark, Sofar or
Solis. Their names are trademarks of their owners.

## License

[Apache-2.0](LICENSE).
