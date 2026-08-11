---
sidebar_position: 4
---

# Triggers using widgets

This functionality allows a user to interact with a widget embedded in an iframe to trigger playback content
dynamically in different regions of the playlist.
The widget communicates with the SMIL player using **CustomEvent** interface and **dispatchEvent** function.

#### Trigger setup

```xml

<triggers>
    <trigger id="trigger1" condition="or">
        <condition origin="widget" data="data_trigger_1"/>
    </trigger>
    <trigger id="trigger2" condition="or">
        <condition origin="widget" data="data_trigger_2"/>
    </trigger>
    <trigger id="trigger3" condition="or">
        <condition origin="widget" data="data_trigger_3"/>
    </trigger>
</triggers>
```

- **id** = unique identifier for the trigger, used to reference the trigger in the playlist
- **condition** = logical operator to combine multiple conditions
- **origin** = marks trigger as a widget trigger to use sync widget functionality
- **data** = trigger identifier sent from the widget

For sub-region setup see [Sub-regions](overview.md#sub-regions), for trigger duration (`dur`/`repeatCount`) see
[Trigger duration](overview.md#trigger-duration), and for cancellation (`end`) see
[Cross-trigger cancellation](overview.md#cross-trigger-cancellation).

### Define content triggered by the widget trigger

```xml

<par>
    <seq begin="trigger1" repeatCount="indefinite">
        <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg"
             dur="5s" region="video">
        </img>
        <img src="https://demo.signageos.io/smil/zones/files/img_3.jpg"
             dur="5s" region="video">
        </img>
    </seq>
</par>
```

### Function to send information from the widget to the SMIL player

- The widget sends the trigger data identifier to the SMIL player using the **CustomEvent** interface and
  **dispatchEvent** function. Using the name of the event **sosEvent** is mandatory.

```javascript
function sendMessage(data) {
	// data has to be one of the data fields defined in the SMIL file in triggers definition,
	// for example "data_trigger_1"
	const event = new CustomEvent('sosEvent', {
		detail: data,
	});
	window.parent.dispatchEvent(event);
}
```

The `detail` value must be a **plain string** matching one of the `data` values declared in `<triggers>` — object
payloads are ignored. Repeated events for a trigger that is already playing are idempotent (they extend the trigger's
`dur` countdown rather than starting a second copy).
