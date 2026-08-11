---
sidebar_position: 5
---

# Sensors

Defining sensors in a SMIL playlist is designed to be robust, future-proof, and human-readable. Below is an example
for already integrated Nexmosphere sensors.

See [Triggers and Interactivity](overview.md) for the shared trigger model (the `trigger` id prefix, sub-regions,
condition syntax).

## Using Nexmosphere sensors

Nexmosphere supports a large number of industry-grade sensors and provides a great response time.

### Read More About Nexmosphere

See the [Nexmosphere website](https://nexmosphere.com/) for sensor hardware documentation.

You can define multiple sensors attached to
the [supported device](https://docs.signageos.io/hc/en-us/articles/4405231196946).

The Nexmosphere controller is expected on serial port `/dev/ttyUSB0` by default; use the `serialPortDevice` applet
configuration option to point the player at a different port (e.g. `COM3`). Currently the supported sensor type is
the Nexmosphere **RFID antenna** (`type="rfid"` with `driver="nexmosphere"`); other sensor definitions are ignored.
The `address` option is required — a sensor without it is skipped.

```xml

<head>
    <sensors>
        <sensor type="rfid" id="rfid1" driver="nexmosphere">
            <!-- Port on Nexmosphere controller where the antenna is attached to -->
            <option name="address">004</option>
        </sensor>
        <sensor type="rfid" id="rfid2" driver="nexmosphere">
            <!-- Port on Nexmosphere controller where the antenna is attached to -->
            <option name="address">005</option>
        </sensor>
    </sensors>
</head>
```

Once you define sensors, you can use them for triggering playlists:

```xml

<head>
    <triggers>
        <trigger id="trigger1" condition="or">
            <condition origin="rfid1" data="1" action="picked"/>
        </trigger>
        <trigger id="trigger2" condition="or">
            <condition origin="rfid1" data="2" action="picked"/>
        </trigger>
    </triggers>

</head>
```

The code above will

- trigger `<par begin="trigger1"> or <seq begin="trigger1">`
- whenever the `rfid` antenna (`<condition origin="rfid1" ...`)
- emits an RFID tag with ID 1 (`<condition ... data="1"`)
- was picked up (`<condition ... action="picked"`).

## Available sensors and related actions

### RFID Antenna

**Sensor actions:**

- `picked` for the action when you pick up the RFID tag from the antenna
- `placed` for the action when you put down the RFID tag on the antenna

Both actions use the same `<sensor>` and `<condition>` shape shown above — only `action` (and optionally `data`)
changes:

```xml

<trigger id="trigger1" condition="or">
    <!-- origin: reference to the <sensor id="rfid1">;
         data: the RFID tag ID you are using;
         action: the user action with the RFID tag -->
    <condition origin="rfid1" data="5" action="picked"/>
</trigger>
```

Every RFID tag that can be picked up or placed must be declared in a trigger condition. Note that for sensor triggers
the `dur` attribute on the triggered playlist is ignored — use `repeatCount`, or let the opposite action (e.g.
`placed` after `picked`) end the content.
