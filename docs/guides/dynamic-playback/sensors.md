# Sensors

Defining sensors in a SMIL playlist is designed to be robust, future-proof, and human-readable. Below is an example
for already integrated Nexmosphere sensors.

## Using Nexmosphere sensors

Nexmosphere supports a large number of industry-grade sensors and provides a great response time.

### Read More About Nexmosphere

Link to Nexmosphere documentation, website, and other related resources.

You can define multiple sensors attached to the
the [supported device](https://docs.signageos.io/hc/en-us/articles/4405231196946).

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

**Sensor definition:**

```xml

<sensor type="rfid" id="rfid1" driver="nexmosphere">
    <!-- Port on Nexmosphere controller where the antenna is attached to -->
    <option name="address">004</option>
</sensor>
```

**Sensor actions:**

- `picked` for the action when you pick up the RFID tag from the antenna

- `placed` for the action when you put down the RFID tag on the antenna

```xml

<trigger id="trigger1" condition="or">
    <condition
            origin="rfid1" <!-- Reference to the <sensor id="rfid1"> -->
    data="5" <!-- Reference to the RFID tag ID you are using -->
    action="picked" <!-- Reference to the user action with the RFID tag -->
    />
</trigger>
```

### Buttons [IN PROGRESS]

This sensor is under integration; the API might change.

**Sensor definition:**

This sensor is under integration; the API might change.

```xml

<sensor type="button" id="button1" driver="nexmosphere">
    <!-- Port on the Nexmosphere controller where the button is attached -->
</sensor>
```

**Sensor actions:**

- `pressed` once you press the button and keep pressed
- `released` when you release the button

```xml

<trigger id="trigger1" condition="or">
    <condition origin="button1" <!-- Reference to the <sensor id="button1"> -->
    data="1" <!-- Reference to the button ID -->
    action="released" <!-- Reference to the user action  -->
    />
</trigger>
```
