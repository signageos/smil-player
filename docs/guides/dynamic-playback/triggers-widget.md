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

### Define region for triggered content

Read more about regions for triggered content in
the [Triggers article](https://docs.signageos.io/hc/en-us/articles/4405241368978).

```xml

<layout>
    <root-layout height="1080" width="1920"/>
    <region regionName="video" left="10" top="10" width="1280" height="720" z-index="1"
            mediaAlign="topLeft">
        <region regionName="video1" left="0" top="0" width="1280" height="720" z-index="1"
        />
    </region>
</layout>
```

### Define content triggered by the keyboard trigger

```xml

<par>
    <seq begin="trigger1" repeatCount="indefinite">
        <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg"
             dur="5s" fit="hidden" region="video">
        </img>
        <img src="https://demo.signageos.io/smil/zones/files/img_3.jpg"
             dur="5s" fit="hidden" region="video">
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




