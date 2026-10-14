# Solarman (Deye, Sofar, Solis)

Read a solar inverter fitted with a **Solarman Wi-Fi logger** (the "LSW-3"
stick sold with Deye, Sunsynk, Sol-Ark, Sofar, Solis and many other
inverters) in Gladys, over your local network: solar production per PV
input, house consumption, grid import and export, battery level and power,
energies of the day and meter indexes for the energy tab of Gladys, with a
dashboard widget, five scene triggers and a scene action. No account and no
cloud: Gladys talks to the logger directly with the Solarman V5 protocol
(TCP port 8899), the one the Solarman app uses. **Read only**: nothing is ever
written to the inverter.

> **Developed without the hardware: feedback welcome.** This integration was
> built against the published register maps of these inverters, a real
> exchange with a Deye logger and a simulated logger, not against a real
> inverter. If something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-solarman/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- An inverter with a Solarman Wi-Fi logger whose serial number starts with
  17, 21, 23, 27 or 40 (10 digits, on the logger label), connected to the
  same network as Gladys. Supported models:
  - **Deye hybrid, single-phase** (SUN-…K-SG0xLP1, and the Sunsynk and
    Sol-Ark built on it);
  - **Deye hybrid, three-phase**, low-voltage battery (SG04LP3) or
    high-voltage battery (SG01HP3);
  - **Deye microinverter** (SUN-M, SUN600/800/2000G3…);
  - **Sofar G3** (KTLX-G3 three-phase, without battery);
  - **Solis single-phase** (1P…-5G, without battery).
- A fixed IP address for the logger (a DHCP reservation in your router).

## Set up

1. In Gladys, go to **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-solarman`.
2. In the configuration of the integration, fill in:
   - **Logger IP address**;
   - **Logger serial number**: the 10 digits on the logger label, not the
     serial number of the inverter;
   - **Inverter model**;
   - **PV inputs used**: the number of panel strings wired to the inverter
     (one production per input);
   - optionally the **Reading interval (s)** (30 s by default, 15 s
     minimum), the **Export threshold (W)** of the export triggers, the
     **Modbus address** (1 in almost every case), the **Logger TCP port**
     (8899) and the **Language of the feature names**.
3. Run **Test the connection** in the Configuration tab: it reads the inverter
   once and answers with what it sees, or with the reason of the failure.
4. Open the **Discovery** tab and add the inverter. Its values arrive right
   away, then at every reading.

## The Gladys device

One device per inverter, named after its brand (for example "Solar inverter
Deye"). The features depend on the model: a model without battery has no
battery feature, a microinverter has no grid nor house feature.

| Feature                 | Unit | What it is                                                   |
| ----------------------- | ---- | ------------------------------------------------------------ |
| Solar production        | W    | production of the panels, all inputs together                |
| PV1 production, PV2…    | W    | production of each PV input (when there is more than one)    |
| Production today        | kWh  | energy produced since midnight                               |
| Total production        | kWh  | production index of the inverter (energy tab of Gladys)      |
| Grid power              | W    | positive when importing, negative when exporting             |
| Grid import today       | kWh  | energy bought from the grid since midnight                   |
| Grid export today       | kWh  | energy sent to the grid since midnight                       |
| Grid import index       | kWh  | grid import meter: Gladys turns it into consumption and cost |
| Grid export index       | kWh  | grid export meter                                            |
| House consumption       | W    | power used by the house                                      |
| House consumption today | kWh  | energy used by the house since midnight                      |
| Battery level           | %    | state of charge                                              |
| Battery charge          | W    | power going into the battery                                 |
| Battery discharge       | W    | power coming out of the battery                              |
| Battery charge index    | kWh  | energy charged since the installation                        |
| Battery discharge index | kWh  | energy discharged since the installation                     |
| Battery temperature     | °C   |                                                              |
| Inverter temperature    | °C   |                                                              |
| Inverter state          | text | Standby, Starting, Normal, Alarm, Fault, or Not answering    |

**Energy tab.** Only the **Grid import index** is counted by Gladys as
consumption (with its cost): it is what your supplier bills. The house
consumption is not, since the energy produced by your panels and used at home
is free; the production index feeds the production of Gladys. If the house is
also read by a smart meter (Linky…), keep that meter as the main one.

**At night.** The logger of an inverter without battery is powered by the
panels: it goes off at night. After three readings without answer, the state
becomes "Not answering", the solar production falls to 0 W and the other
values stay as they were; everything comes back on its own in the morning. The
integration is also shown as disconnected meanwhile.

## Dashboard widget

**Solar** shows at a glance:

- **Solar**: the production of the panels;
- **House**: the consumption of the house;
- **Grid import** or **Grid export**: the grid exchange, with its direction;
- **Battery**: the battery level, and **Charging** or **Discharging** with the
  battery power;
- **Today**: the production of the day;
- the state of the inverter and the time of the last reading.

Add it from the dashboard editor ("Integration widget" box). Before the
inverter is added in Gladys, the widget says so.

## Scenes

### Triggers

- **Battery full**: the battery reaches 100 % (once; it fires again after
  dropping to 95 %). Variable: the battery level.
- **Battery drops to…**: the battery level goes down to the chosen threshold
  (10 to 50 %) or below. It fires again once the level went 5 points above the
  threshold. Variable: the battery level.
- **Inverter fault**: the inverter goes into alarm or fault (choose one or
  leave empty for both). Variables: the state and its code.
- **Grid export started**: the house starts sending more than the **Export
  threshold (W)** of the configuration to the grid. Variable: the exported
  power.
- **Grid export stopped**: the export falls below half of that threshold.
  Variable: the exported power (negative when importing).

Nothing fires on the first reading after a start: a battery already low is a
state, not an event. To react to a level ("production above 2 kW"), use the
features of the device in a "Device state" trigger.

### Actions

- **Read the inverter status**: reads the inverter and gives the following
  actions a **Status sentence** to send ("Solar 2,340 W, house 1,200 W,
  battery 85 % (charging 800 W), grid export 340 W; 12.4 kWh produced today;
  state Normal."), and the solar production, house consumption, grid power,
  battery level and production of the day as numbers. The sentence is written
  in the language of the configuration.

### Scene ideas

- **Use the surplus**: when **Grid export started**, turn on the water heater
  or the pool pump; when **Grid export stopped**, turn it off.
- **Save the battery**: when the **Battery drops to…** 20 %, send a message
  and turn off the heaters that can wait.
- **Evening report**: every day at 9 pm, **Read the inverter status** and send
  the status sentence to your phone.
- **Watch the inverter**: when there is an **Inverter fault**, send a message
  with the state.

## Troubleshooting

- **Test the connection says "cannot connect"**: check the IP address of the
  logger and that Gladys is on the same network. The logger must answer on
  port 8899 (some new "LSE" loggers do not offer it).
- **"The logger does not answer"**: the serial number is wrong (the logger
  stays silent), or the logger is off (night, inverter without battery).
- **"The logger answers, but not the inverter"**: check the **Modbus
  address** (1 by default) and the cable between the logger and the inverter.
- **"The inverter refuses the registers read"**: the chosen model does not
  match the inverter.
- **Values that look wrong** (a power 10 times too small, a reversed sign):
  check the model, especially low or high voltage battery for the Deye
  three-phase hybrids, and tell us on the forum with a screenshot of the
  Solarman app.
- More details in the logs of the integration, with `LOG_LEVEL=debug`.

## Limits

- Read only: no setting of the inverter can be changed (work mode, battery
  charge, export limit), by choice, for the safety of the battery and the
  grid.
- One inverter per installation of the integration.
- The logger serves few clients at once: Gladys keeps one connection and
  reads at most every 15 seconds. Another local tool reading the same logger
  at the same time may get errors.
- The Solarman cloud is not used and keeps working as before.
- The house consumption total has no meter index in Gladys (only today's
  value), so that it is never counted a second time in the energy tab.
- Other models (Deye string inverters, Sofar hybrids, Solis hybrids,
  Afore, KStar, Megarevo…) are not supported yet: ask on the forum.

Register maps after [ha-solarman](https://github.com/davidrapan/ha-solarman)
(MIT) and the V5 protocol after
[pysolarmanv5](https://github.com/jmccrohan/pysolarmanv5) (MIT). Not
affiliated with Solarman, Deye, Sofar or Solis.
